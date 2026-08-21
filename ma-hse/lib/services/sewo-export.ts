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

/**
 * A SEWO's actions can be linked either through the direct `Action.sewoId`
 * foreign key (`sewo.actions`) or through the `SEWOActionLink` join table
 * (`sewo.actionLinks`), see `collectLinkedActionStatuses` in sewo-service.ts.
 * Both must be combined and deduplicated by action id to get the full set.
 */
function mergeSewoActions<T extends { id: string }>(sewo: {
  actions: T[];
  actionLinks: Array<{ action: T }>;
}): T[] {
  const byId = new Map<string, T>();
  sewo.actions.forEach((action) => byId.set(action.id, action));
  sewo.actionLinks.forEach((entry) => byId.set(entry.action.id, entry.action));
  return Array.from(byId.values());
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

function normalizeMultilineText(value: unknown, fallback = "-") {
  const raw = getDisplayValue(value, fallback);
  if (raw === fallback) return fallback;
  return (
    raw
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || fallback
  );
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
}) {
  const footer = [
    "MA Srl",
    "S-EWO_MA_CLN Group",
    `Generated: ${input.generatedOn}`,
    `Exported by: ${input.exportedBy?.trim() || "-"}`,
  ].join("  |  ");
  doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(footer, 54, 812, { width: 430, align: "center" });
  doc.fillColor(INK);
}

const PORTRAIT_X = 46;
const PORTRAIT_WIDTH = 503;
const PORTRAIT_TOP = 72;
const PORTRAIT_BOTTOM = 795;

type PortraitBandSegment = { pageIndex: number; y: number; height: number; label: string; color: string };

function createPortraitReportFlow(doc: PdfDocument, input: { plant: string; generatedOn: string; exportedBy?: string | null }) {
  const bands: PortraitBandSegment[] = [];

  function currentPageIndex() {
    const range = doc.bufferedPageRange();
    return range.start + range.count - 1;
  }

  function startPage(title: string) {
    drawPortraitHeader(doc, { plant: input.plant, title, generatedOn: input.generatedOn, exportedBy: input.exportedBy });
    drawPortraitFooter(doc, { generatedOn: input.generatedOn, exportedBy: input.exportedBy });
    return PORTRAIT_TOP;
  }

  function newPage(title: string) {
    doc.addPage({ margin: 0, size: "A4" });
    return startPage(title);
  }

  function recordBand(pageIndex: number, y: number, height: number, label: string, color: string) {
    if (height <= 0) return;
    bands.push({ pageIndex, y, height, label, color });
  }

  function finalize() {
    const range = doc.bufferedPageRange();
    bands.forEach((band) => {
      doc.switchToPage(band.pageIndex);
      drawSideBand(doc, band.label, 16, band.y, band.height, band.color);
    });
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(`${index + 1}/${range.count}`, 520, 812, { width: 44, align: "right" });
    }
    doc.fillColor(INK);
  }

  return { currentPageIndex, startPage, newPage, recordBand, finalize };
}

