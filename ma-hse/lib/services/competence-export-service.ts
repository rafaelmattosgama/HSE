import ExcelJS from "exceljs";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";

type PdfDocument = ReturnType<typeof createPdfDocument>;

function pdfBufferFromDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// §6.2: the matrix's competence-type columns are dynamic (the catalog, not a
// fixed field set), so — unlike list-export-service.ts's Communications/Actions
// builders — columns are supplied by the caller instead of a static array.
export type CompetenceMatrixExportColumn = {
  key: string;
  header: string;
};

export type CompetenceMatrixExportRow = Record<string, string>;

const competenceExportCopy = {
  en: { sheet: "Competences", noRecords: "No workers enrolled yet." },
  pt: { sheet: "Competências", noRecords: "Ainda não há trabalhadores inscritos." },
  it: { sheet: "Competenze", noRecords: "Ancora nessun lavoratore inserito." },
  pl: { sheet: "Kompetencje", noRecords: "Nie dodano jeszcze żadnego pracownika." },
  de: { sheet: "Kompetenzen", noRecords: "Noch keine Mitarbeiter erfasst." },
  ro: { sheet: "Competențe", noRecords: "Niciun angajat înscris încă." },
  fr: { sheet: "Compétences", noRecords: "Aucun collaborateur inscrit pour le moment." },
} as const;

function getCompetenceExportCopy(locale = "en") {
  return competenceExportCopy[locale as keyof typeof competenceExportCopy] ?? competenceExportCopy.en;
}

function columnWidthFor(header: string) {
  return Math.max(10, Math.min(40, header.length + 4));
}

