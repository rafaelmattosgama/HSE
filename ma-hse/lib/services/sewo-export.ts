import ExcelJS from "exceljs";
import { MasterDataEntityType } from "@prisma/client";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";
import { isSewoRootCauseAffirmative } from "@/lib/sewo-root-causes";
import {
  SIF_PSIF_EXPOSURE_KEYS,
  createEmptySifPsifDecision,
  getSifPsifResult,
  type SifPsifDecision,
  type SifPsifResult,
  type YesNoAnswer,
} from "@/lib/sewo-sif-psif";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import {
  formatSewoOccurrenceType,
  getSewoTemplateRecord,
  getSifPsifResultFromTemplateData,
} from "@/lib/services/sewo-validation-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { formatLocalizedSewoStatus, type SewoUi } from "@/lib/sewo-ui";
import { getReadableCommunicationCode, getReadableSewoCode } from "@/lib/record-code";

type PdfDocument = ReturnType<typeof createPdfDocument>;

type MasterDataNameRow = { id: string; name: string; sourceLanguage?: string | null };

async function localizeSewoMasterData<T extends {
  area?: MasterDataNameRow | null;
  communication?: {
    area?: MasterDataNameRow | null;
    workstation?: MasterDataNameRow | null;
  } | null;
}>(sewo: T, locale: string) {
  const areas = [sewo.area, sewo.communication?.area].filter(
    (row): row is MasterDataNameRow => Boolean(row),
  );
  const workstations = [sewo.communication?.workstation].filter(
    (row): row is MasterDataNameRow => Boolean(row),
  );
  const [localizedAreas, localizedWorkstations] = await Promise.all([
    localizeMasterDataRows(MasterDataEntityType.AREA, areas, locale),
    localizeMasterDataRows(MasterDataEntityType.WORKSTATION, workstations, locale),
  ]);
  const areaById = new Map(localizedAreas.map((row) => [row.id, row.name]));
  const workstationById = new Map(localizedWorkstations.map((row) => [row.id, row.name]));
  if (sewo.area) sewo.area.name = areaById.get(sewo.area.id) ?? sewo.area.name;
  if (sewo.communication?.area) {
    sewo.communication.area.name = areaById.get(sewo.communication.area.id) ?? sewo.communication.area.name;
  }
  if (sewo.communication?.workstation) {
    sewo.communication.workstation.name = workstationById.get(sewo.communication.workstation.id) ?? sewo.communication.workstation.name;
  }
}

const BRAND = "#002663";
const INK = "#0f172a";
const MUTED = "#64748b";
const PANEL = "#e2e8f0";
const SOFT = "#f8fafc";
const WHITE = "#ffffff";
const DANGER = "#b91c1c";

type ExportAttachment = {
  fileName: string;
  contentType: string;
  fileKey: string;
  caption?: string | null;
};

type CompleteReportOptions = {
  locale?: string;
  exportedBy?: string | null;
  includeXlsx?: boolean;
};

function pdfBufferFromDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function toValidDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatDate(value: unknown, fallback = "-") {
  return toValidDate(value)?.toISOString().slice(0, 10) ?? fallback;
}

function getDateSortTime(value: unknown) {
  return toValidDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
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

function formatAttachmentTitle(attachment: ExportAttachment) {
  return attachment.caption?.trim()
    ? `${attachment.fileName} - ${attachment.caption.trim()}`
    : attachment.fileName;
}

async function loadAttachmentBuffers(attachments: ExportAttachment[]) {
  const imageAttachments = attachments
    .map((attachment) => ({
      ...attachment,
      extension: inferImageExtension(attachment),
    }))
    .filter((attachment): attachment is ExportAttachment & { extension: "png" | "jpeg" } => attachment.extension !== null);

  const results = await Promise.allSettled(
    imageAttachments.map(async (attachment) => ({
      ...attachment,
      buffer: await StorageService.getObjectBuffer({ key: attachment.fileKey }),
    })),
  );

  return results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    if (result.value.buffer.length === 0) return [];
    return [result.value];
  });
}

function drawSectionTitle(doc: PdfDocument, title: string) {
  doc.moveDown(0.3);
  doc.roundedRect(40, doc.y, 515, 24, 8).fill(BRAND);
  doc
    .fillColor("#ffffff")
    .fontSize(11)
    .text(title, 52, doc.y - 18);
  doc.moveDown(1.4);
  doc.fillColor(INK);
}

function drawFieldGrid(doc: PdfDocument, entries: Array<[string, string]>, columns = 2) {
  const cardWidth = columns === 2 ? 248 : 515;
  const rows: Array<Array<[string, string]>> = [];
  for (let index = 0; index < entries.length; index += columns) {
    rows.push(entries.slice(index, index + columns));
  }

  let y = doc.y;

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
    y = doc.y;
    let x = 40;

    row.forEach(([label, value]) => {
      const labelHeight = doc.heightOfString(label.toUpperCase(), { width: cardWidth - 24 });
      doc.roundedRect(x, y, cardWidth, cardHeight, 10).fillAndStroke(SOFT, PANEL);
      doc.fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x + 12, y + 10, { width: cardWidth - 24 });
      doc.fillColor(INK).fontSize(11).text(value || "-", x + 12, y + 16 + labelHeight, { width: cardWidth - 24 });
      x += cardWidth + 18;
    });

    doc.y = y + cardHeight + 10;
  });

  doc.fillColor(INK);
}

function drawParagraphCard(doc: PdfDocument, label: string, text: string) {
  const startY = doc.y;
  const height = Math.max(78, doc.heightOfString(text || "-", { width: 487, align: "left" }) + 34);
  doc.roundedRect(40, startY, 515, height, 12).fillAndStroke(SOFT, PANEL);
  doc.fillColor(MUTED).fontSize(8).text(label.toUpperCase(), 52, startY + 12);
  doc.fillColor(INK).fontSize(10).text(text || "-", 52, startY + 26, { width: 491 });
  doc.y = startY + height + 10;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function getDisplayValue(value: unknown, fallback: string) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || fallback;
  }

  if (value === null || value === undefined) return fallback;
  return String(value);
}

function worksheetName(value: string) {
  return value.replaceAll(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Sheet";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getReadableText(values: unknown[], fallback: string) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized && !isUuid(normalized)) return normalized;
  }
  return fallback;
}

function toYesNoAnswer(value: unknown): YesNoAnswer {
  if (value === "YES" || value === true) return "YES";
  if (value === "NO" || value === false) return "NO";
  return "";
}

function getSifPsifResultLabel(result: SifPsifResult, ui: SewoUi) {
  if (result === "SIF") return ui.sifResult;
  if (result === "PSIF") return ui.psifResult;
  if (result === "NO_PSIF") return ui.noPsifResult;
  return ui.pendingResult;
}

function ensurePageSpace(doc: PdfDocument, height: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

function drawSummaryHeader(doc: PdfDocument, input: {
  title: string;
  referenceLabel: string;
  reference: string;
  plantLabel: string;
  generatedOnLabel: string;
}) {
  doc.rect(0, 0, doc.page.width, 112).fill("#f8fafc");
  doc.rect(0, 111, doc.page.width, 1).fill("#dbe3ee");
  drawPlatformLogo(doc, 26, 34, 0.82);
  doc.fillColor(BRAND).fontSize(15).font("Helvetica-Bold").text("Safety EWO - Summary Report", 198, 27, {
    width: 200,
    height: 40,
    align: "center",
  });
  doc.fillColor(INK).fontSize(8).font("Helvetica-Bold").text(input.plantLabel, 450, 31, { width: 104, align: "right" });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`${input.generatedOnLabel} ${formatDate(new Date())}`, 430, 57, {
    width: 124,
    align: "right",
  });
  doc.fillColor(INK).fontSize(7).font("Helvetica-Bold").text(`${input.referenceLabel}: ${input.reference}`, 394, 83, {
    width: 160,
    height: 22,
    align: "right",
  });
  doc.y = 138;
  doc.fillColor(INK).font("Helvetica");
}

const GREEN = "#4d9f35";
const TEAL = "#008577";
const BLUE = "#0070b8";
const YELLOW = "#f2b705";

