import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";

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

export const SewoExportService = {
  async buildExport(sewoId: string) {
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
    const rootCauseDetails = Array.isArray(templateData.rootCauseDetails)
      ? (templateData.rootCauseDetails as Array<Record<string, unknown>>)
      : [];

    const pdf = await (async () => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });

      doc.roundedRect(40, 36, 515, 86, 18).fill(BRAND);
      doc.fillColor("#ffffff").fontSize(24).text("S-EWO Investigation Report", 58, 58);
      doc.fontSize(10).text(`${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`, 58, 90);
      doc.text(`Generated on ${formatDate(new Date())}`, 58, 106);
      doc.y = 142;
      doc.fillColor(INK);

      drawFieldGrid(
        doc,
        [
          ["Status", sewo.status],
          ["Analysis date", formatDate(sewo.analysisDate)],
          ["Investigator", sewo.performedBy.name],
          ["Communication", sewo.communication.id],
        ],
        2,
      );

      drawSectionTitle(doc, "Event Summary");
      drawFieldGrid(
        doc,
        [
          ["Classification", sewo.eventClassification],
          ["Area", sewo.area?.name ?? "-"],
          ["Workstation / Line", sewo.whereText || sewo.line?.name || "-"],
          ["Shift", sewo.shift?.name ?? "-"],
          ["Involved person", sewo.whoText],
          ["Nature", sewo.whatText],
          ["Usual job", sewo.usualWorkYesNo ? "Yes" : "No"],
          ["Which operation", sewo.whichText ?? "-"],
        ],
        2,
      );

      drawSectionTitle(doc, "Description");
      drawParagraphCard(doc, "How did the event happen?", sewo.howText || "-");

      drawSectionTitle(doc, "Immediate Corrective Action");
      drawParagraphCard(doc, "Immediate action plan", sewo.immediateCorrectiveActionText || "-");

      drawSectionTitle(doc, "Analysis");
      drawParagraphCard(doc, "Analysis text", String(templateData.analysisText ?? "-"));

      drawSectionTitle(doc, "5 Why");
      if (fiveWhys.length === 0) {
        drawParagraphCard(doc, "5 Why", "No 5 Why analysis registered.");
      } else {
        fiveWhys.forEach((entry, index) => {
          drawParagraphCard(
            doc,
            `Why ${index + 1}`,
            `Question: ${String(entry.why ?? "-")}\n\nAnswer: ${String(entry.answer ?? "-")}`,
          );
        });
      }

      drawSectionTitle(doc, "Root Cause Analysis");
      if (rootCauseDetails.length === 0) {
        drawParagraphCard(doc, "Root Cause", "No root cause details registered.");
      } else {
        rootCauseDetails.forEach((entry) => {
          drawParagraphCard(
            doc,
            `${String(entry.label ?? "-")} | Root cause: ${entry.isRootCause ? "Yes" : "No"}`,
            String(entry.comment ?? "-"),
          );
        });
      }

      drawSectionTitle(doc, "Action Plan");
      if (sewo.actionLinks.length === 0) {
        drawParagraphCard(doc, "Action plan", "No linked actions.");
      } else {
        sewo.actionLinks.forEach((entry) => {
          drawParagraphCard(
            doc,
            `${entry.action.title} | ${entry.action.status}`,
            `Owner: ${entry.action.ownerUser.name}\nDue date: ${formatDate(entry.action.dueDate)}\n\n${entry.action.description}`,
          );
        });
      }

      return pdfBufferFromDocument(doc);
    })();

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("S-EWO");
    summary.columns = [
      { header: "Field", key: "field", width: 32 },
      { header: "Value", key: "value", width: 80 },
    ];
    summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };

    [
      ["Plant", `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`],
      ["Status", sewo.status],
      ["Analysis date", formatDate(sewo.analysisDate)],
      ["Investigator", sewo.performedBy.name],
      ["Communication", sewo.communication.id],
      ["Classification", sewo.eventClassification],
      ["Area", sewo.area?.name ?? "-"],
      ["Workstation / Line", sewo.whereText || sewo.line?.name || "-"],
      ["Shift", sewo.shift?.name ?? "-"],
      ["Involved person", sewo.whoText],
      ["Nature", sewo.whatText],
      ["Usual job", sewo.usualWorkYesNo ? "Yes" : "No"],
      ["Which operation", sewo.whichText ?? "-"],
      ["Description", sewo.howText],
      ["Immediate corrective action", sewo.immediateCorrectiveActionText],
      ["Analysis", String(templateData.analysisText ?? "-")],
      ["Previous UA/UC detected", String(templateData.previousDetected ?? "-")],
      ["Previous UA/UC description", String(templateData.previousDetectedDescription ?? "-")],
    ].forEach(([field, value]) => summary.addRow({ field, value }));

    const whySheet = workbook.addWorksheet("5 Why");
    whySheet.columns = [
      { header: "Why", key: "why", width: 40 },
      { header: "Answer", key: "answer", width: 80 },
    ];
    whySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    whySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (fiveWhys.length === 0) {
      whySheet.addRow({ why: "No records", answer: "-" });
    } else {
      fiveWhys.forEach((entry, index) => {
        whySheet.addRow({
          why: `Why ${index + 1}: ${String(entry.why ?? "-")}`,
          answer: String(entry.answer ?? "-"),
        });
      });
    }

    const rootCauseSheet = workbook.addWorksheet("Root Causes");
    rootCauseSheet.columns = [
      { header: "Cause", key: "cause", width: 50 },
      { header: "Comment", key: "comment", width: 80 },
      { header: "Root Cause", key: "root", width: 16 },
    ];
    rootCauseSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    rootCauseSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (rootCauseDetails.length === 0) {
      rootCauseSheet.addRow({ cause: "No records", comment: "-", root: "-" });
    } else {
      rootCauseDetails.forEach((entry) => {
        rootCauseSheet.addRow({
          cause: String(entry.label ?? "-"),
          comment: String(entry.comment ?? "-"),
          root: entry.isRootCause ? "Yes" : "No",
        });
      });
    }

    const actionsSheet = workbook.addWorksheet("Actions");
    actionsSheet.columns = [
      { header: "Title", key: "title", width: 40 },
      { header: "Status", key: "status", width: 16 },
      { header: "Owner", key: "owner", width: 24 },
      { header: "Due Date", key: "dueDate", width: 16 },
    ];
    actionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    actionsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    if (sewo.actionLinks.length === 0) {
      actionsSheet.addRow({ title: "No linked actions", status: "-", owner: "-", dueDate: "-" });
    } else {
      sewo.actionLinks.forEach((entry) => {
        actionsSheet.addRow({
          title: entry.action.title,
          status: entry.action.status,
          owner: entry.action.ownerUser.name,
          dueDate: formatDate(entry.action.dueDate),
        });
      });
    }

    [summary, whySheet, rootCauseSheet, actionsSheet].forEach((sheet) => {
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
