import type { CommunicationImprovementSubtype, SeverityPotential } from "@prisma/client";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { prisma } from "@/lib/prisma";
import { getReadableCommunicationCode } from "@/lib/record-code";
import { supportsCommunicationPdfReport } from "@/lib/communication-report";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { StorageService } from "@/lib/services/storage-service";

type PdfDocument = ReturnType<typeof createPdfDocument>;

const BRAND = "#002663";
const INK = "#0f172a";
const MUTED = "#64748b";
const PANEL = "#e2e8f0";
const SOFT = "#f8fafc";
const WHITE = "#ffffff";

const severityLabels: Record<SeverityPotential, { en: string; pt: string }> = {
  LOW: { en: "Low", pt: "Baixa" },
  MED: { en: "Medium", pt: "Media" },
  HIGH: { en: "High", pt: "Alta" },
};

const subtypeLabels: Record<CommunicationImprovementSubtype, { en: string; pt: string }> = {
  FIVE_S_AREA_IMPROVEMENT: { en: "Area improvement", pt: "Melhoria de area" },
  FIVE_S_DISORGANIZATION: { en: "Disorganization", pt: "Desorganizacao" },
  IMPROVEMENT_SAFETY: { en: "Safety", pt: "Seguranca" },
  IMPROVEMENT_HEALTH: { en: "Health", pt: "Saude" },
  IMPROVEMENT_ENVIRONMENT: { en: "Environment", pt: "Ambiente" },
};

type ExportAttachment = {
  fileName: string;
  contentType: string;
  fileKey: string;
};

function labelsFor(locale: string) {
  const pt = locale === "pt";

  return {
    reportTitle: pt ? "Comunicacao de Seguranca - Summary Report" : "Safety Communication - Summary Report",
    reference: pt ? "Referencia" : "Reference",
    generatedOn: pt ? "Gerado em" : "Generated on",
    generalInfo: pt ? "Informacao geral" : "General information",
    peopleAndPlace: pt ? "Pessoas e local" : "People and location",
    description: pt ? "Descricao da comunicacao" : "Communication description",
    observations: pt ? "Motivo / observacoes" : "Reason / observations",
    actions: pt ? "Acoes associadas" : "Linked actions",
    attachments: pt ? "Anexos / imagens" : "Attachments / images",
    dates: pt ? "Datas e auditoria" : "Dates and audit",
    plant: pt ? "Fabrica" : "Plant",
    type: pt ? "Tipo" : "Type",
    status: pt ? "Estado atual" : "Current status",
    dateTime: pt ? "Data e hora" : "Date and time",
    reporter: pt ? "Comunicante" : "Reporter",
    reporterNumber: pt ? "Numero do comunicante" : "Reporter number",
    involvedWorker: pt ? "Colaborador associado" : "Associated worker",
    involvedWorkerNumber: pt ? "Numero do colaborador" : "Worker number",
    involvedWorkers: pt ? "Colaboradores envolvidos" : "Involved workers",
    department: pt ? "Area / seccao / departamento" : "Area / section / department",
    line: pt ? "Linha" : "Line",
    location: pt ? "Local" : "Location",
    equipment: pt ? "Equipamento" : "Equipment",
    classification: pt ? "Classificacao" : "Classification",
    severity: pt ? "Prioridade / gravidade" : "Priority / severity",
    subtype: pt ? "Subtipo" : "Subtype",
    unsafeActType: pt ? "Tipo de ato inseguro" : "Unsafe act type",
    unsafeConditionType: pt ? "Tipo de condicao perigosa" : "Unsafe condition type",
    riskTheme: pt ? "Risco profissional" : "Professional risk",
    action: pt ? "Acao" : "Action",
    owner: pt ? "Responsavel" : "Owner",
    dueDate: pt ? "Prazo" : "Due date",
    createdAt: pt ? "Criado em" : "Created at",
    updatedAt: pt ? "Ultima atualizacao" : "Last update",
    validatedAt: pt ? "Validado em" : "Validated at",
    validatedBy: pt ? "Validado por" : "Validated by",
    manuallyClosedAt: pt ? "Fechado manualmente em" : "Manually closed at",
    manuallyClosedBy: pt ? "Fechado manualmente por" : "Manually closed by",
    noRecords: pt ? "Nao aplicavel" : "Not applicable",
  };
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

function toValidDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDateTime(value: unknown, fallback = "-") {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleString("pt-PT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: unknown, fallback = "-") {
  return toValidDate(value)?.toISOString().slice(0, 10) ?? fallback;
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
    if (result.status !== "fulfilled" || result.value.buffer.length === 0) return [];
    return [result.value];
  });
}

