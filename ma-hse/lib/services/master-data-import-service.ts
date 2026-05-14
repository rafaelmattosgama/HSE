import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findHeaderRow(sheet: ExcelJS.Worksheet, expectedHeaders: string[]) {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber += 1) {
    const values = (sheet.getRow(rowNumber).values as unknown[]).map(normalizeText);
    if (expectedHeaders.every((header) => values.includes(header))) {
      return rowNumber;
    }
  }
  return 0;
}

function buildHeaderMap(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const values = (sheet.getRow(rowNumber).values as unknown[]).map(normalizeText);
  return new Map(values.map((value, index) => [value, index]));
}

function getHeaderIndex(headerMap: Map<string, number>, keys: string[]) {
  for (const key of keys) {
    const match = headerMap.get(normalizeText(key));
    if (typeof match === "number") return match;
  }
  return undefined;
}

function getCellText(row: ExcelJS.Row, headerMap: Map<string, number>, keys: string[], fallbackIndex?: number) {
  const headerIndex = getHeaderIndex(headerMap, keys);
  const cellIndex = headerIndex ?? fallbackIndex;
  if (!cellIndex) return "";
  return String(row.getCell(cellIndex).value ?? "").trim();
}

function findSheetByNames(workbook: ExcelJS.Workbook, names: string[]) {
  return workbook.worksheets.find((sheet) => {
    const normalizedName = normalizeText(sheet.name);
    return names.some((name) => normalizedName.includes(normalizeText(name)));
  });
}

function findWorkerHeaderRow(sheet: ExcelJS.Worksheet) {
  const employeeHeaders = ["employee number", "employee no", "employeeno", "numero", "n", "n interno", "numero trabalhador"];
  const nameHeaders = ["name", "nome", "worker", "trabalhador"];

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber += 1) {
    const values = (sheet.getRow(rowNumber).values as unknown[]).map(normalizeText);
    const hasEmployeeHeader = employeeHeaders.some((header) => values.includes(header));
    const hasNameHeader = nameHeaders.some((header) => values.includes(header));
    if (hasEmployeeHeader && hasNameHeader) {
      return rowNumber;
    }
  }

  return 0;
}

function findWorkerSheetByHeaders(workbook: ExcelJS.Workbook) {
  return workbook.worksheets.find((sheet) => findWorkerHeaderRow(sheet) > 0);
}

async function importDepartments(plantId: string, sheet: ExcelJS.Worksheet) {
  const headerRow = findHeaderRow(sheet, ["code", "name"]);
  if (!headerRow) return 0;

  const headerMap = buildHeaderMap(sheet, headerRow);
  let imported = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const code = getCellText(row, headerMap, ["code", "codigo"], 1);
    const name = getCellText(row, headerMap, ["name", "nome", "department", "departamento", "area"], 2);
    if (!code || !name) continue;

    await prisma.area.upsert({
      where: {
        plantId_code: {
          plantId,
          code,
        },
      },
      update: {
        name,
        isActive: true,
      },
      create: {
        plantId,
        code,
        name,
      },
    });

    imported += 1;
  }

  return imported;
}

async function importWorkstations(plantId: string, sheet: ExcelJS.Worksheet) {
  const headerRow = findHeaderRow(sheet, ["code", "name"]);
  if (!headerRow) return 0;

  const headerMap = buildHeaderMap(sheet, headerRow);
  let imported = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const code = getCellText(row, headerMap, ["code", "codigo"], 1);
    const name = getCellText(row, headerMap, ["name", "nome", "workstation", "posto"], 2);
    if (!code || !name) continue;

    await prisma.workstation.upsert({
      where: {
        plantId_code: {
          plantId,
          code,
        },
      },
      update: {
        name,
        isActive: true,
      },
      create: {
        plantId,
        code,
        name,
      },
    });

    imported += 1;
  }

  return imported;
}

async function importWorkers(plantId: string, sheet: ExcelJS.Worksheet) {
  const headerRow = findWorkerHeaderRow(sheet);
  if (!headerRow) return 0;

  const headerMap = buildHeaderMap(sheet, headerRow);
  const employeeNoIndex = getHeaderIndex(headerMap, ["employee number", "employee no", "employeeNo", "numero", "n", "n interno", "numero trabalhador"]);
  const nameIndex = getHeaderIndex(headerMap, ["name", "nome", "worker", "trabalhador"]);
  if (!employeeNoIndex || !nameIndex) return 0;

  let imported = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const employeeNo = getCellText(
      row,
      headerMap,
      ["employee number", "employee no", "employeeNo", "numero", "n interno", "numero trabalhador"],
      employeeNoIndex,
    );
    const name = getCellText(row, headerMap, ["name", "nome", "worker", "trabalhador"], nameIndex);
    const dept = getCellText(row, headerMap, ["department", "departamento", "dept", "area"]);
    if (!employeeNo || !name) continue;

    await prisma.employeeDirectory.upsert({
      where: {
        plantId_employeeNo: {
          plantId,
          employeeNo,
        },
      },
      update: {
        name,
        dept: dept || null,
        isActive: true,
      },
      create: {
        plantId,
        employeeNo,
        name,
        dept: dept || null,
        isActive: true,
      },
    });

    imported += 1;
  }

  return imported;
}

export const MasterDataImportService = {
  async importFromExcel(plantId: string, fileBuffer: Uint8Array) {
    const workbook = new ExcelJS.Workbook();
    await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(fileBuffer);

    const departmentSheet = findSheetByNames(workbook, ["depart", "area"]);
    const workstationSheet = findSheetByNames(workbook, ["workstation", "posto"]);
    const workerSheet = findSheetByNames(workbook, ["worker", "trabalhador", "employee"]) ?? findWorkerSheetByHeaders(workbook);

    const summary = {
      departments: departmentSheet ? await importDepartments(plantId, departmentSheet) : 0,
      workstations: workstationSheet ? await importWorkstations(plantId, workstationSheet) : 0,
      workers: workerSheet ? await importWorkers(plantId, workerSheet) : 0,
    };

    if (summary.departments + summary.workstations + summary.workers === 0) {
      throw new Error("Excel file does not contain valid Departments, Workstations or Workers sheets");
    }

    return summary;
  },
};