/** Records a phase-band strip that may span a page break, filling any pages in between. */
function recordCrossPageBand(flow: ReturnType<typeof createPortraitReportFlow>, input: {
  startPage: number;
  startY: number;
  endPage: number;
  endY: number;
  label: string;
  color: string;
}) {
  if (input.startPage === input.endPage) {
    flow.recordBand(input.startPage, input.startY, input.endY - input.startY, input.label, input.color);
    return;
  }
  flow.recordBand(input.startPage, input.startY, PORTRAIT_BOTTOM - input.startY, input.label, input.color);
  for (let page = input.startPage + 1; page < input.endPage; page += 1) {
    flow.recordBand(page, PORTRAIT_TOP, PORTRAIT_BOTTOM - PORTRAIT_TOP, input.label, input.color);
  }
  flow.recordBand(input.endPage, PORTRAIT_TOP, input.endY - PORTRAIT_TOP, input.label, input.color);
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

function computeFieldGridRowHeights(doc: PdfDocument, input: { columns: number; cellWidth: number; cellHeight: number; entries: Array<[string, string]> }) {
  const rowHeights: number[] = [];
  for (let index = 0; index < input.entries.length; index += input.columns) {
    const rowEntries = input.entries.slice(index, index + input.columns);
    rowHeights.push(Math.max(
      input.cellHeight,
      ...rowEntries.map(([label, value]) => measureMiniField(doc, { label, value, width: input.cellWidth, height: input.cellHeight }).height),
    ));
  }
  return rowHeights;
}

function measureFieldGridHeight(doc: PdfDocument, input: { columns: number; cellWidth: number; cellHeight: number; gapY: number; entries: Array<[string, string]> }) {
  const rowHeights = computeFieldGridRowHeights(doc, input);
  if (rowHeights.length === 0) return 0;
  return rowHeights.reduce((sum, height) => sum + height, 0) + (rowHeights.length - 1) * input.gapY;
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
  const rowHeights = computeFieldGridRowHeights(doc, input);
  let cursorY = input.y;
  rowHeights.forEach((rowHeight, rowIndex) => {
    const rowEntries = input.entries.slice(rowIndex * input.columns, rowIndex * input.columns + input.columns);
    rowEntries.forEach(([label, value], column) => {
      drawMiniField(doc, {
        label,
        value,
        x: input.x + column * (input.cellWidth + input.gapX),
        y: cursorY,
        width: input.cellWidth,
        height: rowHeight,
      });
    });
    cursorY += rowHeight + input.gapY;
  });
  return cursorY - input.gapY - input.y;
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

function measureMiniField(doc: PdfDocument, input: { label: string; value: string; width: number; height: number }) {
  const labelWidth = input.width - 12;
  const compact = input.height <= 34;
  const labelHeight = compact ? 8 : Math.min(11, doc.fontSize(6.2).heightOfString(input.label.toUpperCase(), { width: labelWidth }));
  const valueTop = compact ? 18 : 8 + labelHeight + 3;
  const text = normalizeMultilineText(input.value);
  const contentHeight = doc.fontSize(7.5).heightOfString(text, { width: labelWidth });
  const height = Math.max(input.height, valueTop + contentHeight + 6);
  return { height, text, labelWidth, labelHeight, valueTop };
}

function drawMiniField(doc: PdfDocument, input: {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const measured = measureMiniField(doc, input);
  doc.rect(input.x, input.y, input.width, measured.height).fillAndStroke(SOFT, "#c5ceda");
  doc.fillColor(MUTED).fontSize(6.2).font("Helvetica-Bold").text(input.label.toUpperCase(), input.x + 6, input.y + 6, {
    width: measured.labelWidth,
    height: measured.labelHeight,
  });
  doc.fillColor(INK).fontSize(7.5).font("Helvetica").text(measured.text, input.x + 6, input.y + measured.valueTop, {
    width: measured.labelWidth,
  });
  doc.fillColor(INK).font("Helvetica");
  return measured.height;
}

function measureTextBox(doc: PdfDocument, input: { label: string; value: string; width: number; minHeight: number }) {
  const labelWidth = input.width - 14;
  const compact = input.minHeight <= 48;
  const labelHeight = compact ? 10 : Math.min(14, doc.fontSize(6.8).heightOfString(input.label.toUpperCase(), { width: labelWidth }));
  const valueTop = 9 + labelHeight + 4;
  const fontSize = input.minHeight >= 80 ? 6.8 : 7.6;
  const text = normalizeMultilineText(input.value);
  const contentHeight = doc.fontSize(fontSize).heightOfString(text, { width: labelWidth });
  const height = Math.max(input.minHeight, valueTop + contentHeight + 8);
  return { height, text, labelWidth, labelHeight, valueTop, fontSize };
}

function drawTextBox(doc: PdfDocument, input: {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  minHeight: number;
}) {
  const measured = measureTextBox(doc, input);
  doc.rect(input.x, input.y, input.width, measured.height).fillAndStroke(WHITE, "#c5ceda");
  doc.fillColor(MUTED).fontSize(6.8).font("Helvetica-Bold").text(input.label.toUpperCase(), input.x + 7, input.y + 7, {
    width: measured.labelWidth,
    height: measured.labelHeight,
  });
  doc.fillColor(INK).fontSize(measured.fontSize).font("Helvetica").text(measured.text, input.x + 7, input.y + measured.valueTop, {
    width: measured.labelWidth,
  });
  doc.strokeColor(INK).fillColor(INK).font("Helvetica");
  return measured.height;
}

function drawTextBoxRow(doc: PdfDocument, y: number, boxes: Array<{ label: string; value: string; x: number; width: number; minHeight: number }>) {
  const rowHeight = Math.max(...boxes.map((box) => measureTextBox(doc, box).height));
  boxes.forEach((box) => drawTextBox(doc, { ...box, y, minHeight: rowHeight }));
  return rowHeight;
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

function measureTableRowHeight(doc: PdfDocument, row: string[], widths: number[], minRowHeight: number) {
  return Math.max(
    minRowHeight,
    ...row.map((cell, index) => doc.fontSize(7).heightOfString(normalizeMultilineText(cell), { width: widths[index] - 12 }) + 10),
  );
}

function measureTableHeight(doc: PdfDocument, rows: string[][], widths: number[], minRowHeight: number) {
  const effectiveRows = rows.length === 0 ? [widths.map(() => "-")] : rows;
  return effectiveRows.reduce((sum, row) => sum + measureTableRowHeight(doc, row, widths, minRowHeight), 24);
}

function drawTableHeaderRow(doc: PdfDocument, input: { x: number; y: number; widths: number[]; headers: string[] }) {
  const tableWidth = input.widths.reduce((sum, width) => sum + width, 0);
  doc.rect(input.x, input.y, tableWidth, 24).fillAndStroke(SOFT, "#c5ceda");
  let cursorX = input.x;
  input.headers.forEach((header, index) => {
    doc.fillColor(INK).fontSize(7).font("Helvetica-Bold").text(header.toUpperCase(), cursorX + 6, input.y + 8, {
      width: input.widths[index] - 12,
      align: "center",
    });
    cursorX += input.widths[index];
  });
  doc.fillColor(INK).font("Helvetica");
  return 24;
}

function drawTableDataRow(doc: PdfDocument, input: { x: number; y: number; widths: number[]; row: string[]; height: number; shaded: boolean }) {
  const tableWidth = input.widths.reduce((sum, width) => sum + width, 0);
  doc.rect(input.x, input.y, tableWidth, input.height).fillAndStroke(input.shaded ? SOFT : WHITE, "#dbe3ee");
  let cursorX = input.x;
  input.row.forEach((cell, index) => {
    doc.fillColor(INK).fontSize(7).font("Helvetica").text(normalizeMultilineText(cell), cursorX + 6, input.y + 7, {
      width: input.widths[index] - 12,
    });
    cursorX += input.widths[index];
  });
  doc.fillColor(INK).font("Helvetica");
}

function drawTableColumnDividers(doc: PdfDocument, input: { x: number; y: number; height: number; widths: number[] }) {
  if (input.height <= 0) return;
  let cursorX = input.x;
  input.widths.forEach((width) => {
    cursorX += width;
    doc.moveTo(cursorX, input.y).lineTo(cursorX, input.y + input.height).strokeColor("#c5ceda").stroke();
  });
  doc.strokeColor(INK);
}

/**
 * Draws a table with per-row height sized to its tallest cell (no truncation).
 * When `pageBottom`/`startNewPage` are provided, a row that would overflow the
 * current page starts a new page (via `startNewPage`) and repeats the header
 * there instead of splitting or dropping rows. Returns the Y position right
 * after the table on whichever page it finished on.
 */
function drawLandscapeTable(doc: PdfDocument, input: {
  x: number;
  y: number;
  widths: number[];
  minRowHeight: number;
  headers: string[];
  rows: string[][];
  pageBottom?: number;
  startNewPage?: () => number;
}) {
  const rows = input.rows.length === 0 ? [input.headers.map(() => "-")] : input.rows;
  let cursorY = input.y;
  let segmentTop = cursorY;
  cursorY += drawTableHeaderRow(doc, { x: input.x, y: cursorY, widths: input.widths, headers: input.headers });

  rows.forEach((row, index) => {
    const rowHeight = measureTableRowHeight(doc, row, input.widths, input.minRowHeight);
    if (input.pageBottom !== undefined && input.startNewPage && cursorY + rowHeight > input.pageBottom) {
      drawTableColumnDividers(doc, { x: input.x, y: segmentTop, height: cursorY - segmentTop, widths: input.widths });
      cursorY = input.startNewPage();
      segmentTop = cursorY;
      cursorY += drawTableHeaderRow(doc, { x: input.x, y: cursorY, widths: input.widths, headers: input.headers });
    }
    drawTableDataRow(doc, { x: input.x, y: cursorY, widths: input.widths, row, height: rowHeight, shaded: index % 2 === 0 });
    cursorY += rowHeight;
  });

  drawTableColumnDividers(doc, { x: input.x, y: segmentTop, height: cursorY - segmentTop, widths: input.widths });
  return cursorY;
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
        actions: {
          include: {
            ownerUser: true,
          },
          orderBy: {
            dueDate: "asc",
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
    const mergedActions = mergeSewoActions(sewo);
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
      ...mergedActions.flatMap((action) => [action.title, action.description]),
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
    const orderedActions = [...mergedActions].sort(
      (left, right) => getDateSortTime(left.dueDate) - getDateSortTime(right.dueDate),
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
      const anatomyRequired = isInjuryClassification({
        communicationType,
        eventClassification: display(sewo.eventClassification),
        pyramidLevel: selectedPyramidLevel,
      });
      const bodyLocationText = anatomyRequired && bodyPartName === ui.summaryReportNotApplicable
        ? "Body location not specified"
        : bodyPartName;

      const flow = createPortraitReportFlow(doc, {
        plant: sewo.plant.code.toUpperCase(),
        generatedOn,
        exportedBy: options.exportedBy,
      });

      const pageOneTitle = "SAFETY EWO - COMPLETE REPORT";
      const pageTwoTitle = "SAFETY EWO - ANALYSIS";
      const pageThreeTitle = "SAFETY EWO - ROOT CAUSE & ACTION PLAN";

      /** Draws a title+table panel whose rows never truncate: a row that would
       * overflow the current page starts a continuation page (repeating the
       * table header) instead of splitting or dropping it. */
      function drawPanelWithTable(input: {
        y: number;
        title: string;
        color: string;
        headers: string[];
        rows: string[][];
        widths: number[];
        minRowHeight: number;
        continuationTitle: string;
      }) {
        const startPage = flow.currentPageIndex();
        const natural = 30 + measureTableHeight(doc, input.rows, input.widths, input.minRowHeight) + 10;
        const available = PORTRAIT_BOTTOM - input.y;
        const firstHeight = Math.max(60, Math.min(natural, available));
        drawPortraitPanel(doc, { x: PORTRAIT_X, y: input.y, width: PORTRAIT_WIDTH, height: firstHeight, title: input.title, color: input.color });
        const endY = drawLandscapeTable(doc, {
          x: 56,
          y: input.y + 30,
          widths: input.widths,
          minRowHeight: input.minRowHeight,
          headers: input.headers,
          rows: input.rows,
          pageBottom: PORTRAIT_BOTTOM,
          startNewPage: () => {
            const top = flow.newPage(input.continuationTitle);
            drawPortraitPanel(doc, { x: PORTRAIT_X, y: top, width: PORTRAIT_WIDTH, height: PORTRAIT_BOTTOM - top, title: input.title, color: input.color });
            return top + 30;
          },
        });
        return { startPage, endPage: flow.currentPageIndex(), endY };
      }

      // ---------------- PAGE 1 ----------------
      let cursorY = flow.startPage(pageOneTitle);
      let cursorPage = flow.currentPageIndex();
      flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);

      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: 150, title: "Event classification / communication type", color: GREEN });
      drawPyramid(doc, { x: 54, y: cursorY + 20, width: 284, selectedLevel: selectedPyramidLevel });
      drawMiniField(doc, { label: "Lost days", value: getDisplayValue(lostDays, ui.summaryReportNotApplicable), x: 376, y: cursorY + 36, width: 70, height: 38 });
      drawMiniField(doc, { label: "1st prognosis", value: getDisplayValue(templateData.initialLostDays, ui.summaryReportNotApplicable), x: 456, y: cursorY + 36, width: 78, height: 38 });
      drawMiniField(doc, { label: "Communication type", value: communicationType || ui.summaryReportNotApplicable, x: 376, y: cursorY + 86, width: 158, height: 38 });
      cursorY += 160;

      const generalInfoEntries: Array<[string, string]> = [
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
      ];
      const generalInfoContentHeight = measureFieldGridHeight(doc, { columns: 4, cellWidth: 116, cellHeight: 31, gapY: 6, entries: generalInfoEntries });
      const generalInfoPanelHeight = Math.max(178, generalInfoContentHeight + 40);
      if (cursorY + generalInfoPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageOneTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: generalInfoPanelHeight, title: "General information", color: BRAND });
      drawPortraitFieldGrid(doc, { x: 56, y: cursorY + 30, columns: 4, cellWidth: 116, cellHeight: 31, gapX: 6, gapY: 6, entries: generalInfoEntries });
      cursorY += generalInfoPanelHeight + 10;

      const analysisBoxes = [
        { label: "WHAT - nature and body location", value: `${injuryTypeName} | ${bodyLocationText}`, minHeight: 36 },
        { label: "WHERE - workplace, machine, press, line, etc.", value: occurrenceLocation, minHeight: 36 },
        { label: "WHO - usual job of the injured person", value: getDisplayValue(sewo.whoText, ui.summaryReportNotApplicable), minHeight: 36 },
        { label: "HOW - how did the accident happen", value: display(sewo.howText), minHeight: 42 },
      ];
      const analysisStackHeight = analysisBoxes.reduce((sum, box) => sum + measureTextBox(doc, { ...box, width: 224 }).height, 0) + (analysisBoxes.length - 1) * 6;
      const immediateActionMeasured = measureTextBox(doc, { label: "Immediate action description", value: display(sewo.immediateCorrectiveActionText), width: 106, minHeight: 126 });
      const rootCausePreviewRows = rootCauseDetails.slice(0, 2).map((entry) => [display(entry.label), display(entry.comment), yesNo(entry.isRootCause)]);
      const rootCausePreviewHeight = measureTableHeight(doc, rootCausePreviewRows, [70, 112, 46], 18);
      const panelDContentHeight = immediateActionMeasured.height + 8 + rootCausePreviewHeight;
      const analysisRowHeight = Math.max(228, 30 + analysisStackHeight + 10, 30 + panelDContentHeight + 10);
      if (cursorY + analysisRowHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageOneTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: 244, height: analysisRowHeight, title: "Analysis - event description", color: TEAL });
      let boxY = cursorY + 30;
      analysisBoxes.forEach((box) => {
        const height = drawTextBox(doc, { label: box.label, value: box.value, x: 56, y: boxY, width: 224, minHeight: box.minHeight });
        boxY += height + 6;
      });

      drawPortraitPanel(doc, { x: 302, y: cursorY, width: 247, height: analysisRowHeight, title: "Immediate action and classification", color: BLUE });
      drawAnatomyPanel(doc, {
        x: 312,
        y: cursorY + 30,
        width: 112,
        height: 126,
        bodyPart: bodyLocationText,
        bodyPartCode: sewo.communication?.bodyPart?.code ?? null,
        injuryType: injuryTypeName,
        required: anatomyRequired,
      });
      drawTextBox(doc, { label: "Immediate action description", value: display(sewo.immediateCorrectiveActionText), x: 432, y: cursorY + 30, width: 106, minHeight: 126 });
      drawLandscapeTable(doc, {
        x: 312,
        y: cursorY + 30 + immediateActionMeasured.height + 8,
        widths: [70, 112, 46],
        minRowHeight: 18,
        headers: ["Category", "Check possible causes", "Root cause"],
        rows: rootCausePreviewRows,
      });
      cursorY += analysisRowHeight + 10;

      const previousDetectedText = normalizeMultilineText(display(templateData.previousDetectedDescription));
      const previousDetectedTextHeight = doc.fontSize(7).heightOfString(previousDetectedText, { width: 390 });
      const ucUaPanelHeight = Math.max(54, 30 + Math.max(previousDetectedTextHeight, 14) + 14);
      if (cursorY + ucUaPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageOneTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: ucUaPanelHeight, title: "UC / UA related to the event", color: GREEN });
      doc.fillColor(INK).fontSize(7.5).font("Helvetica").text("Have any UA/UC related to the dynamic and root causes been previously detected?", 58, cursorY + 29, { width: 280 });
      drawCheckbox(doc, { x: 345, y: cursorY + 27, checked: isSewoRootCauseAffirmative(templateData.previousDetected), label: ui.yes });
      drawCheckbox(doc, { x: 400, y: cursorY + 27, checked: templateData.previousDetected === "NO" || templateData.previousDetected === false, label: ui.no });
      doc.fillColor(MUTED).fontSize(7).font("Helvetica-Bold").text("Description:", 58, cursorY + 44, { width: 70 });
      doc.fillColor(INK).fontSize(7).font("Helvetica").text(previousDetectedText, 132, cursorY + 44, { width: 390 });

      // ---------------- PAGE 2 ----------------
      cursorY = flow.newPage(pageTwoTitle);
      cursorPage = flow.currentPageIndex();
      flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);

      const occurrenceBoxes = [
        { label: "Description", value: occurrenceDescription, x: 56, width: 156, minHeight: 96 },
        { label: "How did the accident happen?", value: display(sewo.howText), x: 220, width: 156, minHeight: 96 },
        { label: "Immediate corrective action plan", value: display(sewo.immediateCorrectiveActionText), x: 384, width: 154, minHeight: 96 },
      ];
      const occurrenceRowHeight = Math.max(...occurrenceBoxes.map((box) => measureTextBox(doc, box).height));
      const occurrencePanelHeight = Math.max(154, 30 + occurrenceRowHeight + 10);
      if (cursorY + occurrencePanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageTwoTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: occurrencePanelHeight, title: "Occurrence description", color: GREEN });
      occurrenceBoxes.forEach((box) => drawTextBox(doc, { ...box, y: cursorY + 30, minHeight: occurrenceRowHeight }));
      cursorY += occurrencePanelHeight + 10;

      const analysisTextMeasured = measureTextBox(doc, { label: "Analysis text", value: display(templateData.analysisText), width: 260, minHeight: 48 });
      const havePreviousMeasured = measureMiniField(doc, { label: "Have previous UA / UC been detected?", value: yesNo(templateData.previousDetected), width: 96, height: 48 });
      const describePreviousMeasured = measureTextBox(doc, { label: "Describe previous detection", value: display(templateData.previousDetectedDescription), width: 108, minHeight: 48 });
      const analysisContentHeight = Math.max(analysisTextMeasured.height, havePreviousMeasured.height, describePreviousMeasured.height);
      const analysisPanelHeight = Math.max(92, 30 + analysisContentHeight + 10);
      if (cursorY + analysisPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageTwoTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: analysisPanelHeight, title: "Analysis", color: TEAL });
      drawTextBox(doc, { label: "Analysis text", value: display(templateData.analysisText), x: 56, y: cursorY + 30, width: 260, minHeight: analysisContentHeight });
      drawMiniField(doc, { label: "Have previous UA / UC been detected?", value: yesNo(templateData.previousDetected), x: 326, y: cursorY + 30, width: 96, height: analysisContentHeight });
      drawTextBox(doc, { label: "Describe previous detection", value: display(templateData.previousDetectedDescription), x: 430, y: cursorY + 30, width: 108, minHeight: analysisContentHeight });
      cursorY += analysisPanelHeight + 10;

      const fiveWhyRows = fiveWhys.map((entry, index) => [`${ui.whyLabel} ${index + 1}`, display(entry.why), display(entry.answer)]);
      const fiveWhyTableHeight = measureTableHeight(doc, fiveWhyRows, [58, 210, 213], 18);
      const fiveWhyPanelHeight = Math.max(118, 30 + fiveWhyTableHeight + 10);
      if (cursorY + fiveWhyPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageTwoTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: fiveWhyPanelHeight, title: "5 Why", color: BLUE });
      drawLandscapeTable(doc, { x: 56, y: cursorY + 30, widths: [58, 210, 213], minRowHeight: 18, headers: [ui.whyLabel, ui.question, ui.answerLabel], rows: fiveWhyRows });
      cursorY += fiveWhyPanelHeight + 10;

      const sifRows: string[][] = sifPsifDecision
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
      const sifTableHeight = measureTableHeight(doc, sifRows, [358, 123], 16);
      const sifPanelHeight = Math.max(222, 30 + sifTableHeight + 10);
      if (cursorY + sifPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageTwoTitle);
        cursorPage = flow.currentPageIndex();
        flow.recordBand(cursorPage, 68, 720, "PLAN", GREEN);
      }
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: sifPanelHeight, title: "SIF / PSIF decision tree", color: BRAND });
      drawLandscapeTable(doc, { x: 56, y: cursorY + 30, widths: [358, 123], minRowHeight: 16, headers: [ui.field, ui.value], rows: sifRows });

      // ---------------- PAGE 3 ----------------
      cursorY = flow.newPage(pageThreeTitle);
      cursorPage = flow.currentPageIndex();

      const rootCauseRows = rootCauseDetails.map((entry) => [display(entry.label), yesNo(entry.isRootCause), display(entry.comment)]);
      const rootCauseResult = drawPanelWithTable({
        y: cursorY,
        title: "Root cause analysis",
        color: GREEN,
        headers: [ui.cause, ui.rootCause, ui.comment],
        rows: rootCauseRows,
        widths: [170, 70, 241],
        minRowHeight: 20,
        continuationTitle: pageThreeTitle,
      });

      const rootCauseCategoryRowHeight = 44;
      const causeCategoryTitles = [
        "Competence / Knowledge",
        "Attitude / Behavior",
        "Management",
        "Precaution / Attention",
        "Personal Condition",
        "Facilities / Equipment",
        "Procedure / Systems",
      ];
      const rootCauseCategoryHeight = Math.ceil(causeCategoryTitles.length / 3) * rootCauseCategoryRowHeight + 2 * 6;
      let categoryY = rootCauseResult.endY + 8;
      let categoryPage = rootCauseResult.endPage;
      if (categoryY + rootCauseCategoryHeight > PORTRAIT_BOTTOM) {
        categoryY = flow.newPage(pageThreeTitle);
        categoryPage = flow.currentPageIndex();
      }
      drawCauseCategoryBoxes(doc, {
        x: 56,
        y: categoryY,
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
      recordCrossPageBand(flow, { startPage: rootCauseResult.startPage, startY: cursorY, endPage: categoryPage, endY: categoryY + rootCauseCategoryHeight, label: "PLAN", color: GREEN });
      cursorY = categoryY + rootCauseCategoryHeight + 10;
      cursorPage = categoryPage;

      const correctionPlanRows = orderedActions.map((action) => [
        `${display(action.title)} - ${display(action.description)}`,
        action.ownerUser?.name ?? ui.summaryReportNotApplicable,
        formatDate(action.dueDate, ui.summaryReportNotApplicable),
        ui.actionStatusLabels[action.status] ?? action.status,
      ]);
      const correctionPlanResult = drawPanelWithTable({
        y: cursorY,
        title: "Correction plan",
        color: BLUE,
        headers: ["Correction plan", ui.owner, "Closure date", ui.tableStatus],
        rows: correctionPlanRows,
        widths: [204, 116, 78, 83],
        minRowHeight: 18,
        continuationTitle: pageThreeTitle,
      });
      recordCrossPageBand(flow, { startPage: cursorPage, startY: cursorY, endPage: correctionPlanResult.endPage, endY: correctionPlanResult.endY, label: "DO", color: BLUE });
      cursorY = correctionPlanResult.endY + 10;
      cursorPage = correctionPlanResult.endPage;

      const checkPanelHeight = 64;
      if (cursorY + checkPanelHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageThreeTitle);
        cursorPage = flow.currentPageIndex();
      }
      const checkPanelY = cursorY;
      const checkPanelStartPage = cursorPage;
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: checkPanelHeight, title: "Check of suitability for the planned activity", color: DANGER });
      doc.fillColor(INK).fontSize(7.2).font("Helvetica").text("In the last 3 months did any event occur due to the same root cause?", 58, cursorY + 30, { width: 300 });
      drawCheckbox(doc, { x: 366, y: cursorY + 28, checked: false, label: ui.yes });
      drawCheckbox(doc, { x: 420, y: cursorY + 28, checked: false, label: ui.no });
      drawSignatureLine(doc, "Checked by:", 58, cursorY + 48, 150);
      drawSignatureLine(doc, "Date:", 222, cursorY + 48, 118);
      drawSignatureLine(doc, "Signature:", 356, cursorY + 48, 170);
      flow.recordBand(checkPanelStartPage, checkPanelY, checkPanelHeight, "CHECK", DANGER);
      cursorY += checkPanelHeight + 8;

      const extensionPlanText = normalizeMultilineText(
        getDisplayValue(
          templateData.extensionPlan ?? templateData.extensionPlanText ?? templateData.similarAreasPlan ?? templateData.planTiming,
          ui.summaryReportNotApplicable,
        ),
      );
      const extensionTextHeight = doc.fontSize(7.5).heightOfString(extensionPlanText, { width: 468 });
      const extensionPlanHeight = Math.max(62, 36 + extensionTextHeight + 10);
      if (cursorY + extensionPlanHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageThreeTitle);
        cursorPage = flow.currentPageIndex();
      }
      const extensionPlanY = cursorY;
      const extensionPlanStartPage = cursorPage;
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: cursorY, width: PORTRAIT_WIDTH, height: extensionPlanHeight, title: "Extension plan to areas with similar problems and plan timing", color: YELLOW });
      doc.fillColor(INK).fontSize(7.5).font("Helvetica").text(extensionPlanText, 58, cursorY + 30, { width: 468 });
      flow.recordBand(extensionPlanStartPage, extensionPlanY, extensionPlanHeight, "ACT", YELLOW);
      cursorY += extensionPlanHeight + 8;

      const photoEvidenceHeight = 84;
      if (cursorY + photoEvidenceHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageThreeTitle);
        cursorPage = flow.currentPageIndex();
      }
      const photoEvidenceY = cursorY;
      drawPortraitPanel(doc, { x: PORTRAIT_X, y: photoEvidenceY, width: PORTRAIT_WIDTH, height: photoEvidenceHeight, title: "Photo evidence", color: BRAND });
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
      cursorY = photoEvidenceY + photoEvidenceHeight + 10;

      const signatureHeight = 38;
      if (cursorY + signatureHeight > PORTRAIT_BOTTOM) {
        cursorY = flow.newPage(pageThreeTitle);
        cursorPage = flow.currentPageIndex();
      }
      doc.rect(PORTRAIT_X, cursorY, PORTRAIT_WIDTH, signatureHeight).fillAndStroke(SOFT, "#c5ceda");
      drawSignatureLine(doc, "Date:", 58, cursorY + 14, 92);
      drawSignatureLine(doc, "Signature of responsible:", 166, cursorY + 14, 142);
      drawSignatureLine(doc, "Signature of Plant Manager / HSE Manager:", 326, cursorY + 14, 200);

      flow.finalize();

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
    if (orderedActions.length === 0) {
      actionsSheet.addRow({ title: ui.noLinkedActions, status: "-", owner: "-", dueDate: "-" });
    } else {
      orderedActions.forEach((action) => {
        actionsSheet.addRow({
          title: translated(action.title),
          status: action.status,
          owner: action.ownerUser?.name ?? ui.summaryReportNotApplicable,
          dueDate: formatDate(action.dueDate, ui.summaryReportNotApplicable),
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
        actions: {
          include: {
            ownerUser: true,
          },
          orderBy: {
            dueDate: "asc",
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
      ...mergeSewoActions(sewo).flatMap((action) => [action.title, action.description]),
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
    const orderedActions = [...mergeSewoActions(sewo)].sort(
      (left, right) => getDateSortTime(left.dueDate) - getDateSortTime(right.dueDate),
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
        orderedActions.forEach((action) => {
          ensurePageSpace(doc, 128);
          drawParagraphCard(
            doc,
            `${translated(action.title)} | ${ui.actionStatusLabels[action.status] ?? action.status}`,
            [
              `${ui.owner}: ${action.ownerUser?.name ?? ui.summaryReportNotApplicable}`,
              `${ui.dueDate}: ${formatDate(action.dueDate, ui.summaryReportNotApplicable)}`,
              `${ui.tableStatus}: ${ui.actionStatusLabels[action.status] ?? action.status}`,
              "",
              getDisplayValue(translated(action.description), ui.summaryReportNotApplicable),
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