function ensurePageSpace(doc: PdfDocument, height: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
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

function drawSummaryHeader(doc: PdfDocument, input: {
  title: string;
  referenceLabel: string;
  reference: string;
  plantLabel: string;
  generatedOnLabel: string;
}) {
  doc.rect(0, 0, doc.page.width, 112).fill(SOFT);
  doc.rect(0, 111, doc.page.width, 1).fill("#dbe3ee");
  drawPlatformLogo(doc, 26, 34, 0.82);
  doc.fillColor(BRAND).fontSize(15).font("Helvetica-Bold").text(input.title, 190, 27, {
    width: 220,
    height: 44,
    align: "center",
  });
  doc.fillColor(INK).fontSize(8).font("Helvetica-Bold").text(input.plantLabel, 450, 31, {
    width: 104,
    align: "right",
  });
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

function drawSectionTitle(doc: PdfDocument, title: string) {
  doc.moveDown(0.3);
  ensurePageSpace(doc, 34);
  doc.roundedRect(40, doc.y, 515, 24, 8).fill(BRAND);
  doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold").text(title, 52, doc.y - 18);
  doc.moveDown(1.4);
  doc.fillColor(INK).font("Helvetica");
}

function drawFieldGrid(doc: PdfDocument, entries: Array<[string, string]>, columns = 2) {
  const cardWidth = columns === 2 ? 248 : 515;
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
    let x = 40;

    row.forEach(([label, value]) => {
      const labelHeight = doc.heightOfString(label.toUpperCase(), { width: cardWidth - 24 });
      doc.roundedRect(x, y, cardWidth, cardHeight, 10).fillAndStroke(SOFT, PANEL);
      doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(label.toUpperCase(), x + 12, y + 10, {
        width: cardWidth - 24,
      });
      doc.fillColor(INK).fontSize(11).font("Helvetica").text(value || "-", x + 12, y + 16 + labelHeight, {
        width: cardWidth - 24,
      });
      x += cardWidth + 18;
    });

    doc.y = y + cardHeight + 10;
  });

  doc.fillColor(INK);
}

function drawParagraphCard(doc: PdfDocument, label: string, text: string) {
  ensurePageSpace(doc, 92);
  const startY = doc.y;
  const height = Math.max(78, doc.heightOfString(text || "-", { width: 487, align: "left" }) + 34);
  doc.roundedRect(40, startY, 515, height, 12).fillAndStroke(SOFT, PANEL);
  doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(label.toUpperCase(), 52, startY + 12);
  doc.fillColor(INK).fontSize(10).font("Helvetica").text(text || "-", 52, startY + 26, { width: 491 });
  doc.y = startY + height + 10;
}

