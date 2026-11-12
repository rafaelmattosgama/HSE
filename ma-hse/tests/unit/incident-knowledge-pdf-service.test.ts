import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import {
  extractIncidentPdf,
  INCIDENT_KNOWLEDGE_MAX_PDF_BYTES,
} from "@/lib/services/incident-knowledge-pdf-service";

function createPdf(text: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.text(text);
    document.end();
  });
}

describe("incident knowledge PDF extraction", () => {
  it("extracts text with page evidence and a stable SHA-256 digest", async () => {
    const pdf = await createPdf("S-EWO 05 MAAP 03/2026\nCause 6.5 - Failure/breakage");

    const result = await extractIncidentPdf(pdf);

    expect(result.pageCount).toBe(1);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.totalTextCharacters).toBeGreaterThan(0);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].text).toContain("S-EWO 05 MAAP 03/2026");
    expect(result.pages[0].text).toContain("Cause 6.5 - Failure/breakage");
    expect(result.requiresOcr).toBe(true);
  });

  it("rejects a file without a PDF header", async () => {
    await expect(extractIncidentPdf(Buffer.from("not a pdf"))).rejects.toMatchObject({
      code: "INVALID_PDF",
    });
  });

  it("rejects files above the upload size limit before parsing", async () => {
    const oversized = Buffer.alloc(INCIDENT_KNOWLEDGE_MAX_PDF_BYTES + 1);
    Buffer.from("%PDF-").copy(oversized);

    await expect(extractIncidentPdf(oversized)).rejects.toMatchObject({
      code: "PDF_TOO_LARGE",
    });
  });
});
