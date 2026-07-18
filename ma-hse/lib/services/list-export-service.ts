import ExcelJS from "exceljs";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";

type ExportColumn<T> = {
  key: keyof T & string;
  header: string;
  width: number;
};

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

async function buildWorkbook<T extends Record<string, string>>(sheetName: string, columns: ExportColumn<T>[], rows: T[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MA-HSE";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

async function buildPdf<T extends Record<string, string>>(title: string, columns: ExportColumn<T>[], rows: T[], noRecords = "No records for the selected filters.") {
  const doc = createPdfDocument({ margin: 36, size: "A4", layout: "landscape" });
  doc.fontSize(16).text(title);
  doc.moveDown();
  doc.fontSize(8);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalColumnWidth = columns.reduce((total, column) => total + column.width, 0);
  const startX = doc.page.margins.left;
  const rowHeight = 48;

  const columnWidths = columns.map((column) => (pageWidth * column.width) / totalColumnWidth);

  function ensureSpace() {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.fontSize(8);
    }
  }

  ensureSpace();
  const headerY = doc.y;
  let headerX = startX;
  columns.forEach((column, index) => {
    doc.text(column.header, headerX, headerY, {
      width: columnWidths[index] - 4,
      height: rowHeight,
    });
    headerX += columnWidths[index];
  });
  doc.y = headerY + rowHeight;

  rows.forEach((row) => {
    ensureSpace();
    const y = doc.y;
    let x = startX;
    columns.forEach((column, index) => {
      doc.text(String(row[column.key] ?? ""), x, y, {
        width: columnWidths[index] - 4,
        height: rowHeight,
      });
      x += columnWidths[index];
    });
    doc.y = y + rowHeight;
  });

  if (rows.length === 0) {
    doc.text(noRecords);
  }

  return pdfBufferFromDocument(doc);
}

const communicationExportCopy = {
  en: { sheet: "Communications", title: "Filtered communications", noRecords: "No records for the selected filters.", headers: ["Code", "Event", "Level", "Type", "Status", "Reporter", "Department", "Location", "Description"] },
  it: { sheet: "Comunicazioni", title: "Comunicazioni filtrate", noRecords: "Nessun record per i filtri selezionati.", headers: ["Codice", "Evento", "Livello", "Tipo", "Stato", "Segnalante", "Reparto", "Luogo", "Descrizione"] },
  pt: { sheet: "Comunicações", title: "Comunicações filtradas", noRecords: "Sem registos para os filtros selecionados.", headers: ["Código", "Evento", "Nível", "Tipo", "Estado", "Comunicante", "Departamento", "Local", "Descrição"] },
  pl: { sheet: "Zgłoszenia", title: "Filtrowane zgłoszenia", noRecords: "Brak rekordów dla wybranych filtrów.", headers: ["Kod", "Zdarzenie", "Poziom", "Typ", "Status", "Zgłaszający", "Dział", "Lokalizacja", "Opis"] },
  de: { sheet: "Meldungen", title: "Gefilterte Meldungen", noRecords: "Keine Datensätze für die ausgewählten Filter.", headers: ["Code", "Ereignis", "Ebene", "Typ", "Status", "Melder", "Abteilung", "Ort", "Beschreibung"] },
  ro: { sheet: "Comunicări", title: "Comunicări filtrate", noRecords: "Nu există înregistrări pentru filtrele selectate.", headers: ["Cod", "Eveniment", "Nivel", "Tip", "Stare", "Raportor", "Departament", "Loc", "Descriere"] },
  fr: { sheet: "Communications", title: "Communications filtrées", noRecords: "Aucun enregistrement pour les filtres sélectionnés.", headers: ["Code", "Événement", "Niveau", "Type", "Statut", "Déclarant", "Département", "Lieu", "Description"] },
} as const;

function getCommunicationExportCopy(locale = "en") {
  return communicationExportCopy[locale as keyof typeof communicationExportCopy] ?? communicationExportCopy.en;
}

function getCommunicationColumns(locale?: string): ExportColumn<CommunicationExportRow>[] {
  const copy = getCommunicationExportCopy(locale);
  return [
    { key: "code", header: copy.headers[0], width: 16 },
    { key: "event", header: copy.headers[1], width: 14 },
    { key: "level", header: copy.headers[2], width: 7 },
    { key: "type", header: copy.headers[3], width: 14 },
    { key: "status", header: copy.headers[4], width: 12 },
    { key: "reporter", header: copy.headers[5], width: 18 },
    { key: "department", header: copy.headers[6], width: 15 },
    { key: "location", header: copy.headers[7], width: 15 },
    { key: "description", header: copy.headers[8], width: 30 },
  ];
}

const actionColumns: ExportColumn<ActionExportRow>[] = [
  { key: "action", header: "Action", width: 24 },
  { key: "level", header: "Level", width: 7 },
  { key: "local", header: "Local", width: 14 },
  { key: "source", header: "Source", width: 12 },
  { key: "priority", header: "Priority", width: 10 },
  { key: "status", header: "Status", width: 10 },
  { key: "owner", header: "Owner", width: 16 },
  { key: "due", header: "Due", width: 10 },
  { key: "description", header: "Descrição", width: 30 },
];

export type CommunicationExportRow = {
  code: string;
  event: string;
  level: string;
  type: string;
  status: string;
  reporter: string;
  department: string;
  location: string;
  description: string;
};

export type ActionExportRow = {
  action: string;
  level: string;
  local: string;
  source: string;
  priority: string;
  status: string;
  owner: string;
  due: string;
  description: string;
};

export const ListExportService = {
  buildCommunicationsXlsx(rows: CommunicationExportRow[], options: { locale?: string } = {}) {
    const copy = getCommunicationExportCopy(options.locale);
    return buildWorkbook(copy.sheet, getCommunicationColumns(options.locale), rows);
  },

  buildCommunicationsPdf(rows: CommunicationExportRow[], options: { locale?: string } = {}) {
    const copy = getCommunicationExportCopy(options.locale);
    return buildPdf(copy.title, getCommunicationColumns(options.locale), rows, copy.noRecords);
  },

  buildActionsXlsx(rows: ActionExportRow[]) {
    return buildWorkbook("Actions", actionColumns, rows);
  },

  buildActionsPdf(rows: ActionExportRow[]) {
    return buildPdf("Filtered actions", actionColumns, rows);
  },
};