const authorizationPdfCopy = {
  en: {
    title: "Competence Authorization", plantLabel: "Plant", workerLabel: "Worker", employeeNoLabel: "Employee no.",
    departmentLabel: "Department", roleLabel: "Role", competenceLabel: "Competence", legalReferenceLabel: "Legal reference",
    validFromLabel: "Valid from", validUntilLabel: "Valid until", restrictionsLabel: "Restrictions", statusLabel: "Status",
    sequenceLabel: "Reference no.", grantedByLabel: "Granted by", grantedAtLabel: "Granted at",
    workerSignatureLabel: "Worker signature", authorizerSignatureLabel: "Authorizer signature", dateLabel: "Date",
    generatedOnLabel: "Generated on", noneValue: "-",
  },
  pt: {
    title: "Autorização de Competência", plantLabel: "Planta", workerLabel: "Trabalhador", employeeNoLabel: "Número",
    departmentLabel: "Departamento", roleLabel: "Função", competenceLabel: "Competência", legalReferenceLabel: "Referência legal",
    validFromLabel: "Válida a partir de", validUntilLabel: "Válida até", restrictionsLabel: "Restrições", statusLabel: "Estado",
    sequenceLabel: "Nº de referência", grantedByLabel: "Concedida por", grantedAtLabel: "Concedida em",
    workerSignatureLabel: "Assinatura do trabalhador", authorizerSignatureLabel: "Assinatura de quem autoriza", dateLabel: "Data",
    generatedOnLabel: "Gerado em", noneValue: "-",
  },
  it: {
    title: "Autorizzazione di Competenza", plantLabel: "Stabilimento", workerLabel: "Lavoratore", employeeNoLabel: "Numero",
    departmentLabel: "Reparto", roleLabel: "Ruolo", competenceLabel: "Competenza", legalReferenceLabel: "Riferimento legale",
    validFromLabel: "Valida da", validUntilLabel: "Valida fino al", restrictionsLabel: "Restrizioni", statusLabel: "Stato",
    sequenceLabel: "N. di riferimento", grantedByLabel: "Concessa da", grantedAtLabel: "Concessa il",
    workerSignatureLabel: "Firma del lavoratore", authorizerSignatureLabel: "Firma di chi autorizza", dateLabel: "Data",
    generatedOnLabel: "Generato il", noneValue: "-",
  },
  pl: {
    title: "Upoważnienie Kompetencyjne", plantLabel: "Zakład", workerLabel: "Pracownik", employeeNoLabel: "Numer",
    departmentLabel: "Dział", roleLabel: "Stanowisko", competenceLabel: "Kompetencja", legalReferenceLabel: "Podstawa prawna",
    validFromLabel: "Obowiązuje od", validUntilLabel: "Ważne do", restrictionsLabel: "Ograniczenia", statusLabel: "Status",
    sequenceLabel: "Nr referencyjny", grantedByLabel: "Udzielone przez", grantedAtLabel: "Udzielone dnia",
    workerSignatureLabel: "Podpis pracownika", authorizerSignatureLabel: "Podpis osoby upoważniającej", dateLabel: "Data",
    generatedOnLabel: "Wygenerowano dnia", noneValue: "-",
  },
  de: {
    title: "Kompetenzgenehmigung", plantLabel: "Werk", workerLabel: "Mitarbeiter", employeeNoLabel: "Nummer",
    departmentLabel: "Abteilung", roleLabel: "Funktion", competenceLabel: "Kompetenz", legalReferenceLabel: "Rechtsgrundlage",
    validFromLabel: "Gültig ab", validUntilLabel: "Gültig bis", restrictionsLabel: "Einschränkungen", statusLabel: "Status",
    sequenceLabel: "Referenznummer", grantedByLabel: "Erteilt von", grantedAtLabel: "Erteilt am",
    workerSignatureLabel: "Unterschrift des Mitarbeiters", authorizerSignatureLabel: "Unterschrift des Genehmigenden", dateLabel: "Datum",
    generatedOnLabel: "Erstellt am", noneValue: "-",
  },
  ro: {
    title: "Autorizație de Competență", plantLabel: "Fabrică", workerLabel: "Lucrător", employeeNoLabel: "Număr",
    departmentLabel: "Departament", roleLabel: "Funcție", competenceLabel: "Competență", legalReferenceLabel: "Referință legală",
    validFromLabel: "Valabilă de la", validUntilLabel: "Valabilă până la", restrictionsLabel: "Restricții", statusLabel: "Stare",
    sequenceLabel: "Nr. de referință", grantedByLabel: "Acordată de", grantedAtLabel: "Acordată la",
    workerSignatureLabel: "Semnătura lucrătorului", authorizerSignatureLabel: "Semnătura celui care autorizează", dateLabel: "Data",
    generatedOnLabel: "Generat la", noneValue: "-",
  },
  fr: {
    title: "Autorisation de Compétence", plantLabel: "Site", workerLabel: "Collaborateur", employeeNoLabel: "Numéro",
    departmentLabel: "Service", roleLabel: "Fonction", competenceLabel: "Compétence", legalReferenceLabel: "Référence légale",
    validFromLabel: "Valable à partir du", validUntilLabel: "Valable jusqu'au", restrictionsLabel: "Restrictions", statusLabel: "Statut",
    sequenceLabel: "N° de référence", grantedByLabel: "Accordée par", grantedAtLabel: "Accordée le",
    workerSignatureLabel: "Signature du collaborateur", authorizerSignatureLabel: "Signature de la personne autorisant", dateLabel: "Date",
    generatedOnLabel: "Généré le", noneValue: "-",
  },
} as const;

function getAuthorizationPdfCopy(locale = "en") {
  return authorizationPdfCopy[locale as keyof typeof authorizationPdfCopy] ?? authorizationPdfCopy.en;
}

export type CompetenceAuthorizationPdfInput = {
  plantName: string;
  workerName: string;
  employeeNo: string;
  departmentName: string | null;
  roleName: string | null;
  competenceTypeName: string;
  legalReference: string | null;
  sequenceNumber: number | null;
  validFrom: Date;
  validUntil: Date;
  restrictions: string | null;
  status: string;
  grantedByName: string;
  grantedAt: Date;
  locale?: string;
};

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}

function drawField(doc: PdfDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fontSize(8).fillColor("#64748b").text(label.toUpperCase(), x, y, { width });
  doc.fontSize(11).fillColor("#0f172a").text(value, x, y + 12, { width });
}

