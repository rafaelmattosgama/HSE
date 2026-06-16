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

async function buildPdf<T extends Record<string, string>>(title: string, columns: ExportColumn<T>[], rows: T[]) {
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
    doc.text("No records for the selected filters.");
  }

  return pdfBufferFromDocument(doc);
}

const communicationColumns: ExportColumn<CommunicationExportRow>[] = [
  { key: "code", header: "Code", width: 16 },
  { key: "event", header: "Event", width: 14 },
  { key: "level", header: "Level", width: 7 },
  { key: "type", header: "Type", width: 14 },
  { key: "status", header: "Status", width: 12 },
  { key: "reporter", header: "Reporter", width: 18 },
  { key: "department", header: "Department", width: 15 },
  { key: "location", header: "Location", width: 15 },
  { key: "description", header: "Descrição", width: 30 },
];

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
  buildCommunicationsXlsx(rows: CommunicationExportRow[]) {
    return buildWorkbook("Communications", communicationColumns, rows);
  },

  buildCommunicationsPdf(rows: CommunicationExportRow[]) {
    return buildPdf("Filtered communications", communicationColumns, rows);
  },

  buildActionsXlsx(rows: ActionExportRow[]) {
    return buildWorkbook("Actions", actionColumns, rows);
  },

  buildActionsPdf(rows: ActionExportRow[]) {
    return buildPdf("Filtered actions", actionColumns, rows);
  },
};
