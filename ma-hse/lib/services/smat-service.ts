import ExcelJS from "exceljs";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";

type PdfDocument = ReturnType<typeof createPdfDocument>;

type ExportAttachment = {
  fileName: string;
  contentType: string;
  fileKey: string;
  caption?: string | null;
};

type LoadedAttachment = ExportAttachment & {
  buffer: Buffer;
  extension: "png" | "jpeg" | null;
};

type SmatPdfAudit = {
  id: string;
  plant: {
    name: string;
    code: string;
  };
  auditorName: string;
  auditDate: Date;
  startTimeText?: string | null;
  endTimeText?: string | null;
  areaExamined?: string | null;
  locationExamined?: string | null;
  peopleObservedCount: number;
  peopleInvolvedCount: number;
  peopleSafeCount: number;
  peopleUnsafeCount: number;
  workConditionsSafeCount: number;
  workConditionsUnsafeCount: number;
  reactionsPositiveCount: number;
  reactionsNegativeCount: number;
  safeActs: unknown;
  safeConditions: unknown;
  unsafeActs: unknown;
  unsafeConditions: unknown;
  answer1?: string | null;
  answer2?: string | null;
  answer3?: string | null;
  answer4?: string | null;
  answer5?: string | null;
  answer6?: string | null;
  notes?: string | null;
  communication?: {
    id: string;
    type: string;
    status: string;
    reporterName?: string | null;
  } | null;
  attachments: ExportAttachment[];
  actionLinks: Array<{
    action: {
      title: string;
      status: string;
      ownerUser?: {
        name: string;
      } | null;
    };
  }>;
};

const REPORT_TITLE = "SMAT - Safety Management Audit Training";
const COMPANY = "MA Srl";
const BRAND = "#00336f";
const BLUE = "#007db8";
const GREEN = "#43a22d";
const TEAL = "#008b7a";
const RED = "#c5202b";
const YELLOW = "#f0b700";
const INK = "#0f172a";
const MUTED = "#526171";
const SOFT = "#f8fafc";
const PANEL = "#cfd7df";
const WHITE = "#ffffff";
const CONTENT_X = 40;
const CONTENT_WIDTH = 515;
const CONTENT_TOP = 132;
const CONTENT_BOTTOM = 780;

const QUESTION_TEXTS = [
  "Qual é a tarefa mais perigosa que tem de fazer e quais são os principais riscos envolvidos?",
  "Onde estão as regras e procedimentos para o seu trabalho e onde pode encontrar as informações?",
  "Com quem fala se encontrar novos riscos no seu local de trabalho ou se tiver ideias de melhoria?",
  "Quando foi a última vez que falou sobre segurança e que informações recebeu?",
  "Porque é que a segurança é importante para si e para a nossa empresa?",
  "Como envolve os seus colegas na prevenção de riscos?",
] as const;

const OBSERVATION_SECTIONS = [
  { code: "AS", title: "Ato Seguro", color: GREEN },
  { code: "CS", title: "Condição Segura", color: TEAL },
  { code: "AI", title: "Ato Inseguro", color: BLUE },
  { code: "CI", title: "Condição Insegura", color: RED },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  A: "A - Local de trabalho",
  B: "B - Posição das pessoas",
  C: "C - Comportamento perigoso",
  D: "D - EPI",
  E: "E - Ferramentas & equipamentos",
  F: "F - Reações das pessoas",
};

function toValidDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatDate(value: unknown, fallback = "-") {
  return toValidDate(value)?.toISOString().slice(0, 10) ?? fallback;
}

function formatDateTime(value: unknown, fallback = "-") {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function getDisplayValue(value: unknown, fallback = "-") {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || fallback;
  }
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function inferImageExtension(input: ExportAttachment) {
  const contentType = input.contentType.toLowerCase();
  if (contentType.includes("png")) return "png" as const;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpeg" as const;
  const fileName = input.fileName.toLowerCase();
  if (fileName.endsWith(".png")) return "png" as const;
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "jpeg" as const;
  return null;
}

async function loadAttachmentBuffers(attachments: ExportAttachment[]) {
  const loaded = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      buffer: await StorageService.getObjectBuffer({ key: attachment.fileKey }),
      extension: inferImageExtension(attachment),
    })),
  );

  return loaded.filter((entry) => entry.buffer.length > 0);
}

function pdfBufferFromDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function buildSmatReference(audit: Pick<SmatPdfAudit, "id" | "auditDate">) {
  return `SMAT-${formatDate(audit.auditDate).replaceAll("-", "")}-${audit.id.slice(0, 8).toUpperCase()}`;
}

function getPlantLabel(plant: SmatPdfAudit["plant"]) {
  return `${plant.name} (${plant.code.toUpperCase()})`;
}

function getTimeRange(audit: Pick<SmatPdfAudit, "startTimeText" | "endTimeText">) {
  const start = getDisplayValue(audit.startTimeText);
  const end = getDisplayValue(audit.endTimeText);
  if (start === "-" && end === "-") return "-";
  return `${start} -> ${end}`;
}

function fitText(value: unknown, maxLength = 180) {
  const text = getDisplayValue(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function drawPlatformLogo(doc: PdfDocument, x: number, y: number, scale = 1) {
  const s = (value: number) => value * scale;
  doc.roundedRect(x, y, s(64), s(40), s(10)).fillAndStroke("#f8fbff", "#b7c7dd");
  doc.roundedRect(x + s(11), y + s(16), s(42), s(12), s(4)).strokeColor(BRAND).lineWidth(s(1.1)).stroke();
  doc.fillColor(BRAND).fontSize(s(6.5)).font("Helvetica-Bold").text("MA", x + s(24), y + s(19), {
    width: s(18),
    align: "center",
  });
  doc.fillColor(BRAND).fontSize(s(6.8)).font("Helvetica").text("I N T E G R A T E D   S A F E T Y   P L A T F O R M", x + s(78), y + s(3), {
    width: s(180),
  });
  doc.fontSize(s(14)).font("Helvetica-Bold").text("MAx Safety", x + s(78), y + s(18), {
    width: s(140),
  });
  doc.strokeColor(INK).fillColor(INK).font("Helvetica").lineWidth(1);
}

function drawReportHeader(doc: PdfDocument, input: {
  plant: string;
  generated: string;
  reference: string;
  auditor: string;
}) {
  doc.rect(0, 0, doc.page.width, 112).fill(SOFT);
  doc.rect(0, 111, doc.page.width, 1).fill("#dbe3ee");
  drawPlatformLogo(doc, 26, 34, 0.82);
  doc.fillColor(BRAND).fontSize(15).font("Helvetica-Bold").text(REPORT_TITLE, 188, 26, {
    width: 220,
    height: 46,
    align: "center",
  });

  const rightX = 418;
  const rightWidth = 138;
  doc.fillColor(INK).fontSize(7.5).font("Helvetica-Bold").text(`Plant: ${fitText(input.plant, 42)}`, rightX, 26, {
    width: rightWidth,
    align: "right",
  });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`Generated: ${input.generated}`, rightX, 46, {
    width: rightWidth,
    align: "right",
  });
  doc.fillColor(INK).fontSize(7).font("Helvetica-Bold").text(`Reference: ${fitText(input.reference, 40)}`, rightX, 64, {
    width: rightWidth,
    align: "right",
  });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`Auditor: ${fitText(input.auditor, 44)}`, rightX, 84, {
    width: rightWidth,
    align: "right",
  });
  doc.fillColor(INK).font("Helvetica");
}

function drawReportFooter(doc: PdfDocument, input: {
  generated: string;
  page: number;
  totalPages: number;
}) {
  doc.rect(CONTENT_X, 796, CONTENT_WIDTH, 1).fill("#dbe3ee");
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(
    `${COMPANY} | SMAT | Generated: ${input.generated}`,
    CONTENT_X,
    810,
    { width: 420, align: "left" },
  );
  doc.fillColor(INK).fontSize(7).font("Helvetica-Bold").text(`${input.page}/${input.totalPages}`, 510, 810, {
    width: 45,
    align: "right",
  });
  doc.fillColor(INK).font("Helvetica");
}

