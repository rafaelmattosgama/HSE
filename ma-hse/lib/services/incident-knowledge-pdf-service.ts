import { createHash } from "node:crypto";

export const INCIDENT_KNOWLEDGE_MAX_PDF_BYTES = 15 * 1024 * 1024;
export const INCIDENT_KNOWLEDGE_MAX_PDF_PAGES = 250;
export const INCIDENT_KNOWLEDGE_MAX_EXTRACTED_CHARS = 1_000_000;
export const INCIDENT_KNOWLEDGE_MIN_EXTRACTED_CHARS = 120;

export type ExtractedIncidentPdfPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedIncidentPdf = {
  sha256: string;
  pageCount: number;
  pages: ExtractedIncidentPdfPage[];
  totalTextCharacters: number;
  requiresOcr: boolean;
};

export class IncidentKnowledgePdfError extends Error {
  constructor(
    readonly code: "INVALID_PDF" | "PDF_TOO_LARGE" | "PDF_TOO_MANY_PAGES" | "PDF_TEXT_TOO_LARGE" | "PDF_PARSE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "IncidentKnowledgePdfError";
  }
}

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  hasEOL: boolean;
};

function assertPdfBuffer(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    throw new IncidentKnowledgePdfError("INVALID_PDF", "The uploaded file is not a valid PDF document.");
  }

  if (buffer.length > INCIDENT_KNOWLEDGE_MAX_PDF_BYTES) {
    throw new IncidentKnowledgePdfError("PDF_TOO_LARGE", "PDF files must be 15 MiB or smaller.");
  }
}

export function validateIncidentPdfBuffer(buffer: Buffer) {
  assertPdfBuffer(buffer);
}

export function getIncidentPdfSha256(buffer: Buffer) {
  assertPdfBuffer(buffer);
  return createHash("sha256").update(buffer).digest("hex");
}

function buildPageText(items: unknown[]) {
  const positioned = items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") return [];
    const value = item as { str: string; transform?: number[]; width?: number; hasEOL?: boolean };
    const text = value.str.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!text) return [];

    return [{
      text,
      x: Number(value.transform?.[4] ?? 0),
      y: Number(value.transform?.[5] ?? 0),
      width: Number(value.width ?? 0),
      hasEOL: Boolean(value.hasEOL),
    } satisfies PositionedText];
  });

  positioned.sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of positioned) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map(({ items: rowItems }) => {
      rowItems.sort((left, right) => left.x - right.x);
      let line = "";
      let previous: PositionedText | undefined;

      for (const item of rowItems) {
        const gap = previous ? item.x - (previous.x + previous.width) : 0;
        const separator = !line || line.endsWith(" ") ? "" : gap > 1.5 ? " " : " ";
        line += `${separator}${item.text}`;
        previous = item;
      }

      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

export async function extractIncidentPdf(buffer: Buffer): Promise<ExtractedIncidentPdf> {
  assertPdfBuffer(buffer);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    enableXfa: false,
    verbosity: 0,
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > INCIDENT_KNOWLEDGE_MAX_PDF_PAGES) {
      throw new IncidentKnowledgePdfError("PDF_TOO_MANY_PAGES", "PDF files must have 250 pages or fewer.");
    }

    const pages: ExtractedIncidentPdfPage[] = [];
    let totalTextCharacters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = buildPageText(content.items);
      if (totalTextCharacters + text.length > INCIDENT_KNOWLEDGE_MAX_EXTRACTED_CHARS) {
        throw new IncidentKnowledgePdfError("PDF_TEXT_TOO_LARGE", "The extracted PDF text exceeds the processing limit.");
      }
      totalTextCharacters += text.length;
      pages.push({ pageNumber, text });
      page.cleanup();
    }

    return {
      sha256: createHash("sha256").update(buffer).digest("hex"),
      pageCount: document.numPages,
      pages,
      totalTextCharacters,
      requiresOcr: totalTextCharacters < INCIDENT_KNOWLEDGE_MIN_EXTRACTED_CHARS,
    };
  } catch (error) {
    if (error instanceof IncidentKnowledgePdfError) throw error;
    throw new IncidentKnowledgePdfError("PDF_PARSE_FAILED", "The PDF could not be read. Please check the file or retry.");
  } finally {
    await loadingTask.destroy();
  }
}
