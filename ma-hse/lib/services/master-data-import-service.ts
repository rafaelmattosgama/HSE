import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

type CatalogWorkbookRow = {
  code: string;
  name: string;
};

type WorkerWorkbookRow = {
  employeeNo: string;
  name: string;
  dept: string | null;
};

type MasterDataWorkbookData = {
  departments?: CatalogWorkbookRow[];
  workstations?: CatalogWorkbookRow[];
  equipments?: CatalogWorkbookRow[];
  workers?: WorkerWorkbookRow[];
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getNormalizedRowValues(row: ExcelJS.Row) {
  return Array.from(row.values as unknown[]).map(normalizeText);
}

function findHeaderRow(sheet: ExcelJS.Worksheet, expectedHeaders: string[]) {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber += 1) {
    const values = getNormalizedRowValues(sheet.getRow(rowNumber));
    if (expectedHeaders.every((header) => values.includes(header))) {
      return rowNumber;
    }
  }
  return 0;
}

function buildHeaderMap(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const values = getNormalizedRowValues(sheet.getRow(rowNumber));
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
    const values = getNormalizedRowValues(sheet.getRow(rowNumber));
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

function applyWorksheetTitle(sheet: ExcelJS.Worksheet, title: string, mergeRange: string) {
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
  sheet.mergeCells(mergeRange);
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
}

function addCatalogSheet(workbook: ExcelJS.Workbook, sheetName: string, title: string, rows: CatalogWorkbookRow[]) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [{ width: 18 }, { width: 40 }];
  applyWorksheetTitle(sheet, title, "A1:B1");
  sheet.getRow(3).values = ["Code", "Name"];
  applyHeaderRow(sheet.getRow(3));

  sheet.addRows(
    rows.length > 0
      ? rows.map((row) => [row.code, row.name])
      : [
          ["", ""],
          ["", ""],
          ["", ""],
          ["", ""],
          ["", ""],
        ],
  );

  sheet.views = [{ state: "frozen", ySplit: 3 }];
  return sheet;
}

function addWorkersSheet(workbook: ExcelJS.Workbook, rows: WorkerWorkbookRow[]) {
  const sheet = workbook.addWorksheet("Workers");
  sheet.columns = [{ width: 20 }, { width: 32 }, { width: 28 }];
  applyWorksheetTitle(sheet, "Workers", "A1:C1");
  sheet.getRow(3).values = ["Employee Number", "Name", "Department"];
  applyHeaderRow(sheet.getRow(3));

  sheet.addRows(
    rows.length > 0
      ? rows.map((row) => [row.employeeNo, row.name, row.dept ?? ""])
      : [
          ["", "", ""],
          ["", "", ""],
          ["", "", ""],
          ["", "", ""],
          ["", "", ""],
        ],
  );

  sheet.views = [{ state: "frozen", ySplit: 3 }];
  return sheet;
}

async function buildWorkbook(data: MasterDataWorkbookData = {}) {
  const workbook = new ExcelJS.Workbook();
  const departments = data.departments ?? [];
  const workstations = data.workstations ?? [];
  const equipments = data.equipments ?? [];
  const workers = data.workers ?? [];
  const hasPrefilledData = departments.length + workstations.length + equipments.length + workers.length > 0;

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 120 }];
  instructions.getCell("A1").value = hasPrefilledData ? "Master data export" : "Master data import template";
  instructions.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
  instructions.getCell("A3").value = "Use the sheets Departments, Workstations, Equipment and Workers.";
  instructions.getCell("A4").value = "Departments, Workstations and Equipment sheets require the columns Code and Name.";
  instructions.getCell("A5").value = "Workers sheet requires the columns Employee Number and Name. Department is optional.";
  instructions.getCell("A6").value = hasPrefilledData
    ? "Active records for the selected plant are prefilled. Edit existing rows or append new rows before re-importing."
    : "Leave rows blank if you do not want to import that entity.";
  instructions.getCell("A7").value = "Imports update existing records by code or employee number and reactivate them automatically.";
  instructions.getCell("A8").value = "Keep the worksheet names unchanged when possible to simplify imports.";

  addCatalogSheet(workbook, "Departments", "Departments", departments);
  addCatalogSheet(workbook, "Workstations", "Workstations", workstations);
  addCatalogSheet(workbook, "Equipment", "Equipment", equipments);
  addWorkersSheet(workbook, workers);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
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

async function importEquipments(plantId: string, sheet: ExcelJS.Worksheet) {
  const headerRow = findHeaderRow(sheet, ["code", "name"]);
  if (!headerRow) return 0;

  const headerMap = buildHeaderMap(sheet, headerRow);
  let imported = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const code = getCellText(row, headerMap, ["code", "codigo"], 1);
    const name = getCellText(row, headerMap, ["name", "nome", "equipment", "equipamento"], 2);
    if (!code || !name) continue;

    await prisma.equipment.upsert({
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
    const equipmentSheet = findSheetByNames(workbook, ["equipment", "equipamento"]);
    const workerSheet = findSheetByNames(workbook, ["worker", "trabalhador", "employee"]) ?? findWorkerSheetByHeaders(workbook);

    const summary = {
      departments: departmentSheet ? await importDepartments(plantId, departmentSheet) : 0,
      workstations: workstationSheet ? await importWorkstations(plantId, workstationSheet) : 0,
      equipments: equipmentSheet ? await importEquipments(plantId, equipmentSheet) : 0,
      workers: workerSheet ? await importWorkers(plantId, workerSheet) : 0,
    };

    if (summary.departments + summary.workstations + summary.equipments + summary.workers === 0) {
      throw new Error("Excel file does not contain valid Departments, Workstations, Equipment or Workers sheets");
    }

    return summary;
  },

  async buildTemplate() {
    return buildWorkbook();
  },

  async buildExport(plantId: string) {
    const [departments, workstations, equipments, workers] = await prisma.$transaction([
      prisma.area.findMany({
        where: { plantId, isActive: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        select: { code: true, name: true },
      }),
      prisma.workstation.findMany({
        where: { plantId, isActive: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        select: { code: true, name: true },
      }),
      prisma.equipment.findMany({
        where: { plantId, isActive: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        select: { code: true, name: true },
      }),
      prisma.employeeDirectory.findMany({
        where: { plantId, isActive: true },
        orderBy: [{ employeeNo: "asc" }, { name: "asc" }],
        select: { employeeNo: true, name: true, dept: true },
      }),
    ]);

    return buildWorkbook({
      departments,
      workstations,
      equipments,
      workers,
    });
  },
};