function applyPageChrome(doc: PdfDocument, input: {
  plant: string;
  generated: string;
  reference: string;
  auditor: string;
}) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    drawReportHeader(doc, input);
    drawReportFooter(doc, {
      generated: input.generated,
      page: index + 1,
      totalPages: range.count,
    });
  }
}

function addReportPage(doc: PdfDocument) {
  doc.addPage();
  doc.y = CONTENT_TOP;
}

function ensurePageSpace(doc: PdfDocument, height: number) {
  if (doc.y + height > CONTENT_BOTTOM) {
    addReportPage(doc);
  }
}

function drawSectionTitle(doc: PdfDocument, title: string, color = BRAND) {
  ensurePageSpace(doc, 38);
  const y = doc.y;
  doc.roundedRect(CONTENT_X, y, CONTENT_WIDTH, 24, 8).fill(color);
  doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold").text(title, CONTENT_X + 12, y + 7, {
    width: CONTENT_WIDTH - 24,
  });
  doc.fillColor(INK).font("Helvetica");
  doc.y = y + 36;
}

function drawFieldGrid(doc: PdfDocument, entries: Array<[string, string]>, columns = 2) {
  const gap = 18;
  const cardWidth = columns === 2 ? (CONTENT_WIDTH - gap) / 2 : CONTENT_WIDTH;
  const rows: Array<Array<[string, string]>> = [];
  for (let index = 0; index < entries.length; index += columns) {
    rows.push(entries.slice(index, index + columns));
  }

  rows.forEach((row) => {
    const cardHeight = Math.max(
      52,
      ...row.map(([label, value]) => {
        const labelHeight = doc.heightOfString(label.toUpperCase(), { width: cardWidth - 24 });
        const valueHeight = doc.heightOfString(value || "-", { width: cardWidth - 24 });
        return labelHeight + valueHeight + 28;
      }),
    );
    ensurePageSpace(doc, cardHeight + 10);
    const y = doc.y;
    let x = CONTENT_X;

    row.forEach(([label, value]) => {
      const labelHeight = doc.heightOfString(label.toUpperCase(), { width: cardWidth - 24 });
      doc.roundedRect(x, y, cardWidth, cardHeight, 8).fillAndStroke(SOFT, PANEL);
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(label.toUpperCase(), x + 12, y + 10, {
        width: cardWidth - 24,
      });
      doc.fillColor(INK).fontSize(10.5).font("Helvetica").text(value || "-", x + 12, y + 17 + labelHeight, {
        width: cardWidth - 24,
      });
      x += cardWidth + gap;
    });

    doc.y = y + cardHeight + 10;
  });

  doc.fillColor(INK);
}

function drawMetricCards(doc: PdfDocument, entries: Array<[string, string]>) {
  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;

  entries.forEach(([label, value], index) => {
    const column = index % 3;
    if (column === 0) ensurePageSpace(doc, 72);
    const rowY = doc.y;
    const x = CONTENT_X + column * (cardWidth + gap);
    doc.roundedRect(x, rowY, cardWidth, 62, 8).fillAndStroke(SOFT, PANEL);
    doc.fillColor(MUTED).fontSize(7.2).font("Helvetica-Bold").text(label.toUpperCase(), x + 10, rowY + 10, {
      width: cardWidth - 20,
      height: 18,
    });
    doc.fillColor(BRAND).fontSize(17).font("Helvetica-Bold").text(value, x + 10, rowY + 32, {
      width: cardWidth - 20,
    });

    if (column === 2 || index === entries.length - 1) {
      doc.y = rowY + 72;
    }
  });

  doc.fillColor(INK).font("Helvetica");
}

function splitTextToFit(doc: PdfDocument, text: string, width: number, maxHeight: number) {
  if (doc.heightOfString(text, { width }) <= maxHeight) {
    return { segment: text, rest: "" };
  }

  let low = 0;
  let high = text.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid).trim();
    if (candidate && doc.heightOfString(candidate, { width }) <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let splitAt = text.lastIndexOf("\n", best);
  if (splitAt < Math.floor(best * 0.6)) {
    splitAt = text.lastIndexOf(" ", best);
  }
  if (splitAt <= 0) splitAt = Math.max(1, best);

  return {
    segment: text.slice(0, splitAt).trim(),
    rest: text.slice(splitAt).trim(),
  };
}