function fitText(value: unknown, maxLength = 420) {
  const text = getDisplayValue(value, "-").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function fitTextForBox(doc: PdfDocument, value: unknown, input: {
  width: number;
  height: number;
  maxLength?: number;
}) {
  let text = fitText(value, input.maxLength ?? 420);
  if (doc.heightOfString(text, { width: input.width }) <= input.height) {
    return text;
  }

  while (text.length > 12) {
    text = `${text.slice(0, -5).trim()}...`;
    if (doc.heightOfString(text, { width: input.width }) <= input.height) {
      return text;
    }
  }

  return fitText(text, 12);
}

function drawPlatformLogo(doc: PdfDocument, x: number, y: number, scale = 1) {
  const s = (value: number) => value * scale;
  doc.roundedRect(x, y, s(64), s(40), s(10)).fillAndStroke("#f8fbff", "#b7c7dd");
  doc.roundedRect(x + s(11), y + s(16), s(42), s(12), s(4)).strokeColor(BRAND).lineWidth(s(1.1)).stroke();
  doc.fillColor(BRAND).fontSize(s(6.5)).font("Helvetica-Bold").text("M A", x + s(24), y + s(19), {
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

function drawPortraitHeader(doc: PdfDocument, input: {
  plant: string;
  title: string;
  generatedOn: string;
  exportedBy?: string | null;
  pageLabel: string;
}) {
  doc.rect(0, 0, doc.page.width, 64).fill("#f8fafc");
  doc.rect(0, 63, doc.page.width, 1).fill("#dbe3ee");
  drawPlatformLogo(doc, 24, 12);
  doc.fillColor(BRAND).fontSize(12).font("Helvetica-Bold").text(input.title.toUpperCase(), 284, 14, {
    width: 176,
    align: "center",
  });
  doc.fillColor(INK).fontSize(7.5).font("Helvetica-Bold").text(`PLANT: ${input.plant}`, 470, 12, { width: 92, align: "right" });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`Generated: ${input.generatedOn}`, 438, 27, { width: 124, align: "right" });
  doc.text(`Exported by: ${input.exportedBy?.trim() || "-"}`, 438, 39, { width: 124, align: "right" });
  doc.fillColor(INK).font("Helvetica");
}

function drawPortraitFooter(doc: PdfDocument, input: {
  generatedOn: string;
  exportedBy?: string | null;
  pageLabel: string;
}) {
  const footer = [
    "MA Srl",
    "S-EWO_MA_CLN Group",
    `Generated: ${input.generatedOn}`,
    `Exported by: ${input.exportedBy?.trim() || "-"}`,
  ].join("  |  ");
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(footer, 54, 812, { width: 430, align: "center" });
  doc.text(input.pageLabel, 520, 812, { width: 44, align: "right" });
  doc.fillColor(INK);
}

function drawPortraitPanel(doc: PdfDocument, input: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  color: string;
}) {
  drawPanel(doc, input);
}

function drawPortraitFieldGrid(doc: PdfDocument, input: {
  x: number;
  y: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gapX: number;
  gapY: number;
  entries: Array<[string, string]>;
}) {
  input.entries.forEach(([label, value], index) => {
    const column = index % input.columns;
    const row = Math.floor(index / input.columns);
    drawMiniField(doc, {
      label,
      value,
      x: input.x + column * (input.cellWidth + input.gapX),
      y: input.y + row * (input.cellHeight + input.gapY),
      width: input.cellWidth,
      height: input.cellHeight,
    });
  });
}

function drawPortraitPhaseBand(doc: PdfDocument, label: string, y: number, height: number, color: string) {
  drawSideBand(doc, label, 16, y, height, color);
}

function drawSignatureLine(doc: PdfDocument, label: string, x: number, y: number, width: number) {
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text(label.toUpperCase(), x, y, { width });
  doc.moveTo(x + 48, y + 10).lineTo(x + width, y + 10).strokeColor("#cbd5e1").lineWidth(0.8).stroke();
  doc.fillColor(INK).strokeColor(INK).font("Helvetica");
}

function drawCauseCategoryBoxes(doc: PdfDocument, input: {
  x: number;
  y: number;
  width: number;
  rowHeight: number;
  categories: Array<{ number: number; title: string; items: string[] }>;
  fallback: string;
}) {
  const gap = 6;
  const boxWidth = (input.width - gap * 2) / 3;
  const rows = Math.ceil(input.categories.length / 3);
  input.categories.forEach((category, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = input.x + column * (boxWidth + gap);
    const y = input.y + row * (input.rowHeight + gap);
    doc.rect(x, y, boxWidth, input.rowHeight).fillAndStroke(WHITE, "#c5ceda");
    doc.rect(x, y, boxWidth, 18).fill(category.number <= 5 ? GREEN : BLUE);
    doc.fillColor(WHITE).fontSize(7).font("Helvetica-Bold").text(`${category.number}  ${category.title}`.toUpperCase(), x + 6, y + 5, {
      width: boxWidth - 12,
    });
    const text = category.items.length ? category.items.join("\n") : input.fallback;
    doc.fillColor(INK).fontSize(6.4).font("Helvetica").text(fitText(text, 240), x + 6, y + 24, {
      width: boxWidth - 12,
      height: input.rowHeight - 30,
    });
  });
  doc.fillColor(INK).font("Helvetica");
  return rows * input.rowHeight + Math.max(0, rows - 1) * gap;
}

function isInjuryClassification(input: {
  communicationType: string;
  eventClassification: string;
  pyramidLevel: number | null;
}) {
  if (input.communicationType === "FIRST_AID" || input.communicationType === "ACCIDENT") return true;
  if (input.pyramidLevel !== null && input.pyramidLevel <= 4) return true;
  const normalized = input.eventClassification.toLowerCase();
  return ["first aid", "injury", "serious", "minor", "fatal", "accident"].some((term) => normalized.includes(term));
}

function drawSideBand(doc: PdfDocument, label: string, x: number, y: number, height: number, color: string) {
  doc.rect(x, y, 20, height).fill(color);
  doc.save();
  doc.rotate(-90, { origin: [x + 10, y + height / 2] });
  doc.fillColor(WHITE).fontSize(13).font("Helvetica-Bold").text(label.toUpperCase(), x - height / 2, y + height / 2 - 5, {
    width: height,
    align: "center",
  });
  doc.restore();
  doc.fillColor(INK).font("Helvetica");
}

function drawPanel(doc: PdfDocument, input: { x: number; y: number; width: number; height: number; title: string; color: string }) {
  doc.roundedRect(input.x, input.y, input.width, input.height, 6).fillAndStroke(WHITE, "#b8c4d2");
  doc.roundedRect(input.x, input.y, input.width, 22, 5).fill(input.color);
  doc.fillColor(WHITE).fontSize(9).font("Helvetica-Bold").text(input.title, input.x + 10, input.y + 7, { width: input.width - 20 });
  doc.fillColor(INK).font("Helvetica");
}

function drawMiniField(doc: PdfDocument, input: {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  doc.rect(input.x, input.y, input.width, input.height).fillAndStroke(SOFT, "#c5ceda");
  const labelWidth = input.width - 12;
  const compact = input.height <= 34;
  const labelHeight = compact ? 8 : Math.min(11, doc.heightOfString(input.label.toUpperCase(), { width: labelWidth }));
  const valueY = compact ? input.y + 18 : input.y + 8 + labelHeight + 3;
  const valueHeight = Math.max(8, input.y + input.height - valueY - 5);
  doc.fillColor(MUTED).fontSize(6.2).font("Helvetica-Bold").text(input.label.toUpperCase(), input.x + 6, input.y + 6, {
    width: labelWidth,
    height: labelHeight,
  });
  const value = compact
    ? fitText(input.value, 110)
    : fitTextForBox(doc, input.value, {
        width: labelWidth,
        height: valueHeight,
        maxLength: 110,
      });
  doc.fillColor(INK).fontSize(7.5).font("Helvetica").text(value, input.x + 6, valueY, {
    width: input.width - 12,
    height: valueHeight,
  });
}

function drawTextBox(doc: PdfDocument, input: {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxLength?: number;
}) {
  doc.rect(input.x, input.y, input.width, input.height).fillAndStroke(WHITE, "#c5ceda");
  const labelWidth = input.width - 14;
  const compact = input.height <= 48;
  const labelHeight = compact ? 10 : Math.min(14, doc.heightOfString(input.label.toUpperCase(), { width: labelWidth }));
  const valueY = input.y + 9 + labelHeight + 4;
  const valueHeight = Math.max(8, input.y + input.height - valueY - 6);
  const valueFontSize = input.height >= 80 ? 6.8 : 7.6;
  doc.fillColor(MUTED).fontSize(6.8).font("Helvetica-Bold").text(input.label.toUpperCase(), input.x + 7, input.y + 7, {
    width: labelWidth,
    height: labelHeight,
  });
  doc.fillColor(INK).fontSize(valueFontSize).font("Helvetica");
  const value = compact
    ? fitText(input.value, input.maxLength ?? 260)
    : fitTextForBox(doc, input.value, {
        width: labelWidth,
        height: valueHeight,
        maxLength: Math.max(input.maxLength ?? 0, 1200),
      });
  doc.text(value, input.x + 7, valueY, {
    width: labelWidth,
    height: valueHeight,
  });
  doc.strokeColor(INK).fillColor(INK);
}

function drawCheckbox(doc: PdfDocument, input: { x: number; y: number; checked: boolean; label: string; highlight?: boolean }) {
  doc.rect(input.x, input.y, 10, 10).strokeColor(input.highlight ? BRAND : "#94a3b8").lineWidth(input.highlight ? 1.5 : 1).stroke();
  if (input.checked) {
    doc.moveTo(input.x + 2, input.y + 5).lineTo(input.x + 4.5, input.y + 8).lineTo(input.x + 9, input.y + 2).strokeColor(BRAND).lineWidth(1.6).stroke();
  }
  doc.fillColor(input.highlight ? INK : "#334155").fontSize(8).font(input.highlight ? "Helvetica-Bold" : "Helvetica").text(input.label, input.x + 16, input.y, {
    width: 145,
  });
  doc.strokeColor(INK).fillColor(INK).font("Helvetica");
}

function getPyramidLevel(input: {
  communicationType?: string | null;
  classification?: string | null;
  lostDays?: number | null;
  isFatal?: boolean | null;
}) {
  if (input.communicationType === "ACCIDENT") {
    if (input.isFatal || input.classification === "FATAL") return 1;
    if (input.classification === "SERIOUS" || (input.lostDays ?? 0) > 30) return 2;
    return 3;
  }
  if (input.communicationType === "FIRST_AID") return 4;
  if (input.communicationType === "NEAR_MISS") return 5;
  if (input.communicationType === "UNSAFE_CONDITION") return 6;
  if (input.communicationType === "UNSAFE_ACT") return 7;
  return null;
}

function drawPyramid(doc: PdfDocument, input: {
  x: number;
  y: number;
  width: number;
  selectedLevel: number | null;
}) {
  const levels = [
    { level: 1, label: "Fatal accident", color: "#d72828" },
    { level: 2, label: "Serious Injury (> 30 days)", color: "#f05a24" },
    { level: 3, label: "Minor Injury (<=30 days)", color: "#f4b000" },
    { level: 4, label: "First Aid", color: "#f2d900" },
    { level: 5, label: "Near misses", color: "#88c63f" },
    { level: 6, label: "Unsafe condition", color: "#39a94b" },
    { level: 7, label: "Unsafe action", color: "#00964b" },
  ];
  const segmentH = 17;
  const centerX = input.x + 100;
  const topY = input.y + 12;
  const maxW = 145;

  levels.forEach((entry, index) => {
    const y = topY + index * segmentH;
    const topWidth = 34 + index * 16;
    const bottomWidth = Math.min(maxW, topWidth + 16);
    const points = [
      [centerX - topWidth / 2, y],
      [centerX + topWidth / 2, y],
      [centerX + bottomWidth / 2, y + segmentH],
      [centerX - bottomWidth / 2, y + segmentH],
    ];
    doc.polygon(...points).fillAndStroke(entry.color, WHITE);

    const checked = input.selectedLevel === entry.level;
    drawCheckbox(doc, {
      x: input.x + 205,
      y: y + 4,
      checked,
      label: entry.label,
      highlight: checked,
    });
  });
  doc.fillColor(INK).font("Helvetica");
}

function normalizeBodyPartName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getBodyMarker(input: { code?: string | null; name?: string | null }) {
  const code = input.code?.toUpperCase();
  const name = normalizeBodyPartName(input.name ?? "");
  const byCode: Record<string, { side: "front" | "back"; x: number; y: number; radius: number }> = {
    BP01: { side: "front", x: 55, y: 18, radius: 13 },
    BP02: { side: "front", x: 48, y: 22, radius: 7 },
    BP03: { side: "front", x: 62, y: 22, radius: 7 },
    BP04: { side: "front", x: 34, y: 52, radius: 12 },
    BP05: { side: "front", x: 76, y: 52, radius: 12 },
    BP06: { side: "front", x: 24, y: 84, radius: 14 },
    BP07: { side: "front", x: 86, y: 84, radius: 14 },
    BP08: { side: "front", x: 16, y: 122, radius: 12 },
    BP09: { side: "front", x: 94, y: 122, radius: 12 },
    BP10: { side: "front", x: 55, y: 62, radius: 17 },
    BP11: { side: "back", x: 55, y: 62, radius: 18 },
    BP12: { side: "back", x: 55, y: 92, radius: 17 },
    BP13: { side: "front", x: 55, y: 92, radius: 16 },
    BP14: { side: "front", x: 43, y: 113, radius: 12 },
    BP15: { side: "front", x: 67, y: 113, radius: 12 },
    BP16: { side: "front", x: 43, y: 151, radius: 14 },
    BP17: { side: "front", x: 67, y: 151, radius: 14 },
    BP18: { side: "front", x: 43, y: 175, radius: 12 },
    BP19: { side: "front", x: 67, y: 175, radius: 12 },
    BP20: { side: "front", x: 40, y: 218, radius: 13 },
    BP21: { side: "front", x: 70, y: 218, radius: 13 },
  };
  if (code && byCode[code]) return byCode[code];
  if (name.includes("head") || name.includes("cabeca") || name.includes("cabeça")) return byCode.BP01;
  if (name.includes("eye") || name.includes("olho")) return byCode.BP02;
  if (name.includes("shoulder") || name.includes("ombro")) return byCode.BP04;
  if (name.includes("arm") || name.includes("braco") || name.includes("braço")) return byCode.BP06;
  if (name.includes("hand") || name.includes("mao") || name.includes("mão")) return byCode.BP08;
  if (name.includes("chest") || name.includes("torax") || name.includes("tórax")) return byCode.BP10;
  if (name.includes("back") || name.includes("costas")) return byCode.BP11;
  if (name.includes("abdomen")) return byCode.BP13;
  if (name.includes("hip") || name.includes("anca")) return byCode.BP14;
  if (name.includes("knee") || name.includes("joelho")) return byCode.BP18;
  if (name.includes("foot") || name.includes("pe") || name.includes("pé")) return byCode.BP20;
  if (name.includes("leg") || name.includes("perna")) return byCode.BP16;
  return null;
}

function drawHumanFigure(doc: PdfDocument, x: number, y: number, label: string, marker: ReturnType<typeof getBodyMarker> | null, side: "front" | "back") {
  doc.fillColor("#f4c27a").circle(x + 55, y + 20, 13).fill();
  doc.roundedRect(x + 38, y + 42, 34, 58, 8).fill("#8dd2c9");
  doc.roundedRect(x + 23, y + 48, 12, 55, 6).fill("#7fb4d6");
  doc.roundedRect(x + 75, y + 48, 12, 55, 6).fill("#7fb4d6");
  doc.roundedRect(x + 39, y + 100, 13, 72, 6).fill("#f6a64b");
  doc.roundedRect(x + 58, y + 100, 13, 72, 6).fill("#f6a64b");
  doc.roundedRect(x + 35, y + 171, 18, 14, 5).fill("#64748b");
  doc.roundedRect(x + 57, y + 171, 18, 14, 5).fill("#64748b");
  doc.strokeColor("#64748b").lineWidth(0.8).circle(x + 55, y + 20, 13).stroke();
  doc.roundedRect(x + 38, y + 42, 34, 58, 8).stroke();

  if (marker && marker.side === side) {
    doc.circle(x + marker.x, y + marker.y, marker.radius).fillOpacity(0.22).fill(DANGER).fillOpacity(1);
    doc.circle(x + marker.x, y + marker.y, marker.radius + 3).strokeColor(DANGER).lineWidth(2).stroke();
  }

  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text(label.toUpperCase(), x, y + 192, { width: 110, align: "center" });
  doc.strokeColor(INK).fillColor(INK).font("Helvetica");
}

function drawAnatomyPanel(doc: PdfDocument, input: {
  x: number;
  y: number;
  width: number;
  height: number;
  bodyPart: string;
  bodyPartCode?: string | null;
  injuryType: string;
  required: boolean;
}) {
  doc.rect(input.x, input.y, input.width, input.height).fillAndStroke(SOFT, "#c5ceda");
  doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("PART OF THE BODY", input.x + 10, input.y + 9, {
    width: input.width - 20,
    align: "center",
  });
  if (!input.required) {
    doc.fillColor(INK).fontSize(8).font("Helvetica").text("Anatomical model not required for this event type.", input.x + 16, input.y + 45, {
      width: input.width - 32,
      align: "center",
    });
    doc.fillColor(MUTED).fontSize(7).text(`Body part: ${input.bodyPart || "-"}`, input.x + 16, input.y + 86, { width: input.width - 32, align: "center" });
    return;
  }

  const marker = getBodyMarker({ code: input.bodyPartCode, name: input.bodyPart });
  if (input.height < 180) {
    const contentX = input.x + 8;
    const contentWidth = input.width - 16;
    const figureY = input.y + 26;
    const detailY = input.y + input.height - 31;
    const drawCompactFigure = (figureX: number, figureY: number, label: string, side: "front" | "back") => {
      doc.fillColor("#f4c27a").circle(figureX + 23, figureY + 7, 5).fill();
      doc.roundedRect(figureX + 17, figureY + 17, 12, 24, 4).fill("#8dd2c9");
      doc.roundedRect(figureX + 10, figureY + 20, 5, 22, 3).fill("#7fb4d6");
      doc.roundedRect(figureX + 31, figureY + 20, 5, 22, 3).fill("#7fb4d6");
      doc.roundedRect(figureX + 17, figureY + 41, 5, 24, 3).fill("#f6a64b");
      doc.roundedRect(figureX + 25, figureY + 41, 5, 24, 3).fill("#f6a64b");
      if (marker && marker.side === side) {
        const markerX = figureX + Math.max(7, Math.min(39, marker.x * 0.41));
        const markerY = figureY + Math.max(4, Math.min(64, marker.y * 0.29));
        doc.circle(markerX, markerY, Math.max(3, marker.radius * 0.3)).fillOpacity(0.22).fill(DANGER).fillOpacity(1);
        doc.circle(markerX, markerY, Math.max(5, marker.radius * 0.3 + 2)).strokeColor(DANGER).lineWidth(1.1).stroke();
      }
      doc.fillColor(MUTED).fontSize(5.8).font("Helvetica-Bold").text(label.toUpperCase(), figureX, figureY + 56, { width: 46, align: "center" });
    };
    drawCompactFigure(contentX, figureY, "Front", "front");
    drawCompactFigure(input.x + input.width - 54, figureY, "Back", "back");
    doc.moveTo(contentX, detailY - 4).lineTo(input.x + input.width - 8, detailY - 4).strokeColor("#d7dee8").lineWidth(0.6).stroke();
    doc.fillColor(INK).fontSize(6.2).font("Helvetica-Bold").text(fitText(`Affected zone: ${input.bodyPart || "-"}`, 54), contentX, detailY, {
      width: contentWidth,
      height: 10,
      align: "center",
    });
    doc.fillColor(MUTED).fontSize(5.8).font("Helvetica").text(fitText(`Nature: ${input.injuryType || "-"}`, 58), contentX, detailY + 12, {
      width: contentWidth,
      height: 10,
      align: "center",
    });
    doc.fillColor(INK).font("Helvetica");
    return;
  }
  drawHumanFigure(doc, input.x + 24, input.y + 28, "Front", marker, "front");
  drawHumanFigure(doc, input.x + 132, input.y + 28, "Back", marker, "back");
  doc.fillColor(INK).fontSize(8).font("Helvetica-Bold").text(`Affected zone: ${input.bodyPart || "-"}`, input.x + 10, input.y + input.height - 34, {
    width: input.width - 20,
    align: "center",
  });
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`Nature: ${input.injuryType || "-"}`, input.x + 10, input.y + input.height - 20, {
    width: input.width - 20,
    align: "center",
  });
}

function drawLandscapeTable(doc: PdfDocument, input: {
  x: number;
  y: number;
  widths: number[];
  rowHeight: number;
  headers: string[];
  rows: string[][];
  maxRows?: number;
}) {
  const tableWidth = input.widths.reduce((sum, width) => sum + width, 0);
  doc.rect(input.x, input.y, tableWidth, 24).fillAndStroke(SOFT, "#c5ceda");
  let cursorX = input.x;
  input.headers.forEach((header, index) => {
    doc.fillColor(INK).fontSize(7).font("Helvetica-Bold").text(header.toUpperCase(), cursorX + 6, input.y + 8, {
      width: input.widths[index] - 12,
      align: "center",
    });
    cursorX += input.widths[index];
    doc.moveTo(cursorX, input.y).lineTo(cursorX, input.y + 24 + input.rowHeight * Math.max(1, Math.min(input.rows.length, input.maxRows ?? input.rows.length))).strokeColor("#c5ceda").stroke();
  });

  const visibleRows = input.rows.slice(0, input.maxRows ?? input.rows.length);
  if (visibleRows.length === 0) visibleRows.push(input.headers.map(() => "-"));

  visibleRows.forEach((row, rowIndex) => {
    const y = input.y + 24 + rowIndex * input.rowHeight;
    doc.rect(input.x, y, tableWidth, input.rowHeight).fillAndStroke(rowIndex % 2 === 0 ? WHITE : SOFT, "#dbe3ee");
    cursorX = input.x;
    row.forEach((cell, index) => {
      doc.fillColor(INK).fontSize(7).font("Helvetica").text(fitText(cell, 140), cursorX + 6, y + 7, {
        width: input.widths[index] - 12,
        height: input.rowHeight - 10,
      });
      cursorX += input.widths[index];
    });
  });
  doc.fillColor(INK).strokeColor(INK).font("Helvetica");
}

function getSummaryLocation(input: {
  communication?: {
    workstation?: { name: string } | null;
    area?: { name: string } | null;
  } | null;
  whereText?: string | null;
  line?: { name: string } | null;
  area?: { name: string } | null;
}, fallback: string) {
  return (
    input.communication?.workstation?.name?.trim() ||
    input.communication?.area?.name?.trim() ||
    input.whereText?.trim() ||
    input.line?.name?.trim() ||
    input.area?.name?.trim() ||
    fallback
  );
}

function buildRootCauseText(input: {
  templateData: Record<string, unknown>;
  causeSelections: Array<{
    selected: boolean;
    isRootCause: boolean;
    comment?: string | null;
    causeItem: {
      label: string;
    };
  }>;
  translated: (text: unknown) => string;
  fallback: string;
}) {
  const templateRootCauseDetails = Array.isArray(input.templateData.rootCauseDetails)
    ? input.templateData.rootCauseDetails
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          label: getDisplayValue(entry.label, ""),
          comment: getDisplayValue(entry.comment, ""),
          isRootCause: Boolean(entry.isRootCause),
        }))
    : [];
  const preferredTemplateEntries = templateRootCauseDetails.filter((entry) => entry.isRootCause);
  const selectedSelections = input.causeSelections.filter((selection) => selection.selected);
  const selectedRootSelections = selectedSelections.filter((selection) => selection.isRootCause);
  const selectionEntries = (selectedRootSelections.length ? selectedRootSelections : selectedSelections).map((selection) => ({
    label: selection.causeItem.label,
    comment: selection.comment ?? "",
  }));
  const resolvedEntries = preferredTemplateEntries.length
    ? preferredTemplateEntries
    : templateRootCauseDetails.length
      ? templateRootCauseDetails
      : selectionEntries;

  if (!resolvedEntries.length) return input.fallback;

  const formatted = resolvedEntries
    .map((entry) => {
      const label = input.translated(entry.label);
      const comment = entry.comment ? input.translated(entry.comment) : "";
      return comment.trim() ? `${label}: ${comment}` : label;
    })
    .filter((entry) => entry.trim().length > 0);

  return formatted.length ? formatted.join("\n\n") : input.fallback;
}