function drawPhotoCard(doc: PdfDocument, input: { title: string; imageBuffer: Buffer }) {
  ensurePageSpace(doc, 284);
  const captionY = doc.y;
  const captionHeight = Math.max(14, doc.heightOfString(input.title, { width: 491 }));
  doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(input.title, 52, captionY);
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

function buildActionText(input: {
  actions: Array<{
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: Date;
    ownerUser?: { name: string } | null;
  }>;
  actionStatusLabels: Record<string, string>;
  labels: ReturnType<typeof labelsFor>;
}) {
  if (!input.actions.length) return input.labels.noRecords;

  return input.actions
    .map((action) => {
      const status = input.actionStatusLabels[action.status] ?? action.status;
      return [
        `${input.labels.action}: ${action.title}`,
        `${input.labels.status}: ${status}`,
        `${input.labels.owner}: ${action.ownerUser?.name ?? input.labels.noRecords}`,
        `${input.labels.severity}: ${action.priority}`,
        `${input.labels.dueDate}: ${formatDate(action.dueDate, input.labels.noRecords)}`,
        "",
        action.description,
      ].join("\n");
    })
    .join("\n\n");
}

function joinNonEmpty(values: string[], fallback: string) {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return normalized.length ? normalized.join("\n") : fallback;
}

export const CommunicationReportExportService = {
  async buildPdf(communicationId: string, options: { locale?: string } = {}) {
    const locale = options.locale ?? "pt";
    const [communicationUi, communication] = await Promise.all([
      getLocalizedCommunicationUi(locale),
      prisma.communication.findUniqueOrThrow({
        where: { id: communicationId },
        include: {
          plant: true,
          reporterUser: true,
          targetEmployee: true,
          involvedEmployees: {
            include: {
              employee: true,
            },
            orderBy: {
              sortOrder: "asc",
            },
          },
          shift: true,
          area: true,
          line: true,
          workstation: true,
          equipment: true,
          riskTheme: true,
          unsafeActType: true,
          unsafeConditionType: true,
          nearMissType: true,
          attachments: true,
          actions: {
            include: {
              ownerUser: true,
            },
            orderBy: {
              dueDate: "asc",
            },
          },
          validatedByUser: true,
          manuallyClosedByUser: true,
        },
      }),
    ]);

    if (!supportsCommunicationPdfReport(communication.type)) {
      throw new Error("Unsupported communication type for PDF report");
    }

    const text = labelsFor(locale);
    const reference = getReadableCommunicationCode(communication);
    const typeLabel = communicationUi.communicationTypeLabels[communication.type] ?? communication.type;
    const statusLabel = communicationUi.communicationStatusLabels[communication.status] ?? communication.status;
    const plantLabel = `${communication.plant.name} (${communication.plant.code.toUpperCase()})`;
    const photoAttachments = await loadAttachmentBuffers(communication.attachments);

    const involvedWorkers = joinNonEmpty(
      communication.involvedEmployees.map((entry) =>
        [entry.employee.employeeNo, entry.employee.name].filter(Boolean).join(" - "),
      ),
      getDisplayValue(
        [communication.targetEmployeeNo, communication.targetText ?? communication.targetEmployee?.name].filter(Boolean).join(" - "),
        text.noRecords,
      ),
    );
    const severity = communication.severityPotential
      ? severityLabels[communication.severityPotential]?.[locale === "pt" ? "pt" : "en"] ?? communication.severityPotential
      : text.noRecords;
    const subtype = communication.improvementSubtype
      ? subtypeLabels[communication.improvementSubtype]?.[locale === "pt" ? "pt" : "en"] ?? communication.improvementSubtype
      : text.noRecords;

    const doc = createPdfDocument({ margin: 40, size: "A4" });
    drawSummaryHeader(doc, {
      title: text.reportTitle,
      referenceLabel: text.reference,
      reference,
      plantLabel,
      generatedOnLabel: text.generatedOn,
    });

    drawSectionTitle(doc, text.generalInfo);
    drawFieldGrid(doc, [
      [text.plant, plantLabel],
      [text.type, typeLabel],
      [text.reference, reference],
      [text.status, statusLabel],
      [text.dateTime, formatDateTime(communication.eventDatetime, text.noRecords)],
      [text.severity, severity],
      [text.subtype, subtype],
      [text.classification, getDisplayValue(communication.level ?? communication.riskTheme?.category, text.noRecords)],
    ]);

    drawSectionTitle(doc, text.peopleAndPlace);
    drawFieldGrid(doc, [
      [text.reporter, communication.reporterName],
      [text.reporterNumber, getDisplayValue(communication.reporterEmployeeNo, text.noRecords)],
      [text.involvedWorker, getDisplayValue(communication.targetText ?? communication.targetEmployee?.name, text.noRecords)],
      [text.involvedWorkerNumber, getDisplayValue(communication.targetEmployeeNo ?? communication.targetEmployee?.employeeNo, text.noRecords)],
      [text.department, getDisplayValue(communication.area?.name, text.noRecords)],
      [text.line, getDisplayValue(communication.line?.name, text.noRecords)],
      [text.location, getDisplayValue(communication.workstation?.name, text.noRecords)],
      [text.equipment, getDisplayValue(communication.equipment?.name, text.noRecords)],
    ]);
    drawParagraphCard(doc, text.involvedWorkers, involvedWorkers);

    drawSectionTitle(doc, text.description);
    drawParagraphCard(doc, text.description, getDisplayValue(communication.description, text.noRecords));
    drawParagraphCard(doc, text.observations, getDisplayValue(communication.suggestedAction, text.noRecords));

    drawSectionTitle(doc, text.classification);
    drawFieldGrid(doc, [
      [text.riskTheme, getDisplayValue(communication.riskTheme?.name, text.noRecords)],
      [text.unsafeActType, getDisplayValue(communication.unsafeActType?.name, text.noRecords)],
      [text.unsafeConditionType, getDisplayValue(communication.unsafeConditionType?.name, text.noRecords)],
      [text.location, getDisplayValue(communication.nearMissType?.name, text.noRecords)],
    ]);

    drawSectionTitle(doc, text.actions);
    drawParagraphCard(
      doc,
      text.actions,
      buildActionText({
        actions: communication.actions,
        actionStatusLabels: communicationUi.actionStatusLabels,
        labels: text,
      }),
    );

    drawSectionTitle(doc, text.dates);
    drawFieldGrid(doc, [
      [text.createdAt, formatDateTime(communication.createdAt, text.noRecords)],
      [text.updatedAt, formatDateTime(communication.updatedAt, text.noRecords)],
      [text.validatedAt, formatDateTime(communication.validatedAt, text.noRecords)],
      [text.validatedBy, getDisplayValue(communication.validatedByUser?.name, text.noRecords)],
      [text.manuallyClosedAt, formatDateTime(communication.manuallyClosedAt, text.noRecords)],
      [text.manuallyClosedBy, getDisplayValue(communication.manuallyClosedByUser?.name, text.noRecords)],
    ]);

    drawSectionTitle(doc, text.attachments);
    if (!communication.attachments.length) {
      drawParagraphCard(doc, text.attachments, text.noRecords);
    } else {
      const nonImageAttachments = communication.attachments.filter(
        (attachment) => !photoAttachments.some((photo) => photo.fileKey === attachment.fileKey),
      );
      if (photoAttachments.length) {
        photoAttachments.forEach((attachment) => {
          try {
            drawPhotoCard(doc, {
              title: attachment.fileName,
              imageBuffer: attachment.buffer,
            });
          } catch {
            drawParagraphCard(doc, attachment.fileName, text.noRecords);
          }
        });
      }
      if (nonImageAttachments.length) {
        drawParagraphCard(doc, text.attachments, nonImageAttachments.map((attachment) => attachment.fileName).join("\n"));
      }
    }

    return pdfBufferFromDocument(doc);
  },
};
