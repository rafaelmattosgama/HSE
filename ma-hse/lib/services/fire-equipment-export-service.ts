import ExcelJS from "exceljs";

export type FireEquipmentExportRow = {
  code: string;
  type: string;
  location: string;
  status: string;
  quarterlyState: string;
  annualState: string;
  hasOpenNonConformity: string;
  tag: string;
};

const fireEquipmentExportCopy = {
  en: { sheet: "Fire Equipment", headers: ["Code", "Type", "Location", "Status", "Quarterly", "Annual", "Non-conformity", "NFC/QR tag"] },
  pt: { sheet: "Equipamentos SCIE", headers: ["Código", "Tipo", "Localização", "Estado", "Trimestral", "Anual", "Não conformidade", "Ficha NFC/QR"] },
  it: { sheet: "Attrezzature antincendio", headers: ["Codice", "Tipo", "Ubicazione", "Stato", "Trimestrale", "Annuale", "Non conformità", "Etichetta NFC/QR"] },
  pl: { sheet: "Sprzęt przeciwpożarowy", headers: ["Kod", "Typ", "Lokalizacja", "Status", "Kwartalny", "Roczny", "Niezgodność", "Etykieta NFC/QR"] },
  de: { sheet: "Brandschutzausrüstung", headers: ["Code", "Typ", "Standort", "Status", "Vierteljährlich", "Jährlich", "Abweichung", "NFC/QR-Etikett"] },
  ro: { sheet: "Echipamente de incendiu", headers: ["Cod", "Tip", "Locație", "Stare", "Trimestrial", "Anual", "Neconformitate", "Etichetă NFC/QR"] },
  fr: { sheet: "Équipements incendie", headers: ["Code", "Type", "Emplacement", "Statut", "Trimestriel", "Annuel", "Non-conformité", "Étiquette NFC/QR"] },
} as const;

function getFireEquipmentExportCopy(locale = "en") {
  return fireEquipmentExportCopy[locale as keyof typeof fireEquipmentExportCopy] ?? fireEquipmentExportCopy.en;
}

export const FireEquipmentExportService = {
  /** §9: XLSX of the list, both periodicity states side by side (§6's two independent axes) — client sends already-filtered rows, mirroring list-export-service.ts's own pattern. */
  async buildListXlsx(rows: FireEquipmentExportRow[], options: { locale?: string } = {}) {
    const copy = getFireEquipmentExportCopy(options.locale);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MA-HSE";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(copy.sheet);
    sheet.columns = [
      { header: copy.headers[0], key: "code", width: 18 },
      { header: copy.headers[1], key: "type", width: 22 },
      { header: copy.headers[2], key: "location", width: 30 },
      { header: copy.headers[3], key: "status", width: 14 },
      { header: copy.headers[4], key: "quarterlyState", width: 20 },
      { header: copy.headers[5], key: "annualState", width: 20 },
      { header: copy.headers[6], key: "hasOpenNonConformity", width: 18 },
      { header: copy.headers[7], key: "tag", width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    if (rows.length > 0) {
      sheet.addRows(rows);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  },
};