function drawFieldRow(doc: PdfDocument, y: number, fields: Array<{ label: string; value: string }>, columnWidth: number, startX = 40) {
  fields.forEach((field, index) => {
    drawField(doc, field.label, field.value, startX + index * columnWidth, y, columnWidth - 16);
  });
  return y + 44;
}

function drawSignatureLine(doc: PdfDocument, label: string, dateLabel: string, x: number, y: number, width: number) {
  doc.moveTo(x, y + 28).lineTo(x + width, y + 28).strokeColor("#94a3b8").lineWidth(0.8).stroke();
  doc.fontSize(8).fillColor("#64748b").text(label, x, y + 32, { width });
  doc.moveTo(x, y + 64).lineTo(x + Math.min(160, width), y + 64).strokeColor("#94a3b8").lineWidth(0.8).stroke();
  doc.fontSize(8).fillColor("#64748b").text(dateLabel, x, y + 68, { width: Math.min(160, width) });
}

export const CompetenceExportService = {
  /** §6.2: XLSX of the matrix — client sends already-filtered columns/rows, mirroring list-export-service.ts's own pattern. */
  async buildMatrixXlsx(
    columns: CompetenceMatrixExportColumn[],
    rows: CompetenceMatrixExportRow[],
    options: { locale?: string } = {},
  ) {
    const copy = getCompetenceExportCopy(options.locale);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MA-HSE";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(copy.sheet);
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: columnWidthFor(column.header),
    }));
    sheet.getRow(1).font = { bold: true };
    if (rows.length > 0) {
      sheet.addRows(rows);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  },

  /** §6.3: one authorization, one page, for signature — via pdfkit-helper.ts. */
  async buildAuthorizationPdf(input: CompetenceAuthorizationPdfInput) {
    const copy = getAuthorizationPdfCopy(input.locale);
    const doc = createPdfDocument({ margin: 40, size: "A4" });

    doc.fontSize(18).fillColor("#0f172a").text(copy.title, 40, 40);
    doc.fontSize(9).fillColor("#64748b").text(`${copy.generatedOnLabel}: ${formatDate(new Date(), input.locale ?? "en")}`, 40, 66);
    doc.moveTo(40, 90).lineTo(555, 90).strokeColor("#cbd5e1").lineWidth(1).stroke();

    const columnWidth = (555 - 40) / 2;
    let y = 110;
    y = drawFieldRow(doc, y, [
      { label: copy.plantLabel, value: input.plantName },
      { label: copy.sequenceLabel, value: input.sequenceNumber != null ? String(input.sequenceNumber) : copy.noneValue },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.workerLabel, value: input.workerName },
      { label: copy.employeeNoLabel, value: input.employeeNo },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.departmentLabel, value: input.departmentName ?? copy.noneValue },
      { label: copy.roleLabel, value: input.roleName ?? copy.noneValue },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.competenceLabel, value: input.competenceTypeName },
      { label: copy.legalReferenceLabel, value: input.legalReference ?? copy.noneValue },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.validFromLabel, value: formatDate(input.validFrom, input.locale ?? "en") },
      { label: copy.validUntilLabel, value: formatDate(input.validUntil, input.locale ?? "en") },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.statusLabel, value: input.status },
      { label: copy.restrictionsLabel, value: input.restrictions ?? copy.noneValue },
    ], columnWidth);
    y = drawFieldRow(doc, y, [
      { label: copy.grantedByLabel, value: input.grantedByName },
      { label: copy.grantedAtLabel, value: formatDate(input.grantedAt, input.locale ?? "en") },
    ], columnWidth);

    y += 40;
    drawSignatureLine(doc, copy.workerSignatureLabel, copy.dateLabel, 40, y, columnWidth - 16);
    drawSignatureLine(doc, copy.authorizerSignatureLabel, copy.dateLabel, 40 + columnWidth, y, columnWidth - 16);

    return pdfBufferFromDocument(doc);
  },
};