function drawPhotoCard(doc: PdfDocument, input: {
  title: string;
  imageBuffer: Buffer;
}) {
  ensurePageSpace(doc, 284);
  const captionY = doc.y;
  const captionHeight = Math.max(14, doc.heightOfString(input.title, { width: 491 }));
  doc.fillColor(MUTED).fontSize(8).text(input.title, 52, captionY);
  const imageY = captionY + captionHeight + 8;
  doc.roundedRect(40, imageY, 515, 220, 12).fillAndStroke(WHITE, PANEL);
  doc.image(input.imageBuffer, 52, imageY + 12, {
    fit: [491, 196],
    align: "center",
    valign: "center",
  });
  doc.y = imageY + 236;
  doc.fillColor(INK);
}

function readSifPsifDecision(value: unknown): SifPsifDecision | null {
  if (!isRecord(value)) return null;

  const decision = createEmptySifPsifDecision();
  const exposures = isRecord(value.exposures) ? value.exposures : {};

  return {
    actualSif: toYesNoAnswer(value.actualSif),
    exposures: Object.fromEntries(
      SIF_PSIF_EXPOSURE_KEYS.map((key) => [key, toYesNoAnswer(exposures[key])]),
    ) as SifPsifDecision["exposures"],
    repeatedSifPotential: toYesNoAnswer(value.repeatedSifPotential),
    oneWhatIfAway: toYesNoAnswer(value.oneWhatIfAway),
    noPsifExplanation: typeof value.noPsifExplanation === "string" ? value.noPsifExplanation : decision.noPsifExplanation,
  };
}

