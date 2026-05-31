import ExcelJS from "exceljs";
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
import {
  formatSewoOccurrenceType,
  getSewoTemplateRecord,
  getSifPsifResultFromTemplateData,
} from "@/lib/services/sewo-validation-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { formatLocalizedSewoStatus, type SewoUi } from "@/lib/sewo-ui";

type PdfDocument = ReturnType<typeof createPdfDocument>;

const BRAND = "#002663";
const INK = "#0f172a";
const MUTED = "#64748b";
const PANEL = "#e2e8f0";
const SOFT = "#f8fafc";
const WHITE = "#ffffff";
const SUCCESS = "#047857";
const WARNING = "#d97706";
const DANGER = "#b91c1c";

type ExportAttachment = {
  fileName: string;
  contentType: string;
  fileKey: string;
};

type CompleteReportOptions = {
  locale?: string;
  exportedBy?: string | null;
};

function pdfBufferFromDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
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
  doc.roundedRect(40, 36, 515, 92, 18).fill(BRAND);
  doc.fillColor("#ffffff").fontSize(12).text("MAx Safety", 58, 54);
  doc.fontSize(21).text(input.title, 58, 72, { width: 320 });
  doc.fontSize(9).text(`${input.referenceLabel}: ${input.reference}`, 58, 106, { width: 240 });
  doc.fontSize(10).text(input.plantLabel, 320, 60, { width: 217, align: "right" });
  doc.text(`${input.generatedOnLabel} ${formatDate(new Date())}`, 320, 104, { width: 217, align: "right" });
  doc.y = 146;
  doc.fillColor(INK);
}

function drawBadge(doc: PdfDocument, label: string, x: number, y: number, fillColor = BRAND) {
  const normalized = label.trim() || "-";
  const width = Math.min(180, Math.max(58, doc.widthOfString(normalized) + 22));
  doc.roundedRect(x, y, width, 20, 10).fill(fillColor);
  doc.fillColor(WHITE).fontSize(8).text(normalized, x + 11, y + 6, { width: width - 22, align: "center" });
  doc.fillColor(INK);
  return width;
}

function drawCompleteHeader(doc: PdfDocument, input: {
  title: string;
  referenceLabel: string;
  reference: string;
  plant: string;
  generatedOnLabel: string;
  generatedOn: string;
  exportedBy?: string | null;
  status: string;
  eventClassification: string;
  sifPsifLabel: string;
  sifPsifColor: string;
}) {
  doc.roundedRect(40, 36, 515, 118, 18).fill(BRAND);
  doc.fillColor(WHITE).fontSize(11).text("MAx Safety", 58, 54);
  doc.fontSize(24).text(input.title, 58, 72, { width: 310 });
  doc.fontSize(9).text(`${input.referenceLabel}: ${input.reference}`, 58, 108, { width: 260 });
  doc.text(input.plant, 320, 56, { width: 217, align: "right" });
  doc.text(`${input.generatedOnLabel} ${input.generatedOn}`, 320, 106, { width: 217, align: "right" });
  if (input.exportedBy?.trim()) {
    doc.text(`Exported by: ${input.exportedBy.trim()}`, 320, 122, { width: 217, align: "right" });
  }

  doc.y = 170;
  drawBadge(doc, input.status, 40, 164, SUCCESS);
  drawBadge(doc, input.eventClassification, 40 + Math.min(180, Math.max(58, doc.widthOfString(input.status.trim() || "-") + 22)) + 8, 164, WARNING);
  drawBadge(doc, input.sifPsifLabel, 430, 164, input.sifPsifColor);
  doc.y = 196;
  doc.fillColor(INK);
}

