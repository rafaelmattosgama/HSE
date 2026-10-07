import ExcelJS from "exceljs";
import JSZip from "jszip";
import { normalizeAndValidateSafetyKpiRow, safetyKpiRecordKey } from "@/lib/safety-kpi-history/validation";

export const SAFETY_KPI_IMPORT_SHEET = "KPI_Import";
export const SAFETY_KPI_MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const HEADERS = {
  plant: "Plant", year: "Year", month: "Month", hoursWorked: "Hours Worked", employees: "Employees",
  accidents: "Accidents", lostDays: "Lost Days", seriousInjury: "Serious Injury", minorInjury: "Minor Injury",
  firstAids: "First Aids", nearMiss: "Near Miss", unsafeCondition: "Unsafe Condition", unsafeAct: "Unsafe Act",
  sourceFrequencyRate: "Frequency Rate (Source)", sourceGravityRate: "Gravity Rate (Source)", source: "Source",
  notes: "Notes",
} as const;
const OPTIONAL = new Set(["notes"]);

export class SafetyKpiExcelError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "SafetyKpiExcelError"; }
}

export function normalizeSafetyKpiHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "text" in value) return value.text;
  return value;
}

async function removeCommentRelationships(bytes: Uint8Array) {
  const archive = await JSZip.loadAsync(bytes);
  const relationshipFiles = Object.keys(archive.files).filter(path => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(path));
  let changed = false;
  for (const path of relationshipFiles) {
    const entry = archive.file(path);
    if (!entry) continue;
    const xml = await entry.async("string");
    // Some valid Excel producers put legacy notes in a nested package path
    // that ExcelJS does not load (it expects xl/commentsN.xml). ExcelJS then
    // throws while reconciling the worksheet. Notes are ancillary to KPI data,
    // so remove only note/VML relationships in memory. Some producers also
    // write package-absolute table targets; normalize those for ExcelJS. The
    // original workbook and its cell data remain untouched.
    const normalized = xml
      .replace(/<Relationship\b[^>]*\/>/gi, relationship =>
        /\bType="[^"]*\/(?:comments|vmlDrawing)"/i.test(relationship) ? "" : relationship,
      )
      .replace(/Target="\/xl\/tables\//gi, 'Target="../tables/');
    if (normalized !== xml) {
      archive.file(path, normalized);
      changed = true;
    }
  }
  if (!changed) return bytes;
  const normalizedArchive = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return normalizedArchive;
}

export async function parseSafetyKpiWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  const normalizedBytes = await removeCommentRelationships(bytes);
  await workbook.xlsx.load(Uint8Array.from(normalizedBytes).buffer as ArrayBuffer);
  const sheet = workbook.getWorksheet(SAFETY_KPI_IMPORT_SHEET);
  if (!sheet) throw new SafetyKpiExcelError("MISSING_SHEET", `Worksheet "${SAFETY_KPI_IMPORT_SHEET}" was not found`);
  const headerMap = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => headerMap.set(normalizeSafetyKpiHeader(cellValue(cell)), column));
  const columns = Object.entries(HEADERS).reduce<Record<string, number>>((result, [key, label]) => {
    const column = headerMap.get(normalizeSafetyKpiHeader(label));
    if (column) result[key] = column;
    return result;
  }, {});
  const missing = Object.entries(HEADERS).filter(([key]) => !OPTIONAL.has(key) && !columns[key]).map(([, label]) => label);
  if (missing.length) throw new SafetyKpiExcelError("MISSING_HEADERS", `Missing required columns: ${missing.join(", ")}`);
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const raw = Object.fromEntries(Object.keys(HEADERS).map(key => [key, columns[key] ? cellValue(row.getCell(columns[key])) : null]));
    if (Object.values(raw).every(value => value === null || value === undefined || String(value).trim() === "")) continue;
    const result = normalizeAndValidateSafetyKpiRow(raw);
    rows.push({ rowNumber, raw, recordKey: result.normalized.plantCode ? safetyKpiRecordKey(result.normalized) : null, ...result });
  }
  const counts = new Map<string, number>();
  for (const row of rows) if (row.recordKey) counts.set(row.recordKey, (counts.get(row.recordKey) ?? 0) + 1);
  return rows.map(row => ({ ...row, duplicateFile: Boolean(row.recordKey && (counts.get(row.recordKey) ?? 0) > 1) }));
}