function drawTextCard(doc: PdfDocument, input: {
  label: string;
  text: string;
  accentColor?: string;
}) {
  let remaining = getDisplayValue(input.text);
  let continuation = false;

  while (remaining) {
    ensurePageSpace(doc, 74);
    const y = doc.y;
    const labelHeight = input.accentColor ? 26 : 18;
    const textY = input.accentColor ? y + 38 : y + 30;
    const textWidth = CONTENT_WIDTH - 24;
    const availableTextHeight = Math.max(38, CONTENT_BOTTOM - textY - 16);
    const { segment, rest } = splitTextToFit(doc, remaining, textWidth, availableTextHeight);
    const textHeight = doc.heightOfString(segment || "-", { width: textWidth });
    const height = Math.max(74, labelHeight + textHeight + 34);

    doc.roundedRect(CONTENT_X, y, CONTENT_WIDTH, height, 8).fillAndStroke(WHITE, PANEL);
    if (input.accentColor) {
      doc.roundedRect(CONTENT_X, y, CONTENT_WIDTH, 26, 8).fill(input.accentColor);
      doc.fillColor(WHITE).fontSize(9).font("Helvetica-Bold").text(
        continuation ? `${input.label} (continued)` : input.label,
        CONTENT_X + 12,
        y + 8,
        { width: textWidth },
      );
    } else {
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(
        (continuation ? `${input.label} (continued)` : input.label).toUpperCase(),
        CONTENT_X + 12,
        y + 12,
        { width: textWidth },
      );
    }
    doc.fillColor(INK).fontSize(10).font("Helvetica").text(segment || "-", CONTENT_X + 12, textY, {
      width: textWidth,
      lineGap: 2,
    });
    doc.y = y + height + 10;
    remaining = rest;
    continuation = true;
  }

  doc.fillColor(INK).font("Helvetica");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeObservations(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): Array<{ category: string; description: string }> => {
    if (typeof entry === "string") {
      const description = entry.trim();
      return description ? [{ category: "", description }] : [];
    }

    if (!isRecord(entry)) return [];

    const description = getDisplayValue(entry.description ?? entry.text ?? entry.value, "").trim();
    if (!description) return [];
    return [{
      category: getDisplayValue(entry.category, ""),
      description,
    }];
  });
}

function getObservationRows(audit: SmatPdfAudit, code: "AS" | "CS" | "AI" | "CI") {
  if (code === "AS") return normalizeObservations(audit.safeActs);
  if (code === "CS") return normalizeObservations(audit.safeConditions);
  if (code === "AI") return normalizeObservations(audit.unsafeActs);
  return normalizeObservations(audit.unsafeConditions);
}

function drawObservationSection(doc: PdfDocument, audit: SmatPdfAudit, section: typeof OBSERVATION_SECTIONS[number]) {
  drawSectionTitle(doc, `${section.code} - ${section.title}`, section.color);
  const rows = getObservationRows(audit, section.code);
  if (rows.length === 0) {
    drawTextCard(doc, {
      label: `${section.code} - ${section.title}`,
      text: "No records.",
      accentColor: section.color,
    });
    return;
  }

  rows.forEach((row, index) => {
    const category = row.category ? CATEGORY_LABELS[row.category] ?? row.category : "";
    drawTextCard(doc, {
      label: `${section.code} - ${section.title} #${index + 1}`,
      text: [category ? `Category: ${category}` : "", row.description].filter(Boolean).join("\n\n"),
      accentColor: section.color,
    });
  });
}

function drawQuestions(doc: PdfDocument, audit: SmatPdfAudit) {
  drawSectionTitle(doc, "Questions", BRAND);
  const answers = [audit.answer1, audit.answer2, audit.answer3, audit.answer4, audit.answer5, audit.answer6];
  answers.forEach((answer, index) => {
    drawTextCard(doc, {
      label: `Question ${index + 1}`,
      text: [
        QUESTION_TEXTS[index],
        "",
        `Answer: ${getDisplayValue(answer)}`,
      ].join("\n"),
      accentColor: BLUE,
    });
  });
}