function drawCompactTable(doc: PdfDocument, input: {
  headers: string[];
  rows: string[][];
  widths: number[];
}) {
  const x = 40;
  const rowPadding = 8;
  const headerHeight = 26;
  const tableWidth = input.widths.reduce((sum, width) => sum + width, 0);

  ensurePageSpace(doc, headerHeight + 34);
  doc.roundedRect(x, doc.y, tableWidth, headerHeight, 8).fill(BRAND);
  let cursorX = x;
  input.headers.forEach((header, index) => {
    doc.fillColor(WHITE).fontSize(8).text(header.toUpperCase(), cursorX + rowPadding, doc.y + 9, {
      width: input.widths[index] - rowPadding * 2,
    });
    cursorX += input.widths[index];
  });
  doc.y += headerHeight;

  input.rows.forEach((row, rowIndex) => {
    const cellHeights = row.map((cell, index) => doc.heightOfString(cell || "-", {
      width: input.widths[index] - rowPadding * 2,
    }));
    const rowHeight = Math.max(38, Math.max(...cellHeights) + rowPadding * 2);
    ensurePageSpace(doc, rowHeight + 4);
    const rowY = doc.y;
    doc.roundedRect(x, rowY, tableWidth, rowHeight, 6).fillAndStroke(rowIndex % 2 === 0 ? SOFT : WHITE, PANEL);
    cursorX = x;
    row.forEach((cell, index) => {
      doc.fillColor(INK).fontSize(9).text(cell || "-", cursorX + rowPadding, rowY + rowPadding, {
        width: input.widths[index] - rowPadding * 2,
      });
      cursorX += input.widths[index];
    });
    doc.y = rowY + rowHeight + 4;
  });
  doc.fillColor(INK);
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

function addPageFooters(doc: PdfDocument, input: {
  generatedOnLabel: string;
  generatedOn: string;
  exportedBy?: string | null;
}) {
  const withBufferedPages = doc as PdfDocument & {
    bufferedPageRange?: () => { start: number; count: number };
    switchToPage?: (pageNumber: number) => void;
  };

  if (typeof withBufferedPages.bufferedPageRange !== "function" || typeof withBufferedPages.switchToPage !== "function") {
    return;
  }

  const range = withBufferedPages.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    withBufferedPages.switchToPage(index);
    const pageNumber = index - range.start + 1;
    const footerParts = [
      `${input.generatedOnLabel} ${input.generatedOn}`,
      input.exportedBy?.trim() ? `Exported by: ${input.exportedBy.trim()}` : "",
      `Page ${pageNumber}/${range.count}`,
    ].filter(Boolean);
    doc.fillColor(MUTED).fontSize(8).text(footerParts.join(" | "), 40, doc.page.height - 32, {
      width: 515,
      align: "center",
    });
  }
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
            workstation: true,
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

    const templateData = (sewo.templateData as Record<string, unknown> | null) ?? {};
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
      (left, right) => left.action.dueDate.getTime() - right.action.dueDate.getTime(),
    );

    const pdf = await (async () => {
      const doc = createPdfDocument({ margin: 40, size: "A4", bufferPages: true });

      drawCompleteHeader(doc, {
        title: "S-EWO Complete Report",
        referenceLabel: ui.summaryReportReference,
        reference: sewo.id,
        plant: plantLabel,
        generatedOnLabel: ui.generatedOn,
        generatedOn,
        exportedBy: options.exportedBy,
        status: localizedStatus,
        eventClassification: display(sewo.eventClassification),
        sifPsifLabel,
        sifPsifColor: sifPsifResult === "SIF" ? DANGER : sifPsifResult === "PSIF" ? WARNING : BRAND,
      });

      drawFieldGrid(
        doc,
        [
          [ui.plant, plantLabel],
          [ui.summaryReportReference, sewo.id],
          [ui.summaryStatus, localizedStatus],
          [ui.tableDate, formatDate(sewo.analysisDate)],
          [ui.summaryPerformedBy, sewo.performedBy.name],
          [ui.summaryCommunication, sewo.communication?.id ?? "-"],
          [ui.validatedBy, sewo.approvedBy?.name ?? ui.summaryReportNotApplicable],
          [ui.reviewedAt, sewo.approvedAt ? formatDate(sewo.approvedAt) : ui.summaryReportNotApplicable],
        ],
        2,
      );

      ensurePageSpace(doc, 230);
      drawSectionTitle(doc, ui.summaryReportGeneralInfo);
      drawFieldGrid(
        doc,
        [
          [ui.eventClassification, display(sewo.eventClassification)],
          [ui.area, sewo.area?.name ?? sewo.communication?.area?.name ?? ui.summaryReportNotApplicable],
          [ui.workstation, occurrenceLocation],
          [ui.shift, sewo.shift?.name ?? ui.summaryReportNotApplicable],
          [ui.involvedPerson, getDisplayValue(sewo.whoText, ui.summaryReportNotApplicable)],
          [ui.nature, getDisplayValue(sewo.whatText, ui.summaryReportNotApplicable)],
          [ui.usualJob, sewo.usualWorkYesNo ? ui.yes : ui.no],
          [ui.whichOperation, display(sewo.whichText)],
        ],
        2,
      );

      ensurePageSpace(doc, 190);
      drawSectionTitle(doc, ui.summaryReportDescriptionSection);
      drawParagraphCard(doc, ui.description, display(sewo.howText));
      drawParagraphCard(doc, ui.howDidTheAccidentHappen, display(sewo.howText));

      ensurePageSpace(doc, 190);
      drawSectionTitle(doc, ui.immediateCorrectiveActionPlan);
      drawParagraphCard(doc, ui.immediateCorrectiveActionPlan, display(sewo.immediateCorrectiveActionText));

      ensurePageSpace(doc, 220);
      drawSectionTitle(doc, ui.analysis);
      drawParagraphCard(doc, ui.analysisText, display(templateData.analysisText));
      drawFieldGrid(
        doc,
        [
          [ui.previousDetected, yesNo(templateData.previousDetected)],
          [ui.previousDetectedDescription, display(templateData.previousDetectedDescription)],
        ],
        1,
      );

      ensurePageSpace(doc, 150);
      drawSectionTitle(doc, ui.fiveWhy);
      if (fiveWhys.length === 0) {
        drawParagraphCard(doc, ui.fiveWhy, ui.noFiveWhyAnalysis);
      } else {
        drawCompactTable(doc, {
          headers: [ui.whyLabel, ui.question, ui.answerLabel],
          widths: [74, 216, 225],
          rows: fiveWhys.map((entry, index) => [
            `${ui.whyLabel} ${index + 1}`,
            display(entry.why),
            display(entry.answer),
          ]),
        });
      }

      ensurePageSpace(doc, 240);
      drawSectionTitle(doc, ui.sifPsifDecisionTree);
      if (!sifPsifDecision) {
        drawParagraphCard(doc, ui.sifPsifDecisionTree, ui.pendingResult);
      } else {
        drawFieldGrid(doc, [[ui.sifPsifResult, sifPsifLabel]], 1);
        drawFieldGrid(
          doc,
          [
            [ui.actualSifQuestion, yesNo(sifPsifDecision.actualSif)],
            ...SIF_PSIF_EXPOSURE_KEYS.map((key): [string, string] => [
              ui.sifPsifExposureQuestions[key],
              yesNo(sifPsifDecision.exposures[key]),
            ]),
            [ui.repeatedSifPotentialQuestion, yesNo(sifPsifDecision.repeatedSifPotential)],
            [ui.oneWhatIfAwayQuestion, yesNo(sifPsifDecision.oneWhatIfAway)],
          ],
          1,
        );
        if (sifPsifDecision.noPsifExplanation.trim()) {
          drawParagraphCard(doc, ui.noPsifExplanation, display(sifPsifDecision.noPsifExplanation));
        }
      }

      ensurePageSpace(doc, 160);
      drawSectionTitle(doc, ui.rootCauseAnalysis);
      if (rootCauseDetails.length === 0) {
        drawParagraphCard(doc, ui.rootCause, ui.noRootCauseDetails);
      } else {
        drawCompactTable(doc, {
          headers: [ui.cause, ui.rootCause, ui.comment],
          widths: [230, 90, 195],
          rows: rootCauseDetails.map((entry) => [
            display(entry.label),
            yesNo(entry.isRootCause),
            display(entry.comment),
          ]),
        });
      }

      ensurePageSpace(doc, 160);
      drawSectionTitle(doc, ui.actionPlan);
      if (orderedActions.length === 0) {
        drawParagraphCard(doc, ui.actionPlan, ui.noLinkedActions);
      } else {
        drawCompactTable(doc, {
          headers: [ui.title, ui.owner, ui.dueDate, ui.tableStatus, ui.description],
          widths: [120, 105, 75, 75, 140],
          rows: orderedActions.map((entry) => [
            display(entry.action.title),
            entry.action.ownerUser.name,
            formatDate(entry.action.dueDate),
            ui.actionStatusLabels[entry.action.status] ?? entry.action.status,
            display(entry.action.description),
          ]),
        });
      }

      ensurePageSpace(doc, photoAttachments.length ? 300 : 120);
      drawSectionTitle(doc, ui.summaryReportPhotoEvidenceSection);
      if (!photoAttachments.length && !nonImageAttachments.length) {
        drawParagraphCard(doc, ui.summaryReportPhotoEvidenceSection, ui.summaryReportNotApplicable);
      } else {
        photoAttachments.forEach((attachment) => {
          try {
            drawPhotoCard(doc, {
              title: attachment.fileName,
              imageBuffer: attachment.buffer,
            });
          } catch {
            drawParagraphCard(doc, attachment.fileName, ui.summaryReportNotApplicable);
          }
        });

        if (nonImageAttachments.length) {
          drawParagraphCard(
            doc,
            ui.summaryReportPhotoEvidenceSection,
            nonImageAttachments.map((attachment) => attachment.fileName).join("\n"),
          );
        }
      }

      addPageFooters(doc, {
        generatedOnLabel: ui.generatedOn,
        generatedOn,
        exportedBy: options.exportedBy,
      });

      return pdfBufferFromDocument(doc);
    })();

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
      [ui.summaryPerformedBy, sewo.performedBy.name],
      [ui.summaryCommunication, sewo.communication?.id ?? "-"],
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
          owner: entry.action.ownerUser.name,
          dueDate: formatDate(entry.action.dueDate),
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
    const templateData = getSewoTemplateRecord(sewo.templateData);
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
    const rootCauseText = buildRootCauseText({
      templateData,
      causeSelections: sewo.causeSelections,
      translated,
      fallback: ui.summaryReportNotApplicable,
    });
    const photoAttachments = await loadAttachmentBuffers(sewo.attachments);
    const orderedActions = [...sewo.actionLinks].sort(
      (left, right) => left.action.dueDate.getTime() - right.action.dueDate.getTime(),
    );

    const pdf = await (async () => {
      const doc = createPdfDocument({ margin: 40, size: "A4" });

      drawSummaryHeader(doc, {
        title: ui.summaryReportTitle,
        referenceLabel: ui.summaryReportReference,
        reference: sewo.id,
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
          [ui.summaryReportInjuryNature, getDisplayValue(translated(sewo.whatText), ui.summaryReportNotApplicable)],
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
              `${ui.owner}: ${entry.action.ownerUser.name}`,
              `${ui.dueDate}: ${formatDate(entry.action.dueDate)}`,
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
              title: attachment.fileName,
              imageBuffer: attachment.buffer,
            });
          } catch {
            drawParagraphCard(doc, attachment.fileName, ui.summaryReportNotApplicable);
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
