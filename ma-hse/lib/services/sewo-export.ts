import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
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
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { formatLocalizedSewoStatus, type SewoUi } from "@/lib/sewo-ui";

const BRAND = "#002663";
const INK = "#0f172a";
const MUTED = "#64748b";
const PANEL = "#e2e8f0";
const SOFT = "#f8fafc";

function pdfBufferFromDocument(doc: InstanceType<typeof PDFDocument>) {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function drawSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string) {
  doc.moveDown(0.3);
  doc.roundedRect(40, doc.y, 515, 24, 8).fill(BRAND);
  doc
    .fillColor("#ffffff")
    .fontSize(11)
    .text(title, 52, doc.y - 18);
  doc.moveDown(1.4);
  doc.fillColor(INK);
}

function drawFieldGrid(doc: InstanceType<typeof PDFDocument>, entries: Array<[string, string]>, columns = 2) {
  const cardWidth = columns === 2 ? 248 : 515;
  const cardHeight = 52;
  let x = 40;
  let y = doc.y;

  entries.forEach(([label, value], index) => {
    if (index > 0 && index % columns === 0) {
      x = 40;
      y += cardHeight + 10;
    }

    doc.roundedRect(x, y, cardWidth, cardHeight, 10).fillAndStroke(SOFT, PANEL);
    doc.fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x + 12, y + 10, { width: cardWidth - 24 });
    doc.fillColor(INK).fontSize(11).text(value || "-", x + 12, y + 24, { width: cardWidth - 24 });
    x += cardWidth + 18;
  });

  doc.y = y + cardHeight + 8;
  doc.fillColor(INK);
}

function drawParagraphCard(doc: InstanceType<typeof PDFDocument>, label: string, text: string) {
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
  async buildExport(sewoId: string, options: { locale?: string } = {}) {
    const locale = options.locale ?? "en";
    const { ui } = await getLocalizedSewoUi(locale);
    const sewo = await prisma.sEWO.findUniqueOrThrow({
      where: { id: sewoId },
      include: {
        plant: true,
        communication: {
          include: {
            targetEmployee: true,
          },
        },
        performedBy: true,
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
    const yesNo = (value: unknown) => (value === "" || value === null || value === undefined ? "-" : isSewoRootCauseAffirmative(value) ? ui.yes : ui.no);
    const localizedStatus = formatLocalizedSewoStatus(sewo.status, ui);

    const pdf = await (async () => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });

      doc.roundedRect(40, 36, 515, 86, 18).fill(BRAND);
      doc.fillColor("#ffffff").fontSize(24).text(ui.reportTitle, 58, 58);
      doc.fontSize(10).text(`${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`, 58, 90);
      doc.text(`${ui.generatedOn} ${formatDate(new Date())}`, 58, 106);
      doc.y = 142;
      doc.fillColor(INK);

      drawFieldGrid(
        doc,
        [
          [ui.summaryStatus, localizedStatus],
          [ui.tableDate, formatDate(sewo.analysisDate)],
          [ui.summaryPerformedBy, sewo.performedBy.name],
          [ui.summaryCommunication, sewo.communication?.id ?? "-"],
        ],
        2,
      );

      drawSectionTitle(doc, ui.summaryTitle);
      drawFieldGrid(
        doc,
        [
          [ui.eventClassification, translated(sewo.eventClassification)],
          [ui.area, sewo.area?.name ?? "-"],
          [ui.workstation, sewo.whereText || sewo.line?.name || "-"],
          [ui.shift, sewo.shift?.name ?? "-"],
          [ui.involvedPerson, sewo.whoText],
          [ui.nature, sewo.whatText],
          [ui.usualJob, sewo.usualWorkYesNo ? ui.yes : ui.no],
          [ui.whichOperation, translated(sewo.whichText)],
        ],
        2,
      );

      drawSectionTitle(doc, ui.description);
      drawParagraphCard(doc, ui.howDidTheAccidentHappen, translated(sewo.howText));

      drawSectionTitle(doc, ui.immediateCorrectiveActionPlan);
      drawParagraphCard(doc, ui.immediateCorrectiveActionPlan, translated(sewo.immediateCorrectiveActionText));

      drawSectionTitle(doc, ui.analysis);
      drawParagraphCard(doc, ui.analysisText, translated(templateData.analysisText));

      drawSectionTitle(doc, ui.fiveWhy);
      if (fiveWhys.length === 0) {
        drawParagraphCard(doc, ui.fiveWhy, ui.noFiveWhyAnalysis);
      } else {
        fiveWhys.forEach((entry, index) => {
          drawParagraphCard(
            doc,
            `${ui.whyLabel} ${index + 1}`,
            `${ui.question}: ${translated(entry.why)}\n\n${ui.answerLabel}: ${translated(entry.answer)}`,
          );
        });
      }

      drawSectionTitle(doc, ui.sifPsifDecisionTree);
      if (!sifPsifDecision) {
        drawParagraphCard(doc, ui.sifPsifDecisionTree, ui.pendingResult);
      } else {
        drawFieldGrid(
          doc,
          [
            [ui.actualSifQuestion, yesNo(sifPsifDecision.actualSif)],
            [ui.sifPsifResult, getSifPsifResultLabel(sifPsifResult, ui)],
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
          drawParagraphCard(doc, ui.noPsifExplanation, translated(sifPsifDecision.noPsifExplanation));
        }
      }

      drawSectionTitle(doc, ui.rootCauseAnalysis);
      if (rootCauseDetails.length === 0) {
        drawParagraphCard(doc, ui.rootCause, ui.noRootCauseDetails);
      } else {
        rootCauseDetails.forEach((entry) => {
          drawParagraphCard(
            doc,
            `${translated(entry.label)} | ${ui.rootCause}: ${yesNo(entry.isRootCause)}`,
            translated(entry.comment),
          );
        });
      }

      drawSectionTitle(doc, ui.actionPlan);
      if (sewo.actionLinks.length === 0) {
        drawParagraphCard(doc, ui.actionPlan, ui.noLinkedActions);
      } else {
        sewo.actionLinks.forEach((entry) => {
          drawParagraphCard(
            doc,
            `${translated(entry.action.title)} | ${entry.action.status}`,
            `${ui.owner}: ${entry.action.ownerUser.name}\n${ui.dueDate}: ${formatDate(entry.action.dueDate)}\n\n${translated(entry.action.description)}`,
          );
        });
      }

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
};
