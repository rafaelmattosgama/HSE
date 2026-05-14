import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";

type ExportAttachment = {
  fileName: string;
  contentType: string;
  fileKey: string;
};

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function inferImageExtension(input: ExportAttachment) {
  const contentType = input.contentType.toLowerCase();
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpeg";
  const fileName = input.fileName.toLowerCase();
  if (fileName.endsWith(".png")) return "png";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "jpeg";
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

function pdfBufferFromDocument(doc: InstanceType<typeof PDFDocument>) {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
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

    const pdf = await (async () => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });

      doc.fontSize(20).text("SMAT - Safety Management Audit Training");
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Plant: ${audit.plant.name} (${audit.plant.code.toUpperCase()})`);
      doc.text(`Auditor: ${audit.auditorName}`);
      doc.text(`Date: ${formatDate(audit.auditDate)}`);
      doc.text(`Area: ${audit.areaExamined || "-"}`);
      doc.text(`Location: ${audit.locationExamined || "-"}`);
      doc.text(`Time: ${audit.startTimeText || "-"} -> ${audit.endTimeText || "-"}`);
      if (audit.communication) {
        doc.text(`Communication: ${audit.communication.id} | ${audit.communication.type} | ${audit.communication.status}`);
      }
      doc.moveDown();

      doc.fontSize(13).text("Observed counts", { underline: true });
      doc.fontSize(10);
      [
        `People observed: ${audit.peopleObservedCount}`,
        `People involved: ${audit.peopleInvolvedCount}`,
        `People safe / unsafe: ${audit.peopleSafeCount} / ${audit.peopleUnsafeCount}`,
        `Conditions safe / unsafe: ${audit.workConditionsSafeCount} / ${audit.workConditionsUnsafeCount}`,
        `Reactions positive / negative: ${audit.reactionsPositiveCount} / ${audit.reactionsNegativeCount}`,
      ].forEach((line) => doc.text(line));
      doc.moveDown();

      const sections = [
        ["AS", audit.safeActs],
        ["CS", audit.safeConditions],
        ["AI", audit.unsafeActs],
        ["CI", audit.unsafeConditions],
      ] as const;

      for (const [label, rows] of sections) {
        doc.fontSize(13).text(label, { underline: true });
        doc.fontSize(10);
        const items = Array.isArray(rows) ? rows : [];
        if (items.length === 0) {
          doc.text("No records.");
        } else {
          for (const item of items as Array<{ category: string; description: string }>) {
            doc.text(`${item.category}: ${item.description}`);
          }
        }
        doc.moveDown(0.5);
      }

      doc.fontSize(13).text("Questions", { underline: true });
      [audit.answer1, audit.answer2, audit.answer3, audit.answer4, audit.answer5, audit.answer6].forEach((answer, index) => {
        doc.fontSize(10).text(`${index + 1}. ${answer?.trim() ? answer : "-"}`);
      });
      doc.moveDown();

      doc.fontSize(13).text("Notes", { underline: true });
      doc.fontSize(10).text(audit.notes?.trim() ? audit.notes : "-");
      doc.moveDown();

      doc.fontSize(13).text("Actions linked to communication", { underline: true });
      if (audit.actionLinks.length === 0) {
        doc.fontSize(10).text("No actions created from this audit.");
      } else {
        audit.actionLinks.forEach((entry) => {
          doc.fontSize(10).text(`${entry.action.title} | ${entry.action.status} | Owner: ${entry.action.ownerUser.name}`);
        });
      }

      if (attachmentBuffers.length > 0) {
        doc.addPage();
        doc.fontSize(16).text("Photos");
        let cursorY = doc.y + 12;

        for (const attachment of attachmentBuffers.filter((entry) => entry.extension)) {
          if (cursorY > 700) {
            doc.addPage();
            cursorY = 50;
          }
          doc.fontSize(10).text(attachment.fileName, 40, cursorY);
          cursorY += 16;
          try {
            doc.image(attachment.buffer, 40, cursorY, { fit: [240, 180] });
            cursorY += 190;
          } catch {
            doc.text("Image preview not available.", 40, cursorY);
            cursorY += 18;
          }
        }
      }

      return pdfBufferFromDocument(doc);
    })();

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
      { header: "Content type", key: "contentType", width: 24 },
      { header: "Storage key", key: "fileKey", width: 70 },
    ];

    if (audit.attachments.length === 0) {
      attachmentsSheet.addRow({ fileName: "No attachments", contentType: "-", fileKey: "-" });
    } else {
      audit.attachments.forEach((attachment) => {
        attachmentsSheet.addRow({
          fileName: attachment.fileName,
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
        imagesSheet.getCell(`A${rowStart}`).value = image.fileName;
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