export const SewoExportService = {
  async buildExport(sewoId: string, options: CompleteReportOptions = {}) {
    const locale = options.locale ?? "en";
    const { ui } = await getLocalizedSewoUi(locale);
    const sewo = await prisma.sEWO.findUniqueOrThrow({
      where: { id: sewoId },
      include: {
        plant: true,
        communication: {
          include: {
            targetEmployee: true,
            area: true,
            line: true,
            shift: true,
            workstation: true,
            bodyPart: true,
            injuryType: true,
          },
        },
        performedBy: true,
        approvedBy: true,
        attachments: true,
        causeSelections: {
          include: {
            causeItem: true,
          },
        },
        actionLinks: {
          include: {
            action: {
              include: {
                ownerUser: true,
              },
            },
          },
        },
        area: true,
        line: true,
        shift: true,
      },
    });
    await localizeSewoMasterData(sewo, locale);

    const templateData = (sewo.templateData as Record<string, unknown> | null) ?? {};
    const sewoCode = getReadableSewoCode(sewo);
    const communicationCode = sewo.communication ? getReadableCommunicationCode(sewo.communication) : "-";
    const fiveWhys = Array.isArray(templateData.fiveWhys) ? (templateData.fiveWhys as Array<Record<string, unknown>>) : [];
    const sifPsifDecision = readSifPsifDecision(templateData.sifPsifDecision);
    const sifPsifResult = sifPsifDecision ? getSifPsifResult(sifPsifDecision) : "PENDING";
    const templateRootCauseDetails = Array.isArray(templateData.rootCauseDetails)
      ? (templateData.rootCauseDetails as Array<Record<string, unknown>>)
      : [];
    const rootCauseDetails = templateRootCauseDetails.length
      ? templateRootCauseDetails
      : sewo.causeSelections
          .filter((selection) => selection.selected)
          .map((selection) => ({
            label: selection.causeItem.label,
            comment: selection.comment ?? "",
            isRootCause: selection.isRootCause,
          }));
    const translatableTexts = [
      sewo.eventClassification,
      sewo.whichText ?? "",
      sewo.communication?.description ?? "",
      sewo.howText,
      sewo.immediateCorrectiveActionText,
      getString(templateData.analysisText),
      getString(templateData.previousDetectedDescription),
      getString(sifPsifDecision?.noPsifExplanation),
      ...fiveWhys.flatMap((entry) => [getString(entry.why), getString(entry.answer)]),
      ...rootCauseDetails.flatMap((entry) => [getString(entry.label), getString(entry.comment)]),
      ...sewo.actionLinks.flatMap((entry) => [entry.action.title, entry.action.description]),
    ];
    const translatedTexts = await translateForViewer(locale, translatableTexts);
    const translationByText = new Map(translatableTexts.map((text, index) => [text, translatedTexts[index] ?? text]));
    const translated = (text: unknown) => translationByText.get(getString(text)) ?? getString(text);
    const display = (text: unknown) => {
      const raw = getString(text);
      if (raw === "-") return ui.summaryReportNotApplicable;
      return getDisplayValue(translationByText.get(raw) ?? raw, ui.summaryReportNotApplicable);
    };
    const yesNo = (value: unknown) => (value === "" || value === null || value === undefined ? "-" : isSewoRootCauseAffirmative(value) ? ui.yes : ui.no);
    const localizedStatus = formatLocalizedSewoStatus(sewo.status, ui);
    const generatedOn = formatDate(new Date());
    const plantLabel = `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`;
    const sifPsifLabel = sifPsifDecision ? getSifPsifResultLabel(sifPsifResult, ui) : ui.pendingResult;
    const occurrenceLocation = getSummaryLocation(sewo, ui.summaryReportNotApplicable);
    const photoAttachments = await loadAttachmentBuffers(sewo.attachments);
    const nonImageAttachments = sewo.attachments.filter((attachment) => inferImageExtension(attachment) === null);
    const orderedActions = [...sewo.actionLinks].sort(
      (left, right) => getDateSortTime(left.action.dueDate) - getDateSortTime(right.action.dueDate),
    );
    const communicationType = getDisplayValue(
      sewo.communication?.type ?? templateData.eventType ?? sewo.whichText,
      "",
    );
    const bodyPartName = getDisplayValue(
      sewo.communication?.bodyPart?.name ?? templateData.bodyPart,
      ui.summaryReportNotApplicable,
    );
    const injuryTypeName = getDisplayValue(
      getReadableText([sewo.communication?.injuryType?.name, sewo.whatText], ""),
      ui.summaryReportNotApplicable,
    );
    const occurrenceDescription = display(getReadableText(
      [sewo.communication?.description, sewo.howText],
      ui.summaryReportNotApplicable,
    ));
    const lostDays = typeof templateData.lostDays === "number"
      ? templateData.lostDays
      : sewo.communication?.lostDays ?? null;
    const selectedPyramidLevel = getPyramidLevel({
      communicationType,
      classification: sewo.communication?.classification ?? getDisplayValue(templateData.classification, ""),
      lostDays,
      isFatal: sewo.communication?.isFatal ?? Boolean(templateData.isFatal),
    });

    const pdf = await (async () => {
      const doc = createPdfDocument({ margin: 0, size: "A4", bufferPages: true });
      const pageCount = 3;
      const anatomyRequired = isInjuryClassification({
        communicationType,
        eventClassification: display(sewo.eventClassification),
        pyramidLevel: selectedPyramidLevel,
      });
      const bodyLocationText = anatomyRequired && bodyPartName === ui.summaryReportNotApplicable
        ? "Body location not specified"
        : bodyPartName;

      drawPortraitHeader(doc, {
        plant: sewo.plant.code.toUpperCase(),
        title: "SAFETY EWO - COMPLETE REPORT",
        generatedOn,
        exportedBy: options.exportedBy,
        pageLabel: `1/${pageCount}`,
      });
      drawPortraitPhaseBand(doc, "PLAN", 68, 720, GREEN);

      drawPortraitPanel(doc, { x: 46, y: 72, width: 503, height: 150, title: "Event classification / communication type", color: GREEN });
      drawPyramid(doc, { x: 54, y: 92, width: 284, selectedLevel: selectedPyramidLevel });
      drawMiniField(doc, {
        label: "Lost days",
        value: getDisplayValue(lostDays, ui.summaryReportNotApplicable),
        x: 376,
        y: 108,
        width: 70,
        height: 38,
      });
      drawMiniField(doc, {
        label: "1st prognosis",
        value: getDisplayValue(templateData.initialLostDays, ui.summaryReportNotApplicable),
        x: 456,
        y: 108,
        width: 78,
        height: 38,
      });
      drawMiniField(doc, {
        label: "Communication type",
        value: communicationType || ui.summaryReportNotApplicable,
        x: 376,
        y: 158,
        width: 158,
        height: 38,
      });

      drawPortraitPanel(doc, { x: 46, y: 232, width: 503, height: 178, title: "General information", color: BRAND });
      drawPortraitFieldGrid(doc, {
        x: 56,
        y: 262,
        columns: 4,
        cellWidth: 116,
        cellHeight: 31,
        gapX: 6,
        gapY: 6,
        entries: [
          [ui.plant, plantLabel],
          [ui.summaryReportReference, sewoCode],
          [ui.summaryStatus, localizedStatus],
          [ui.tableDate, formatDate(sewo.analysisDate)],
          [ui.summaryPerformedBy, sewo.performedBy?.name ?? ui.summaryReportNotApplicable],
          [ui.summaryCommunication, communicationCode],
          [ui.validatedBy, sewo.approvedBy?.name ?? ui.summaryReportNotApplicable],
          [ui.reviewedAt, sewo.approvedAt ? formatDate(sewo.approvedAt) : ui.summaryReportNotApplicable],
          [ui.eventClassification, display(sewo.eventClassification)],
          [ui.area, sewo.area?.name ?? sewo.communication?.area?.name ?? ui.summaryReportNotApplicable],
          [ui.workstation, occurrenceLocation],
          [ui.shift, sewo.shift?.name ?? sewo.communication?.shift?.name ?? ui.summaryReportNotApplicable],
          [ui.involvedPerson, getDisplayValue(sewo.whoText, ui.summaryReportNotApplicable)],
          [ui.nature, injuryTypeName],
          [ui.usualJob, sewo.usualWorkYesNo ? ui.yes : ui.no],
          [ui.whichOperation, display(sewo.whichText)],
        ],
      });

      drawPortraitPanel(doc, { x: 46, y: 420, width: 244, height: 228, title: "Analysis - event description", color: TEAL });
      drawTextBox(doc, { label: "WHAT - nature and body location", value: `${injuryTypeName} | ${bodyLocationText}`, x: 56, y: 450, width: 224, height: 36, maxLength: 130 });
      drawTextBox(doc, { label: "WHERE - workplace, machine, press, line, etc.", value: occurrenceLocation, x: 56, y: 492, width: 224, height: 36, maxLength: 130 });
      drawTextBox(doc, { label: "WHO - usual job of the injured person", value: getDisplayValue(sewo.whoText, ui.summaryReportNotApplicable), x: 56, y: 534, width: 224, height: 36, maxLength: 130 });
      drawTextBox(doc, { label: "HOW - how did the accident happen", value: display(sewo.howText), x: 56, y: 576, width: 224, height: 42, maxLength: 190 });

      drawPortraitPanel(doc, { x: 302, y: 420, width: 247, height: 228, title: "Immediate action and classification", color: BLUE });
      drawAnatomyPanel(doc, {
        x: 312,
        y: 450,
        width: 112,
        height: 126,
        bodyPart: bodyLocationText,
        bodyPartCode: sewo.communication?.bodyPart?.code ?? null,
        injuryType: injuryTypeName,
        required: anatomyRequired,
      });
      drawTextBox(doc, {
        label: "Immediate action description",
        value: display(sewo.immediateCorrectiveActionText),
        x: 432,
        y: 450,
        width: 106,
        height: 126,
        maxLength: 210,
      });
      drawLandscapeTable(doc, {
        x: 312,
        y: 584,
        widths: [70, 112, 46],
        rowHeight: 18,
        headers: ["Category", "Check possible causes", "Root cause"],
        rows: rootCauseDetails.slice(0, 2).map((entry) => [display(entry.label), display(entry.comment), yesNo(entry.isRootCause)]),
        maxRows: 2,
      });

      drawPortraitPanel(doc, { x: 46, y: 660, width: 503, height: 54, title: "UC / UA related to the event", color: GREEN });
      doc.fillColor(INK).fontSize(7.5).text("Have any UA/UC related to the dynamic and root causes been previously detected?", 58, 689, { width: 280 });
      drawCheckbox(doc, { x: 345, y: 687, checked: isSewoRootCauseAffirmative(templateData.previousDetected), label: ui.yes });
      drawCheckbox(doc, { x: 400, y: 687, checked: templateData.previousDetected === "NO" || templateData.previousDetected === false, label: ui.no });
      doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("Description:", 58, 704, { width: 70 });
      doc.fillColor(INK).fontSize(7).font("Helvetica").text(fitText(display(templateData.previousDetectedDescription), 180), 132, 704, { width: 390 });
      drawPortraitFooter(doc, { generatedOn, exportedBy: options.exportedBy, pageLabel: `1/${pageCount}` });

      doc.addPage({ margin: 0, size: "A4" });
      drawPortraitHeader(doc, {
        plant: sewo.plant.code.toUpperCase(),
        title: "SAFETY EWO - ANALYSIS",
        generatedOn,
        exportedBy: options.exportedBy,
        pageLabel: `2/${pageCount}`,
      });
      drawPortraitPhaseBand(doc, "PLAN", 68, 720, GREEN);

      drawPortraitPanel(doc, { x: 46, y: 72, width: 503, height: 154, title: "Occurrence description", color: GREEN });
      drawTextBox(doc, { label: "Description", value: occurrenceDescription, x: 56, y: 102, width: 156, height: 96, maxLength: 260 });
      drawTextBox(doc, { label: "How did the accident happen?", value: display(sewo.howText), x: 220, y: 102, width: 156, height: 96, maxLength: 260 });
      drawTextBox(doc, { label: "Immediate corrective action plan", value: display(sewo.immediateCorrectiveActionText), x: 384, y: 102, width: 154, height: 96, maxLength: 260 });

      drawPortraitPanel(doc, { x: 46, y: 238, width: 503, height: 92, title: "Analysis", color: TEAL });
      drawTextBox(doc, { label: "Analysis text", value: display(templateData.analysisText), x: 56, y: 268, width: 260, height: 48, maxLength: 220 });
      drawMiniField(doc, { label: "Have previous UA / UC been detected?", value: yesNo(templateData.previousDetected), x: 326, y: 268, width: 96, height: 48 });
      drawTextBox(doc, { label: "Describe previous detection", value: display(templateData.previousDetectedDescription), x: 430, y: 268, width: 108, height: 48, maxLength: 100 });

      drawPortraitPanel(doc, { x: 46, y: 342, width: 503, height: 118, title: "5 Why", color: BLUE });
      drawLandscapeTable(doc, {
        x: 56,
        y: 372,
        widths: [58, 210, 213],
        rowHeight: 18,
        headers: [ui.whyLabel, ui.question, ui.answerLabel],
        rows: fiveWhys.map((entry, index) => [`${ui.whyLabel} ${index + 1}`, display(entry.why), display(entry.answer)]),
        maxRows: 4,
      });

      const sifRows = sifPsifDecision
        ? [
            [ui.sifPsifResult, sifPsifLabel],
            [ui.actualSifQuestion, yesNo(sifPsifDecision.actualSif)],
            ...SIF_PSIF_EXPOSURE_KEYS.map((key): [string, string] => [
              ui.sifPsifExposureQuestions[key],
              yesNo(sifPsifDecision.exposures[key]),
            ]),
            [ui.repeatedSifPotentialQuestion, yesNo(sifPsifDecision.repeatedSifPotential)],
            [ui.oneWhatIfAwayQuestion, yesNo(sifPsifDecision.oneWhatIfAway)],
            [ui.noPsifExplanation, display(sifPsifDecision.noPsifExplanation)],
          ]
        : [[ui.sifPsifDecisionTree, ui.pendingResult]];
      drawPortraitPanel(doc, { x: 46, y: 472, width: 503, height: 222, title: "SIF / PSIF decision tree", color: BRAND });
      drawLandscapeTable(doc, {
        x: 56,
        y: 502,
        widths: [358, 123],
        rowHeight: 16,
        headers: [ui.field, ui.value],
        rows: sifRows,
        maxRows: 10,
      });
      drawPortraitFooter(doc, { generatedOn, exportedBy: options.exportedBy, pageLabel: `2/${pageCount}` });

      doc.addPage({ margin: 0, size: "A4" });
      drawPortraitHeader(doc, {
        plant: sewo.plant.code.toUpperCase(),
        title: "SAFETY EWO - ROOT CAUSE & ACTION PLAN",
        generatedOn,
        exportedBy: options.exportedBy,
        pageLabel: `3/${pageCount}`,
      });
      const rootCausePanelY = 72;
      const rootCauseTableY = 102;
      const rootCauseCategoriesY = 212;
      const rootCauseCategoryRowHeight = 44;
      const rootCauseCategoryHeight = Math.ceil(7 / 3) * rootCauseCategoryRowHeight + 2 * 6;
      const rootCausePanelHeight = rootCauseCategoriesY + rootCauseCategoryHeight + 4 - rootCausePanelY;
      const correctionPlanY = rootCausePanelY + rootCausePanelHeight + 8;
      const correctionPlanHeight = 112;
      const checkPanelY = correctionPlanY + correctionPlanHeight + 8;
      const checkPanelHeight = 64;
      const extensionPlanY = checkPanelY + checkPanelHeight + 8;
      const extensionPlanHeight = 62;
      const photoEvidenceY = extensionPlanY + extensionPlanHeight + 8;
      const photoEvidenceHeight = 84;
      const signatureY = photoEvidenceY + photoEvidenceHeight + 10;

      drawPortraitPhaseBand(doc, "PLAN", 68, rootCausePanelHeight + 4, GREEN);
      drawPortraitPhaseBand(doc, "DO", correctionPlanY, correctionPlanHeight, BLUE);
      drawPortraitPhaseBand(doc, "CHECK", checkPanelY, checkPanelHeight, DANGER);
      drawPortraitPhaseBand(doc, "ACT", extensionPlanY, extensionPlanHeight, YELLOW);

      drawPortraitPanel(doc, { x: 46, y: rootCausePanelY, width: 503, height: rootCausePanelHeight, title: "Root cause analysis", color: GREEN });
      drawLandscapeTable(doc, {
        x: 56,
        y: rootCauseTableY,
        widths: [170, 70, 241],
        rowHeight: 20,
        headers: [ui.cause, ui.rootCause, ui.comment],
        rows: rootCauseDetails.map((entry) => [display(entry.label), yesNo(entry.isRootCause), display(entry.comment)]),
        maxRows: 4,
      });
      const causeCategoryTitles = [
        "Competence / Knowledge",
        "Attitude / Behavior",
        "Management",
        "Precaution / Attention",
        "Personal Condition",
        "Facilities / Equipment",
        "Procedure / Systems",
      ];
      drawCauseCategoryBoxes(doc, {
        x: 56,
        y: rootCauseCategoriesY,
        width: 481,
        rowHeight: rootCauseCategoryRowHeight,
        categories: causeCategoryTitles.map((title, index) => {
          const number = index + 1;
          return {
            number,
            title,
            items: rootCauseDetails
              .map((entry) => display(entry.label))
              .filter((label) => label.trim().startsWith(`${number}.`) || label.trim().startsWith(`${number} `)),
          };
        }),
        fallback: ui.summaryReportNotApplicable,
      });

      drawPortraitPanel(doc, { x: 46, y: correctionPlanY, width: 503, height: correctionPlanHeight, title: "Correction plan", color: BLUE });
      drawLandscapeTable(doc, {
        x: 56,
        y: correctionPlanY + 30,
        widths: [204, 116, 78, 83],
        rowHeight: 18,
        headers: ["Correction plan", ui.owner, "Closure date", ui.tableStatus],
        rows: orderedActions.map((entry) => [
          `${display(entry.action.title)} - ${display(entry.action.description)}`,
          entry.action.ownerUser?.name ?? ui.summaryReportNotApplicable,
          formatDate(entry.action.dueDate, ui.summaryReportNotApplicable),
          ui.actionStatusLabels[entry.action.status] ?? entry.action.status,
        ]),
        maxRows: 3,
      });

      drawPortraitPanel(doc, { x: 46, y: checkPanelY, width: 503, height: checkPanelHeight, title: "Check of suitability for the planned activity", color: DANGER });
      doc.fillColor(INK).fontSize(7.2).font("Helvetica").text("In the last 3 months did any event occur due to the same root cause?", 58, checkPanelY + 30, { width: 300 });
      drawCheckbox(doc, { x: 366, y: checkPanelY + 28, checked: false, label: ui.yes });
      drawCheckbox(doc, { x: 420, y: checkPanelY + 28, checked: false, label: ui.no });
      drawSignatureLine(doc, "Checked by:", 58, checkPanelY + 48, 150);
      drawSignatureLine(doc, "Date:", 222, checkPanelY + 48, 118);
      drawSignatureLine(doc, "Signature:", 356, checkPanelY + 48, 170);

      drawPortraitPanel(doc, { x: 46, y: extensionPlanY, width: 503, height: extensionPlanHeight, title: "Extension plan to areas with similar problems and plan timing", color: YELLOW });
      doc.fillColor(INK).fontSize(7.5).font("Helvetica").text(
        fitText(
          getDisplayValue(
            templateData.extensionPlan ?? templateData.extensionPlanText ?? templateData.similarAreasPlan ?? templateData.planTiming,
            ui.summaryReportNotApplicable,
          ),
          420,
        ),
        58,
        extensionPlanY + 30,
        { width: 468, height: extensionPlanHeight - 36 },
      );

      drawPortraitPanel(doc, { x: 46, y: photoEvidenceY, width: 503, height: photoEvidenceHeight, title: "Photo evidence", color: BRAND });
      if (!photoAttachments.length && !nonImageAttachments.length) {
        doc.fillColor(INK).fontSize(8).text(ui.summaryReportNotApplicable, 58, photoEvidenceY + 34, { width: 468 });
      } else {
        photoAttachments.slice(0, 3).forEach((attachment, index) => {
          const x = 58 + index * 115;
          doc.rect(x, photoEvidenceY + 32, 104, 38).fillAndStroke(SOFT, "#c5ceda");
          try {
            doc.image(attachment.buffer, x + 4, photoEvidenceY + 36, { fit: [96, 28], align: "center", valign: "center" });
          } catch {
            doc.fillColor(INK).fontSize(7).text(ui.summaryReportNotApplicable, x + 6, photoEvidenceY + 45, { width: 92, align: "center" });
          }
          doc.fillColor(MUTED).fontSize(6.5).text(fitText(formatAttachmentTitle(attachment), 34), x, photoEvidenceY + 74, { width: 104, align: "center" });
        });
        if (nonImageAttachments.length) {
          doc.fillColor(INK).fontSize(7).text(nonImageAttachments.map(formatAttachmentTitle).join("\n"), 410, photoEvidenceY + 34, {
            width: 120,
            height: 40,
          });
        }
      }

      doc.rect(46, signatureY, 503, 38).fillAndStroke(SOFT, "#c5ceda");
      drawSignatureLine(doc, "Date:", 58, signatureY + 14, 92);
      drawSignatureLine(doc, "Signature of responsible:", 166, signatureY + 14, 142);
      drawSignatureLine(doc, "Signature of Plant Manager / HSE Manager:", 326, signatureY + 14, 200);
      drawPortraitFooter(doc, { generatedOn, exportedBy: options.exportedBy, pageLabel: `3/${pageCount}` });

      return pdfBufferFromDocument(doc);
    })();

    if (options.includeXlsx === false) {
      return {
        pdf,
        xlsx: Buffer.alloc(0),
      };
    }

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("S-EWO");
    summary.columns = [
      { header: ui.field, key: "field", width: 32 },
      { header: ui.value, key: "value", width: 80 },
    ];
    summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };

    [
      [ui.plant, `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`],
      [ui.summaryStatus, localizedStatus],
      [ui.tableDate, formatDate(sewo.analysisDate)],
      [ui.summaryPerformedBy, sewo.performedBy?.name ?? ui.summaryReportNotApplicable],
      [ui.summaryCommunication, communicationCode],
      [ui.eventClassification, translated(sewo.eventClassification)],
      [ui.area, sewo.area?.name ?? "-"],
      [ui.workstation, sewo.whereText || sewo.line?.name || "-"],
      [ui.shift, sewo.shift?.name ?? "-"],
      [ui.involvedPerson, sewo.whoText],
      [ui.nature, sewo.whatText],
      [ui.usualJob, sewo.usualWorkYesNo ? ui.yes : ui.no],
      [ui.whichOperation, translated(sewo.whichText)],
      [ui.description, translated(sewo.howText)],
      [ui.immediateCorrectiveActionPlan, translated(sewo.immediateCorrectiveActionText)],
      [ui.analysis, translated(templateData.analysisText)],
      [ui.previousDetected, String(templateData.previousDetected ?? "-")],
      [ui.previousDetectedDescription, translated(templateData.previousDetectedDescription)],
    ].forEach(([field, value]) => summary.addRow({ field, value }));

    const whySheet = workbook.addWorksheet(worksheetName(ui.fiveWhy));
    whySheet.columns = [
      { header: ui.whyLabel, key: "why", width: 40 },
      { header: ui.answerLabel, key: "answer", width: 80 },
    ];
    whySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    whySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (fiveWhys.length === 0) {
      whySheet.addRow({ why: ui.noRecordsShort, answer: "-" });
    } else {
      fiveWhys.forEach((entry, index) => {
        whySheet.addRow({
          why: `${ui.whyLabel} ${index + 1}: ${translated(entry.why)}`,
          answer: translated(entry.answer),
        });
      });
    }

    const sifPsifSheet = workbook.addWorksheet(worksheetName(ui.sifPsifDecisionTree));
    sifPsifSheet.columns = [
      { header: ui.field, key: "field", width: 72 },
      { header: ui.value, key: "value", width: 28 },
    ];
    sifPsifSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sifPsifSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (!sifPsifDecision) {
      sifPsifSheet.addRow({ field: ui.sifPsifDecisionTree, value: ui.pendingResult });
    } else {
      [
        [ui.actualSifQuestion, yesNo(sifPsifDecision.actualSif)],
        [ui.sifPsifResult, getSifPsifResultLabel(sifPsifResult, ui)],
        ...SIF_PSIF_EXPOSURE_KEYS.map((key): [string, string] => [
          ui.sifPsifExposureQuestions[key],
          yesNo(sifPsifDecision.exposures[key]),
        ]),
        [ui.repeatedSifPotentialQuestion, yesNo(sifPsifDecision.repeatedSifPotential)],
        [ui.oneWhatIfAwayQuestion, yesNo(sifPsifDecision.oneWhatIfAway)],
        [ui.noPsifExplanation, translated(sifPsifDecision.noPsifExplanation)],
      ].forEach(([field, value]) => sifPsifSheet.addRow({ field, value }));
    }

    const rootCauseSheet = workbook.addWorksheet(worksheetName(ui.rootCauses));
    rootCauseSheet.columns = [
      { header: ui.cause, key: "cause", width: 50 },
      { header: ui.comment, key: "comment", width: 80 },
      { header: ui.rootCause, key: "root", width: 16 },
    ];
    rootCauseSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    rootCauseSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (rootCauseDetails.length === 0) {
      rootCauseSheet.addRow({ cause: ui.noRecordsShort, comment: "-", root: "-" });
    } else {
      rootCauseDetails.forEach((entry) => {
        rootCauseSheet.addRow({
          cause: translated(entry.label),
          comment: translated(entry.comment),
          root: yesNo(entry.isRootCause),
        });
      });
    }

    const actionsSheet = workbook.addWorksheet(worksheetName(ui.actionPlan));
    actionsSheet.columns = [
      { header: ui.title, key: "title", width: 40 },
      { header: ui.tableStatus, key: "status", width: 16 },
      { header: ui.owner, key: "owner", width: 24 },
      { header: ui.dueDate, key: "dueDate", width: 16 },
    ];
    actionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    actionsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (sewo.actionLinks.length === 0) {
      actionsSheet.addRow({ title: ui.noLinkedActions, status: "-", owner: "-", dueDate: "-" });
    } else {
      sewo.actionLinks.forEach((entry) => {
        actionsSheet.addRow({
          title: translated(entry.action.title),
          status: entry.action.status,
          owner: entry.action.ownerUser?.name ?? ui.summaryReportNotApplicable,
          dueDate: formatDate(entry.action.dueDate, ui.summaryReportNotApplicable),
        });
      });
    }

    [summary, whySheet, sifPsifSheet, rootCauseSheet, actionsSheet].forEach((sheet) => {
      sheet.eachRow((row, rowNumber) => {
        row.alignment = { vertical: "top", wrapText: true };
        if (rowNumber > 1 && rowNumber % 2 === 0) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      });
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    });

    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    return {
      pdf,
      xlsx: Buffer.from(xlsxBuffer as ArrayBuffer),
    };
  },

  async buildExternalSummaryExport(sewoId: string, options: { locale?: string } = {}) {
    const locale = options.locale ?? "en";
    const { ui } = await getLocalizedSewoUi(locale);
    const sewo = await prisma.sEWO.findUniqueOrThrow({
      where: { id: sewoId },
      include: {
        plant: true,
        communication: {
          include: {
            area: true,
            workstation: true,
            injuryType: true,
          },
        },
        attachments: true,
        causeSelections: {
          include: {
            causeItem: true,
          },
        },
        actionLinks: {
          include: {
            action: {
              include: {
                ownerUser: true,
              },
            },
          },
        },
        area: true,
        line: true,
      },
    });
    await localizeSewoMasterData(sewo, locale);
    const templateData = getSewoTemplateRecord(sewo.templateData);
    const sewoCode = getReadableSewoCode(sewo);
    const occurrenceType = formatSewoOccurrenceType({
      communicationType: sewo.communication?.type,
      templateEventType: templateData.eventType,
      eventClassification: sewo.eventClassification,
    });
    const translatableTexts = [
      occurrenceType,
      sewo.whatText,
      sewo.howText,
      ...sewo.causeSelections.flatMap((selection) => [selection.causeItem.label, selection.comment ?? ""]),
      ...(Array.isArray(templateData.rootCauseDetails)
        ? templateData.rootCauseDetails
            .filter((entry): entry is Record<string, unknown> => isRecord(entry))
            .flatMap((entry) => [getDisplayValue(entry.label, ""), getDisplayValue(entry.comment, "")])
        : []),
      ...sewo.actionLinks.flatMap((entry) => [entry.action.title, entry.action.description]),
    ];
    const translatedTexts = await translateForViewer(locale, translatableTexts);
    const translationByText = new Map(translatableTexts.map((text, index) => [text, translatedTexts[index] ?? text]));
    const translated = (text: unknown) => translationByText.get(getDisplayValue(text, "")) ?? getDisplayValue(text, "");
    const occurrenceDate = sewo.communication?.eventDatetime ?? sewo.analysisDate;
    const plantLabel = `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`;
    const summaryLocation = getSummaryLocation(sewo, ui.summaryReportNotApplicable);
    const sifPsifResult = getSifPsifResultFromTemplateData(sewo.templateData);
    const sifPsifLabel = sifPsifResult === "PENDING"
      ? ui.summaryReportNotApplicable
      : getSifPsifResultLabel(sifPsifResult, ui);
    const templateNatureId = getDisplayValue(templateData.natureId, "");
    const sewoNatureText = getDisplayValue(sewo.whatText, "");
    const injuryTypeLookupId = isUuid(templateNatureId)
      ? templateNatureId
      : isUuid(sewoNatureText)
        ? sewoNatureText
        : "";
    const injuryTypeFromMaster = !sewo.communication?.injuryType?.name && injuryTypeLookupId
      ? await prisma.injuryType.findFirst({
          where: {
            id: injuryTypeLookupId,
            plantId: sewo.plantId,
          },
          select: {
            name: true,
          },
        })
      : null;
    const injuryNatureText = getDisplayValue(
      sewo.communication?.injuryType?.name ?? injuryTypeFromMaster?.name ?? sewo.whatText,
      ui.summaryReportNotApplicable,
    );
    const rootCauseText = buildRootCauseText({
      templateData,
      causeSelections: sewo.causeSelections,
      translated,
      fallback: ui.summaryReportNotApplicable,
    });
    const photoAttachments = await loadAttachmentBuffers(sewo.attachments);
    const orderedActions = [...sewo.actionLinks].sort(
      (left, right) => getDateSortTime(left.action.dueDate) - getDateSortTime(right.action.dueDate),
    );

    const pdf = await (async () => {
      const doc = createPdfDocument({ margin: 40, size: "A4" });

      drawSummaryHeader(doc, {
        title: ui.summaryReportTitle,
        referenceLabel: ui.summaryReportReference,
        reference: sewoCode,
        plantLabel,
        generatedOnLabel: ui.generatedOn,
      });

      ensurePageSpace(doc, 190);
      drawSectionTitle(doc, ui.summaryReportGeneralInfo);
      drawFieldGrid(
        doc,
        [
          [ui.plant, plantLabel],
          [ui.summaryReportOccurrenceDate, formatDate(occurrenceDate)],
          [ui.summaryReportOccurrenceType, translated(occurrenceType)],
          [ui.summaryReportLocation, summaryLocation],
          [ui.summaryReportInjuryNature, getDisplayValue(translated(injuryNatureText), ui.summaryReportNotApplicable)],
        ],
        2,
      );

      ensurePageSpace(doc, 120);
      drawSectionTitle(doc, ui.summaryReportDescriptionSection);
      drawParagraphCard(
        doc,
        ui.description,
        getDisplayValue(translated(sewo.howText), ui.summaryReportNotApplicable),
      );

      ensurePageSpace(doc, 170);
      drawSectionTitle(doc, ui.summaryReportAnalysisSection);
      drawFieldGrid(
        doc,
        [[ui.summaryReportClassification, sifPsifLabel]],
        1,
      );
      drawParagraphCard(doc, ui.summaryReportRootCause, rootCauseText);

      ensurePageSpace(doc, 140);
      drawSectionTitle(doc, ui.summaryReportActionPlanSection);
      if (!orderedActions.length) {
        drawParagraphCard(doc, ui.actionPlan, ui.summaryReportNotApplicable);
      } else {
        orderedActions.forEach((entry) => {
          ensurePageSpace(doc, 128);
          drawParagraphCard(
            doc,
            `${translated(entry.action.title)} | ${ui.actionStatusLabels[entry.action.status] ?? entry.action.status}`,
            [
              `${ui.owner}: ${entry.action.ownerUser?.name ?? ui.summaryReportNotApplicable}`,
              `${ui.dueDate}: ${formatDate(entry.action.dueDate, ui.summaryReportNotApplicable)}`,
              `${ui.tableStatus}: ${ui.actionStatusLabels[entry.action.status] ?? entry.action.status}`,
              "",
              getDisplayValue(translated(entry.action.description), ui.summaryReportNotApplicable),
            ].join("\n"),
          );
        });
      }

      ensurePageSpace(doc, photoAttachments.length ? 300 : 120);
      drawSectionTitle(doc, ui.summaryReportPhotoEvidenceSection);
      if (!photoAttachments.length) {
        drawParagraphCard(doc, ui.summaryReportPhotoEvidenceSection, ui.summaryReportNotApplicable);
      } else {
        photoAttachments.forEach((attachment) => {
          try {
            drawPhotoCard(doc, {
              title: formatAttachmentTitle(attachment),
              imageBuffer: attachment.buffer,
            });
          } catch {
            drawParagraphCard(doc, formatAttachmentTitle(attachment), ui.summaryReportNotApplicable);
          }
        });
      }

      return pdfBufferFromDocument(doc);
    })();

    return {
      pdf,
    };
  },
};