function drawActionsTable(doc: PdfDocument, audit: SmatPdfAudit) {
  drawSectionTitle(doc, "Actions linked to communication", BRAND);
  if (audit.actionLinks.length === 0) {
    drawTextCard(doc, {
      label: "Actions linked to communication",
      text: "No actions created from this audit.",
    });
    return;
  }

  const widths = [275, 100, 120];
  const headers = ["Action", "Status", "Owner"];

  function drawHeaderRow() {
    ensurePageSpace(doc, 32);
    const y = doc.y;
    let x = CONTENT_X;
    headers.forEach((header, index) => {
      doc.rect(x, y, widths[index], 24).fillAndStroke(BRAND, BRAND);
      doc.fillColor(WHITE).fontSize(8).font("Helvetica-Bold").text(header.toUpperCase(), x + 8, y + 8, {
        width: widths[index] - 16,
      });
      x += widths[index];
    });
    doc.y = y + 24;
  }

  drawHeaderRow();
  audit.actionLinks.forEach((entry) => {
    const row = [
      getDisplayValue(entry.action.title),
      getDisplayValue(entry.action.status),
      getDisplayValue(entry.action.ownerUser?.name),
    ];
    const rowHeight = Math.max(
      32,
      ...row.map((value, index) => doc.heightOfString(value, { width: widths[index] - 16 }) + 16),
    );
    if (doc.y + rowHeight > CONTENT_BOTTOM) {
      addReportPage(doc);
      drawHeaderRow();
    }

    const y = doc.y;
    let x = CONTENT_X;
    row.forEach((value, index) => {
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(WHITE, PANEL);
      doc.fillColor(INK).fontSize(9).font("Helvetica").text(value, x + 8, y + 8, {
        width: widths[index] - 16,
        lineGap: 2,
      });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  });
  doc.y += 10;
  doc.fillColor(INK).font("Helvetica");
}

function drawImageCard(doc: PdfDocument, attachment: LoadedAttachment) {
  ensurePageSpace(doc, 286);
  const y = doc.y;
  const label = attachment.caption ? `${attachment.fileName} - ${attachment.caption}` : attachment.fileName;
  doc.roundedRect(CONTENT_X, y, CONTENT_WIDTH, 270, 8).fillAndStroke(WHITE, PANEL);
  doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text("IMAGE ATTACHMENT", CONTENT_X + 12, y + 12, {
    width: CONTENT_WIDTH - 24,
  });
  doc.fillColor(INK).fontSize(9).font("Helvetica").text(label, CONTENT_X + 12, y + 28, {
    width: CONTENT_WIDTH - 24,
  });
  doc.rect(CONTENT_X + 12, y + 52, CONTENT_WIDTH - 24, 204).fillAndStroke(SOFT, PANEL);
  doc.image(attachment.buffer, CONTENT_X + 24, y + 64, {
    fit: [CONTENT_WIDTH - 48, 180],
    align: "center",
    valign: "center",
  });
  doc.y = y + 280;
  doc.fillColor(INK).font("Helvetica");
}

function drawAttachments(doc: PdfDocument, audit: SmatPdfAudit, attachmentBuffers: LoadedAttachment[]) {
  drawSectionTitle(doc, "Attachments", BRAND);
  if (audit.attachments.length === 0) {
    drawTextCard(doc, {
      label: "Attachments",
      text: "No attachments.",
    });
    return;
  }

  drawTextCard(doc, {
    label: "Attachment list",
    text: audit.attachments
      .map((attachment) => `${attachment.fileName}${attachment.caption ? ` - ${attachment.caption}` : ""}`)
      .join("\n"),
  });

  for (const attachment of attachmentBuffers.filter((entry) => entry.extension)) {
    try {
      drawImageCard(doc, attachment);
    } catch {
      drawTextCard(doc, {
        label: attachment.fileName,
        text: "Image preview not available.",
      });
    }
  }
}

export async function buildSmatPdf(
  audit: SmatPdfAudit,
  attachmentBuffers: LoadedAttachment[] = [],
  options: { generatedAt?: Date } = {},
) {
  const generated = formatDateTime(options.generatedAt ?? new Date());
  const plantLabel = getPlantLabel(audit.plant);
  const reference = buildSmatReference(audit);
  const doc = createPdfDocument({ margin: 40, size: "A4", bufferPages: true });
  doc.y = CONTENT_TOP;

  drawSectionTitle(doc, "General information", BRAND);
  drawFieldGrid(doc, [
    ["Plant", plantLabel],
    ["Auditor", audit.auditorName],
    ["Date", formatDate(audit.auditDate)],
    ["Area", getDisplayValue(audit.areaExamined)],
    ["Location", getDisplayValue(audit.locationExamined)],
    ["Time", getTimeRange(audit)],
    ["Reference", reference],
    ["Communication", audit.communication ? `${audit.communication.id} | ${audit.communication.type} | ${audit.communication.status}` : "-"],
  ]);

  drawSectionTitle(doc, "Observed counts", BRAND);
  drawMetricCards(doc, [
    ["People observed", String(audit.peopleObservedCount)],
    ["People involved", String(audit.peopleInvolvedCount)],
    ["People safe / unsafe", `${audit.peopleSafeCount} / ${audit.peopleUnsafeCount}`],
    ["Conditions safe / unsafe", `${audit.workConditionsSafeCount} / ${audit.workConditionsUnsafeCount}`],
    ["Reactions positive / negative", `${audit.reactionsPositiveCount} / ${audit.reactionsNegativeCount}`],
  ]);

  addReportPage(doc);
  drawObservationSection(doc, audit, OBSERVATION_SECTIONS[0]);
  drawObservationSection(doc, audit, OBSERVATION_SECTIONS[1]);
  drawQuestions(doc, audit);

  addReportPage(doc);
  drawObservationSection(doc, audit, OBSERVATION_SECTIONS[2]);
  drawObservationSection(doc, audit, OBSERVATION_SECTIONS[3]);

  addReportPage(doc);
  drawSectionTitle(doc, "Notes", BRAND);
  drawTextCard(doc, {
    label: "Notes",
    text: getDisplayValue(audit.notes),
    accentColor: YELLOW,
  });
  drawActionsTable(doc, audit);
  drawAttachments(doc, audit, attachmentBuffers);

  applyPageChrome(doc, {
    plant: plantLabel,
    generated,
    reference,
    auditor: audit.auditorName,
  });

  return pdfBufferFromDocument(doc);
}

export const SmatService = {
  async buildExport(auditId: string) {
    const audit = await prisma.smatAudit.findUniqueOrThrow({
      where: { id: auditId },
      include: {
        plant: true,
        auditorUser: { select: { name: true } },
        communication: {
          select: {
            id: true,
            type: true,
            reporterName: true,
            status: true,
          },
        },
        attachments: true,
        actionLinks: {
          include: {
            action: {
              include: {
                ownerUser: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const attachmentBuffers = await loadAttachmentBuffers(audit.attachments);

    const pdf = await buildSmatPdf(audit, attachmentBuffers);

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("SMAT");
    summary.columns = [
      { header: "Field", key: "field", width: 30 },
      { header: "Value", key: "value", width: 80 },
    ];

    [
      ["Plant", `${audit.plant.name} (${audit.plant.code.toUpperCase()})`],
      ["Auditor", audit.auditorName],
      ["Date", formatDate(audit.auditDate)],
      ["Area", audit.areaExamined ?? "-"],
      ["Location", audit.locationExamined ?? "-"],
      ["Start", audit.startTimeText ?? "-"],
      ["End", audit.endTimeText ?? "-"],
      ["Communication", audit.communication ? `${audit.communication.id} | ${audit.communication.type}` : "-"],
      ["People observed", audit.peopleObservedCount],
      ["People involved", audit.peopleInvolvedCount],
      ["People safe", audit.peopleSafeCount],
      ["People unsafe", audit.peopleUnsafeCount],
      ["Conditions safe", audit.workConditionsSafeCount],
      ["Conditions unsafe", audit.workConditionsUnsafeCount],
      ["Reactions positive", audit.reactionsPositiveCount],
      ["Reactions negative", audit.reactionsNegativeCount],
      ["Question 1", audit.answer1 ?? "-"],
      ["Question 2", audit.answer2 ?? "-"],
      ["Question 3", audit.answer3 ?? "-"],
      ["Question 4", audit.answer4 ?? "-"],
      ["Question 5", audit.answer5 ?? "-"],
      ["Question 6", audit.answer6 ?? "-"],
      ["Notes", audit.notes ?? "-"],
    ].forEach(([field, value]) => summary.addRow({ field, value }));

    const observations = workbook.addWorksheet("Observations");
    observations.columns = [
      { header: "Section", key: "section", width: 14 },
      { header: "Category", key: "category", width: 12 },
      { header: "Description", key: "description", width: 90 },
    ];

    const observationSections = [
      ["AS", audit.safeActs],
      ["CS", audit.safeConditions],
      ["AI", audit.unsafeActs],
      ["CI", audit.unsafeConditions],
    ] as const;

    observationSections.forEach(([section, rows]) => {
      const items = Array.isArray(rows) ? rows : [];
      if (items.length === 0) {
        observations.addRow({ section, category: "-", description: "No records" });
      } else {
        (items as Array<{ category: string; description: string }>).forEach((item) => {
          observations.addRow({ section, category: item.category, description: item.description });
        });
      }
    });

    const actions = workbook.addWorksheet("Actions");
    actions.columns = [
      { header: "Title", key: "title", width: 40 },
      { header: "Status", key: "status", width: 14 },
      { header: "Owner", key: "owner", width: 24 },
      { header: "Due date", key: "dueDate", width: 14 },
      { header: "Communication", key: "communication", width: 40 },
    ];

    if (audit.actionLinks.length === 0) {
      actions.addRow({ title: "No actions created from this audit", status: "-", owner: "-", dueDate: "-", communication: "-" });
    } else {
      audit.actionLinks.forEach((entry) => {
        actions.addRow({
          title: entry.action.title,
          status: entry.action.status,
          owner: entry.action.ownerUser.name,
          dueDate: formatDate(entry.action.dueDate),
          communication: entry.action.communicationId ?? "-",
        });
      });
    }

    const attachmentsSheet = workbook.addWorksheet("Attachments");
    attachmentsSheet.columns = [
      { header: "File name", key: "fileName", width: 40 },
      { header: "Caption", key: "caption", width: 50 },
      { header: "Content type", key: "contentType", width: 24 },
      { header: "Storage key", key: "fileKey", width: 70 },
    ];

    if (audit.attachments.length === 0) {
      attachmentsSheet.addRow({ fileName: "No attachments", caption: "-", contentType: "-", fileKey: "-" });
    } else {
      audit.attachments.forEach((attachment) => {
        attachmentsSheet.addRow({
          fileName: attachment.fileName,
          caption: attachment.caption ?? "-",
          contentType: attachment.contentType,
          fileKey: attachment.fileKey,
        });
      });
    }

    const imageEntries = attachmentBuffers.filter((entry) => entry.extension === "png" || entry.extension === "jpeg");
    if (imageEntries.length > 0) {
      const imagesSheet = workbook.addWorksheet("Images");
      imagesSheet.columns = [{ header: "Image", key: "image", width: 50 }];
      let rowStart = 1;
      for (const image of imageEntries) {
        imagesSheet.getCell(`A${rowStart}`).value = image.caption ? `${image.fileName} - ${image.caption}` : image.fileName;
        const imageId = workbook.addImage({
          base64: `data:image/${image.extension};base64,${image.buffer.toString("base64")}`,
          extension: image.extension as "png" | "jpeg" | "gif",
        });
        imagesSheet.addImage(imageId, {
          tl: { col: 0, row: rowStart },
          ext: { width: 320, height: 220 },
        });
        rowStart += 13;
      }
    }

    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    return {
      audit,
      pdf,
      xlsx: Buffer.from(xlsxBuffer as ArrayBuffer),
    };
  },
};
