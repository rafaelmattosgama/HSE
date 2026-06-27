import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  createCustomRowFromIndicator,
  getHazardousLerCodes,
  getMonthlyInputSectionOrder,
  resolveMonthlyInputLayout,
  type CustomMonthlyRow,
  type MonthlyIndicatorConfig,
} from "@/lib/services/monthly-input-layout";
import { buildMonthlyInputRows, type MonthlyInputRow } from "@/lib/services/monthly-inputs";

type LegacyMetricKey = keyof Omit<MonthlyInputRow, "month">;

const LEGACY_METRIC_KEYS = [
  "workerCount",
  "hoursWorked",
  "standardHours",
  "spillsNumber",
  "electricityFromGridMwh",
  "selfProducedEnergyMwh",
  "heatingM3",
  "waterConsumedNetworkM3",
  "waterConsumedCapturedM3",
  "compressedAirConsumedM3",
  "compressedAirConsumedMwh",
  "ewc150101PaperCardboardPackagingTons",
  "ewc150102PlasticPackagingTons",
  "ewc150103WoodTons",
  "ewc160117FerrousMetalsTons",
  "ewc160118NonFerrousMetalsCopperTons",
  "ewc170117ConstructionWasteTons",
  "ewc200111Tons",
  "ewc200136ElectricalElectronicEquipmentTons",
  "ewc200139PlasticTons",
  "ewc200301UnsortedUrbanWasteTons",
  "hazardousWasteTons",
  "recycledWasteTons",
] as const satisfies readonly LegacyMetricKey[];

function isLegacyMetricKey(value: string): value is LegacyMetricKey {
  return (LEGACY_METRIC_KEYS as readonly string[]).includes(value);
}

type ImportIssue = {
  sheet: string;
  row: number;
  column: string;
  message: string;
};

export type MonthlyInputsImportSummary = {
  year: number;
  indicatorsCreated: number;
  indicatorsUpdated: number;
  monthlyValuesCreated: number;
  monthlyValuesUpdated: number;
  rowsIgnored: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

const MONTHS = [
  { key: "january", label: "Janeiro" },
  { key: "february", label: "Fevereiro" },
  { key: "march", label: "Marco" },
  { key: "april", label: "Abril" },
  { key: "may", label: "Maio" },
  { key: "june", label: "Junho" },
  { key: "july", label: "Julho" },
  { key: "august", label: "Agosto" },
  { key: "september", label: "Setembro" },
  { key: "october", label: "Outubro" },
  { key: "november", label: "Novembro" },
  { key: "december", label: "Dezembro" },
] as const;

const BASE_COLUMNS = [
  "Internal ID",
  "Code",
  "Category",
  "Subcategory",
  "Indicator name",
  "Description / question",
  "Unit",
  "Input type",
  "Formula / calculation",
  "Column 2 label",
  "Column 2 value",
  "Column 2 options",
  "Unit options",
  "Distance KM",
  "Enabled",
  "Observations",
];
const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;
const MONTH_START_COLUMN = BASE_COLUMNS.length + 1;
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function monthlyCustomRowsKey(year: number) {
  return `${SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT}_${year}_ROWS`;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeHeader(value);
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  let suffix = 1;
  while (used.has(name.toLowerCase())) {
    const marker = ` ${suffix}`;
    name = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function emptyMonths() {
  return Array.from({ length: 12 }, () => null as number | null);
}

function getRowValues(input: {
  months: MonthlyInputRow[];
  customRows: CustomMonthlyRow[];
  standardHours: Array<number | null>;
  indicator: MonthlyIndicatorConfig;
}) {
  if (input.indicator.id === "standard-hours") return input.standardHours;
  if (input.indicator.legacyKey) {
    return input.months.map((month) => month[input.indicator.legacyKey!]);
  }
  return input.customRows.find((row) => row.id === input.indicator.id)?.months ?? emptyMonths();
}

function computeStandardHours(indicatorConfig: MonthlyIndicatorConfig[], customRows: CustomMonthlyRow[]) {
  const totalMinCarRow = customRows.find((row) => row.id === "total-min-car");
  const volumesRow = customRows.find((row) => row.id === "volumes");
  const standardHoursRow = indicatorConfig.find((row) => row.id === "standard-hours");

  return Array.from({ length: 12 }, (_, index) => {
    if (!standardHoursRow?.enabled) return null;

    const totalMinCar = totalMinCarRow?.enabled ? totalMinCarRow.months[index] : null;
    const volumes = volumesRow?.enabled ? volumesRow.months[index] : null;
    if (typeof totalMinCar !== "number" || typeof volumes !== "number") return null;

    return Number(((totalMinCar * volumes) / 60).toFixed(2));
  });
}

function isIntegerLegacyKey(key: LegacyMetricKey | null) {
  return key === "workerCount" || key === "spillsNumber";
}

function toNumberOrNull(value: unknown) {
  const raw = typeof value === "object" && value && "result" in value
    ? (value as { result?: unknown }).result
    : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(String(raw).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function textCell(value: unknown) {
  const raw = typeof value === "object" && value && "text" in value
    ? (value as { text?: unknown }).text
    : value;
  return String(raw ?? "").trim();
}

function boolCell(value: unknown, fallback = true) {
  const normalized = normalizeHeader(value);
  if (!normalized) return fallback;
  if (["yes", "sim", "true", "1", "active", "ativo"].includes(normalized)) return true;
  if (["no", "nao", "false", "0", "inactive", "inativo"].includes(normalized)) return false;
  return fallback;
}

function sanitizeFormulaText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\s*=/.test(trimmed)) return `'${trimmed}`;
  return trimmed;
}

function buildHeaderMap(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(HEADER_ROW);
  const map = new Map<string, number>();
  row.eachCell((cell, columnNumber) => {
    map.set(normalizeHeader(cell.value), columnNumber);
  });
  return map;
}

function getColumn(headerMap: Map<string, number>, name: string) {
  return headerMap.get(normalizeHeader(name)) ?? 0;
}

function getCell(row: ExcelJS.Row, headerMap: Map<string, number>, name: string) {
  const column = getColumn(headerMap, name);
  return column ? row.getCell(column).value : null;
}

function createIssue(sheet: string, row: number, column: string, message: string): ImportIssue {
  return { sheet, row, column, message };
}

function indicatorMatchKey(indicator: Pick<MonthlyIndicatorConfig, "section" | "label">) {
  return `${normalizeKey(indicator.section)}::${normalizeKey(indicator.label)}`;
}

function buildExcelFormulaForMonthlyCell(indicator: MonthlyIndicatorConfig, rowNumber: number, monthIndex: number, rowById: Map<string, number>) {
  if (indicator.id !== "standard-hours") return null;
  const totalMinCarRow = rowById.get("total-min-car");
  const volumesRow = rowById.get("volumes");
  if (!totalMinCarRow || !volumesRow) return null;

  const cellAddress = (sourceRow: number) => {
    const column = MONTH_START_COLUMN + monthIndex;
    let n = column;
    let name = "";
    while (n > 0) {
      const remainder = (n - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      n = Math.floor((n - remainder) / 26);
    }
    return `${name}${sourceRow}`;
  };

  return `ROUND((${cellAddress(totalMinCarRow)}*${cellAddress(volumesRow)})/60,2)`;
}

async function loadMonthlyInputState(plantId: string, year: number) {
  const [rows, kpiRows, layoutParameter, customRowsParameter] = await prisma.$transaction([
    prisma.plantMonthlyInput.findMany({
      where: { plantId, year },
      orderBy: { month: "asc" },
    }),
    prisma.safetyKpiMonthlyInput.findMany({
      where: { plantId, year },
      orderBy: { month: "asc" },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId,
          key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        },
      },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId,
          key: monthlyCustomRowsKey(year),
        },
      },
    }),
  ]);

  const months = buildMonthlyInputRows(rows, kpiRows);
  const { indicatorConfig, customRows } = resolveMonthlyInputLayout(
    layoutParameter?.valueJson,
    customRowsParameter?.valueJson,
  );

  return { months, indicatorConfig, customRows };
}

function toEnergyTotal(entry: { electricityFromGridMwh: number | null; selfProducedEnergyMwh: number | null }) {
  const values = [entry.electricityFromGridMwh, entry.selfProducedEnergyMwh].filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function toNonHazardousWasteTotal(entry: MonthlyInputRow) {
  const values = [
    entry.ewc150101PaperCardboardPackagingTons,
    entry.ewc150102PlasticPackagingTons,
    entry.ewc150103WoodTons,
    entry.ewc160117FerrousMetalsTons,
    entry.ewc160118NonFerrousMetalsCopperTons,
    entry.ewc170117ConstructionWasteTons,
    entry.ewc200111Tons,
    entry.ewc200136ElectricalElectronicEquipmentTons,
    entry.ewc200139PlasticTons,
    entry.ewc200301UnsortedUrbanWasteTons,
  ].filter((value): value is number => value !== null);

  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function decimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value);
}

async function persistMonthlyInputState(input: {
  plantId: string;
  year: number;
  months: MonthlyInputRow[];
  indicatorConfig: MonthlyIndicatorConfig[];
  customRows: CustomMonthlyRow[];
}) {
  await prisma.$transaction([
    ...input.months.flatMap((entry) => [
      prisma.plantMonthlyInput.upsert({
        where: {
          plantId_year_month: {
            plantId: input.plantId,
            year: input.year,
            month: entry.month,
          },
        },
        update: {
          workerCount: entry.workerCount,
          hoursWorked: decimal(entry.hoursWorked),
          standardHours: decimal(entry.standardHours),
          spillsNumber: entry.spillsNumber,
          energyConsumedMwh: decimal(toEnergyTotal(entry)),
          electricityFromGridMwh: decimal(entry.electricityFromGridMwh),
          selfProducedEnergyMwh: decimal(entry.selfProducedEnergyMwh),
          heatingM3: decimal(entry.heatingM3),
          waterConsumedNetworkM3: decimal(entry.waterConsumedNetworkM3),
          waterConsumedCapturedM3: decimal(entry.waterConsumedCapturedM3),
          compressedAirConsumedM3: decimal(entry.compressedAirConsumedM3),
          compressedAirConsumedMwh: decimal(entry.compressedAirConsumedMwh),
          nonHazardousWasteTons: decimal(toNonHazardousWasteTotal(entry)),
          ewc150101PaperCardboardPackagingTons: decimal(entry.ewc150101PaperCardboardPackagingTons),
          ewc150102PlasticPackagingTons: decimal(entry.ewc150102PlasticPackagingTons),
          ewc150103WoodTons: decimal(entry.ewc150103WoodTons),
          ewc160117FerrousMetalsTons: decimal(entry.ewc160117FerrousMetalsTons),
          ewc160118NonFerrousMetalsCopperTons: decimal(entry.ewc160118NonFerrousMetalsCopperTons),
          ewc170117ConstructionWasteTons: decimal(entry.ewc170117ConstructionWasteTons),
          ewc200111Tons: decimal(entry.ewc200111Tons),
          ewc200136ElectricalElectronicEquipmentTons: decimal(entry.ewc200136ElectricalElectronicEquipmentTons),
          ewc200139PlasticTons: decimal(entry.ewc200139PlasticTons),
          ewc200301UnsortedUrbanWasteTons: decimal(entry.ewc200301UnsortedUrbanWasteTons),
          hazardousWasteTons: decimal(entry.hazardousWasteTons),
          recycledWasteTons: decimal(entry.recycledWasteTons),
        },
        create: {
          plantId: input.plantId,
          year: input.year,
          month: entry.month,
          workerCount: entry.workerCount,
          hoursWorked: decimal(entry.hoursWorked),
          standardHours: decimal(entry.standardHours),
          spillsNumber: entry.spillsNumber,
          energyConsumedMwh: decimal(toEnergyTotal(entry)),
          electricityFromGridMwh: decimal(entry.electricityFromGridMwh),
          selfProducedEnergyMwh: decimal(entry.selfProducedEnergyMwh),
          heatingM3: decimal(entry.heatingM3),
          waterConsumedNetworkM3: decimal(entry.waterConsumedNetworkM3),
          waterConsumedCapturedM3: decimal(entry.waterConsumedCapturedM3),
          compressedAirConsumedM3: decimal(entry.compressedAirConsumedM3),
          compressedAirConsumedMwh: decimal(entry.compressedAirConsumedMwh),
          nonHazardousWasteTons: decimal(toNonHazardousWasteTotal(entry)),
          ewc150101PaperCardboardPackagingTons: decimal(entry.ewc150101PaperCardboardPackagingTons),
          ewc150102PlasticPackagingTons: decimal(entry.ewc150102PlasticPackagingTons),
          ewc150103WoodTons: decimal(entry.ewc150103WoodTons),
          ewc160117FerrousMetalsTons: decimal(entry.ewc160117FerrousMetalsTons),
          ewc160118NonFerrousMetalsCopperTons: decimal(entry.ewc160118NonFerrousMetalsCopperTons),
          ewc170117ConstructionWasteTons: decimal(entry.ewc170117ConstructionWasteTons),
          ewc200111Tons: decimal(entry.ewc200111Tons),
          ewc200136ElectricalElectronicEquipmentTons: decimal(entry.ewc200136ElectricalElectronicEquipmentTons),
          ewc200139PlasticTons: decimal(entry.ewc200139PlasticTons),
          ewc200301UnsortedUrbanWasteTons: decimal(entry.ewc200301UnsortedUrbanWasteTons),
          hazardousWasteTons: decimal(entry.hazardousWasteTons),
          recycledWasteTons: decimal(entry.recycledWasteTons),
        },
      }),
      prisma.safetyKpiMonthlyInput.upsert({
        where: {
          plantId_year_month: {
            plantId: input.plantId,
            year: input.year,
            month: entry.month,
          },
        },
        update: {
          hoursWorked: new Prisma.Decimal(entry.hoursWorked ?? 0),
        },
        create: {
          plantId: input.plantId,
          year: input.year,
          month: entry.month,
          hoursWorked: new Prisma.Decimal(entry.hoursWorked ?? 0),
        },
      }),
    ]),
    prisma.systemParameter.upsert({
      where: {
        plantId_key: {
          plantId: input.plantId,
          key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        },
      },
      create: {
        plantId: input.plantId,
        key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        valueJson: input.indicatorConfig as Prisma.InputJsonValue,
      },
      update: {
        valueJson: input.indicatorConfig as Prisma.InputJsonValue,
      },
    }),
    prisma.systemParameter.upsert({
      where: {
        plantId_key: {
          plantId: input.plantId,
          key: monthlyCustomRowsKey(input.year),
        },
      },
      create: {
        plantId: input.plantId,
        key: monthlyCustomRowsKey(input.year),
        valueJson: input.customRows as Prisma.InputJsonValue,
      },
      update: {
        valueJson: input.customRows as Prisma.InputJsonValue,
      },
    }),
  ]);
}

function updateMonthlyValue(input: {
  months: MonthlyInputRow[];
  customRows: CustomMonthlyRow[];
  indicator: MonthlyIndicatorConfig;
  monthIndex: number;
  value: number | null;
}) {
  if (input.indicator.valueMode === "computed") return false;
  if (input.indicator.legacyKey) {
    input.months[input.monthIndex] = {
      ...input.months[input.monthIndex]!,
      [input.indicator.legacyKey]: input.value,
    };
    return true;
  }

  const row = input.customRows.find((entry) => entry.id === input.indicator.id);
  if (!row) return false;
  row.months[input.monthIndex] = input.value;
  return true;
}

function applyImportedIndicatorMeta(target: MonthlyIndicatorConfig, source: MonthlyIndicatorConfig) {
  target.section = source.section;
  target.subsection = source.subsection;
  target.label = source.label;
  target.enabled = source.enabled;
  target.col2Label = source.col2Label;
  target.col2Value = source.col2Value;
  target.col2Options = source.col2Options;
  target.col3Unit = source.col3Unit;
  target.col3Options = source.col3Options;
  target.distanceKm = source.distanceKm;
  target.valueMode = source.valueMode;
}

function syncCustomRowMeta(customRows: CustomMonthlyRow[], config: MonthlyIndicatorConfig) {
  const existing = customRows.find((row) => row.id === config.id);
  if (!existing) return;
  existing.section = config.section;
  existing.subsection = config.subsection;
  existing.label = config.label;
  existing.enabled = config.enabled;
  existing.col2Label = config.col2Label;
  existing.col2Value = config.col2Value;
  existing.col2Options = [...config.col2Options];
  existing.col3Unit = config.col3Unit;
  existing.col3Options = [...config.col3Options];
  existing.distanceKm = config.distanceKm;
  existing.valueMode = config.valueMode;
}

function countExistingMonthlyValues(input: {
  indicator: MonthlyIndicatorConfig;
  existingMonths: MonthlyInputRow[];
  existingCustomRows: CustomMonthlyRow[];
}) {
  const values = getRowValues({
    months: input.existingMonths,
    customRows: input.existingCustomRows,
    standardHours: computeStandardHours([input.indicator], input.existingCustomRows),
    indicator: input.indicator,
  });
  return values.filter((value) => value !== null).length;
}

function parseYear(workbook: ExcelJS.Workbook) {
  const metadata = workbook.getWorksheet("Metadata");
  const value = metadata?.getCell("B2").value;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function looksBlankRow(row: ExcelJS.Row, headerMap: Map<string, number>) {
  const fields = ["Internal ID", "Code", "Category", "Indicator name", ...MONTHS.map((month) => month.label)];
  return fields.every((field) => {
    const value = getCell(row, headerMap, field);
    return textCell(value) === "";
  });
}

function parseImportedIndicator(input: {
  row: ExcelJS.Row;
  sheetName: string;
  sectionFromSheet: string;
  headerMap: Map<string, number>;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}) {
  const id = textCell(getCell(input.row, input.headerMap, "Internal ID"));
  const code = textCell(getCell(input.row, input.headerMap, "Code"));
  const category = textCell(getCell(input.row, input.headerMap, "Category")) || input.sectionFromSheet;
  const label = textCell(getCell(input.row, input.headerMap, "Indicator name"));
  const formula = sanitizeFormulaText(textCell(getCell(input.row, input.headerMap, "Formula / calculation")));

  if (!category) {
    input.errors.push(createIssue(input.sheetName, input.row.number, "Category", "Category is required."));
  }
  if (!label) {
    input.errors.push(createIssue(input.sheetName, input.row.number, "Indicator name", "Indicator name is required."));
  }

  if (!category || !label) return null;

  if (formula?.startsWith("'=")) {
    input.warnings.push(createIssue(input.sheetName, input.row.number, "Formula / calculation", "Formula was stored as text and not executed."));
  }

  const col2Options = textCell(getCell(input.row, input.headerMap, "Column 2 options"))
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const col3Options = textCell(getCell(input.row, input.headerMap, "Unit options"))
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const inputType = normalizeHeader(getCell(input.row, input.headerMap, "Input type"));

  return {
    id,
    code,
    config: {
      id,
      section: category,
      subsection: textCell(getCell(input.row, input.headerMap, "Subcategory")) || null,
      label,
      legacyKey: isLegacyMetricKey(code) ? code : null,
      enabled: boolCell(getCell(input.row, input.headerMap, "Enabled"), true),
      col2Label: textCell(getCell(input.row, input.headerMap, "Column 2 label")) || (formula ? "Formula" : null),
      col2Value: textCell(getCell(input.row, input.headerMap, "Column 2 value")) || formula,
      col2Options,
      col3Unit: textCell(getCell(input.row, input.headerMap, "Unit")) || null,
      col3Options,
      distanceKm: textCell(getCell(input.row, input.headerMap, "Distance KM")) || null,
      valueMode: inputType.includes("computed") || inputType.includes("auto") ? "computed" : "manual",
    } satisfies MonthlyIndicatorConfig,
  };
}

type WorkbookFormat = "legacy" | "hse" | "unknown";

type MonthColumns = Map<number, number>;

type HseImportState = {
  plantId: string;
  year: number;
  months: MonthlyInputRow[];
  existingMonths: MonthlyInputRow[];
  indicatorConfig: MonthlyIndicatorConfig[];
  customRows: CustomMonthlyRow[];
  existingCustomRows: CustomMonthlyRow[];
  summary: MonthlyInputsImportSummary;
};

const MONTH_ALIASES = [
  ["jan", "january", "janeiro"],
  ["feb", "february", "fevereiro"],
  ["mar", "march", "marco"],
  ["apr", "april", "abril"],
  ["may", "maio"],
  ["jun", "june", "junho"],
  ["jul", "july", "julho"],
  ["aug", "august", "agosto"],
  ["sep", "sept", "september", "setembro"],
  ["oct", "october", "outubro"],
  ["nov", "november", "novembro"],
  ["dec", "december", "dezembro"],
] as const;

const HSE_KNOWN_EWC_LEGACY_KEYS = {
  "150101": "ewc150101PaperCardboardPackagingTons",
  "150102": "ewc150102PlasticPackagingTons",
  "150103": "ewc150103WoodTons",
  "160117": "ewc160117FerrousMetalsTons",
  "160118": "ewc160118NonFerrousMetalsCopperTons",
  "170117": "ewc170117ConstructionWasteTons",
  "200111": "ewc200111Tons",
  "200136": "ewc200136ElectricalElectronicEquipmentTons",
  "200139": "ewc200139PlasticTons",
  "200301": "ewc200301UnsortedUrbanWasteTons",
} as const satisfies Record<string, LegacyMetricKey>;

const HSE_HAZARDOUS_FALLBACK_CODES = new Set(
  getHazardousLerCodes()
    .map((entry) => entry.match(/\b(\d{6})\b/)?.[1])
    .filter((entry): entry is string => Boolean(entry)),
);

function normalizeSheetName(value: string) {
  return normalizeHeader(value);
}

function isWorksheetVisible(sheet: ExcelJS.Worksheet) {
  return !sheet.state || sheet.state === "visible";
}

function getVisibleWorksheets(workbook: ExcelJS.Workbook) {
  return workbook.worksheets.filter(isWorksheetVisible);
}

function findVisibleWorksheet(workbook: ExcelJS.Workbook, name: string) {
  const normalized = normalizeSheetName(name);
  return getVisibleWorksheets(workbook).find((sheet) => normalizeSheetName(sheet.name) === normalized);
}

function detectWorkbookFormat(workbook: ExcelJS.Workbook): WorkbookFormat {
  if (findVisibleWorksheet(workbook, "Sustainability data entry")) return "hse";
  if (workbook.getWorksheet("Metadata")) return "legacy";
  return "unknown";
}

function yearFromText(value: unknown) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 2000 && numeric <= 2100) return numeric;
  const match = textCell(value).match(/\b(20\d{2}|2100)\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function parseHseYear(workbook: ExcelJS.Workbook) {
  const metadataYear = parseYear(workbook);
  if (metadataYear) return metadataYear;

  for (const sheet of getVisibleWorksheets(workbook)) {
    const sheetYear = yearFromText(sheet.name);
    if (sheetYear) return sheetYear;

    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 12); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= Math.min(row.cellCount, 20); column += 1) {
        const cellYear = yearFromText(row.getCell(column).value);
        if (cellYear) return cellYear;
      }
    }
  }

  return null;
}

function monthIndexFromHeader(value: unknown) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  const tokens = normalized.split(" ");
  const compact = normalized.replace(/\s+/g, "");

  for (let index = 0; index < MONTH_ALIASES.length; index += 1) {
    const aliases = MONTH_ALIASES[index] ?? [];
    if (aliases.some((alias) => tokens.includes(alias) || compact === alias)) return index;
  }

  return null;
}

function getMonthColumnsFromRow(row: ExcelJS.Row) {
  const columns: MonthColumns = new Map();
  row.eachCell((cell, columnNumber) => {
    const monthIndex = monthIndexFromHeader(cell.value);
    if (monthIndex !== null && !columns.has(monthIndex)) {
      columns.set(monthIndex, columnNumber);
    }
  });
  return columns;
}

function findMonthHeader(sheet: ExcelJS.Worksheet, minMonthCount = 3) {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const monthColumns = getMonthColumnsFromRow(row);
    if (monthColumns.size >= minMonthCount) return { rowNumber, monthColumns };
  }
  return null;
}

function findColumn(row: ExcelJS.Row, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  let found = 0;
  row.eachCell((cell, columnNumber) => {
    if (found) return;
    const normalized = normalizeHeader(cell.value);
    if (!normalized) return;
    if (normalizedAliases.includes(normalized) || normalizedAliases.some((alias) => alias.length > 2 && normalized.includes(alias))) {
      found = columnNumber;
    }
  });
  return found;
}

function rowText(row: ExcelJS.Row, maxColumn = row.cellCount) {
  const parts: string[] = [];
  for (let column = 1; column <= maxColumn; column += 1) {
    const value = textCell(row.getCell(column).value);
    if (value) parts.push(value);
  }
  return parts.join(" ");
}

function firstTextBeforeMonths(row: ExcelJS.Row, firstMonthColumn: number, ignoredColumns: Set<number>) {
  for (let column = 1; column < firstMonthColumn; column += 1) {
    if (ignoredColumns.has(column)) continue;
    const value = textCell(row.getCell(column).value);
    if (value) return value;
  }
  return "";
}

function hseHash(parts: Array<string | null | undefined>) {
  return createHash("sha1")
    .update(parts.map((part) => normalizeKey(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 14);
}

function deterministicHseId(prefix: string, parts: Array<string | null | undefined>) {
  return `hse-${prefix}-${hseHash(parts)}`;
}

function normalizeUnit(value: string | null | undefined) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (["t", "ton", "tons", "tonelada", "toneladas", "tonnes"].includes(normalized)) return "Toneladas";
  if (["kg", "kgs", "kilogram", "kilograms", "quilograma", "quilogramas"].includes(normalized)) return "Kg";
  if (["m3", "m 3", "m ³", "m³", "cubic meters", "cubic metres"].includes(normalized)) return "M3";
  if (["mwh"].includes(normalized)) return "MWh";
  if (["kwh"].includes(normalized)) return "KWh";
  if (["gj"].includes(normalized)) return "GJ";
  if (["l", "lt", "liter", "liters", "litre", "litres", "litro", "litros"].includes(normalized)) return "Litros";
  if (["km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"].includes(normalized)) return "Km";
  if (["t km", "ton km", "ton kilometer", "ton kilometre", "tkm"].includes(normalized)) return "t/km";
  if (["st h", "sth", "standard hours", "standard hour", "hours", "hour", "h"].includes(normalized)) return "Hours";
  if (["units", "unit", "unidades", "pecas", "pcs"].includes(normalized)) return "Units";
  return value?.trim() || null;
}

function inferUnitFromRow(text: string) {
  const normalized = normalizeHeader(text);
  if (/\bt\s*\/\s*km\b/i.test(text) || normalized.includes("t km")) return "t/km";
  if (/\bm\s*3\b/i.test(text) || /\bm³\b/i.test(text)) return "M3";
  if (/\bmwh\b/i.test(text)) return "MWh";
  if (/\bkwh\b/i.test(text)) return "KWh";
  if (/\bkg\b/i.test(text)) return "Kg";
  if (/\b(?:ton|tons|toneladas?|t)\b/i.test(text)) return "Toneladas";
  if (/\b(?:litros?|liters?|litres?|l)\b/i.test(text)) return "Litros";
  if (/\bkm\b/i.test(text)) return "Km";
  if (/\bst\.?\s*h\b/i.test(text)) return "Hours";
  return null;
}

function isDistanceOnlyUnit(unit: string | null) {
  const normalized = normalizeUnit(unit);
  return normalized === "Km" || normalized === "t/km";
}

function toTons(value: number, unit: string | null) {
  const normalized = normalizeUnit(unit);
  if (normalized === "Toneladas") return value;
  if (normalized === "Kg") return value / 1000;
  return null;
}

function normalizeTreatment(value: string | null | undefined) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (normalized.includes("recovery") || normalized.includes("recycling") || normalized.includes("reciclagem") || normalized.includes("recuperacao")) return "Recovery";
  if (normalized.includes("disposal") || normalized.includes("landfill") || normalized.includes("eliminacao")) return "Disposal";
  return null;
}

function inferTreatmentFromRow(text: string) {
  return normalizeTreatment(text);
}

function extractEwcCode(text: string) {
  return text.match(/\b(?:EWC|LER)?\s*(\d{6})\b/i)?.[1] ?? null;
}

function shortWasteDescription(text: string, code: string) {
  const cleaned = text
    .replace(/\b(?:EWC|LER)?\s*\d{6}\b/gi, "")
    .replace(/\b(?:Recovery|Disposal)\b/gi, "")
    .replace(/\b(?:Kg|Toneladas|Tons?|t|Litros|L|MWh|KWh|M3|m³|Km|t\/km)\b/gi, "")
    .replace(/[-:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 90) : `EWC ${code}`;
}

function parseMonthlyValues(input: {
  row: ExcelJS.Row;
  sheetName: string;
  monthColumns: MonthColumns;
  summary: MonthlyInputsImportSummary;
}) {
  const values = emptyMonths();
  let hasValues = false;

  input.monthColumns.forEach((columnNumber, monthIndex) => {
    const rawValue = input.row.getCell(columnNumber).value;
    const parsedValue = toNumberOrNull(rawValue);
    if (Number.isNaN(parsedValue)) {
      input.summary.errors.push(createIssue(input.sheetName, input.row.number, MONTHS[monthIndex]?.label ?? `Month ${monthIndex + 1}`, "Monthly value must be numeric and non-negative."));
      return;
    }
    if (parsedValue === null) return;
    values[monthIndex] = parsedValue;
    hasValues = true;
  });

  return hasValues ? values : null;
}

function cloneMonthlyState(existing: Awaited<ReturnType<typeof loadMonthlyInputState>>) {
  return {
    months: existing.months.map((month) => ({ ...month })),
    existingMonths: existing.months.map((month) => ({ ...month })),
    indicatorConfig: existing.indicatorConfig.map((indicator) => ({
      ...indicator,
      col2Options: [...indicator.col2Options],
      col3Options: [...indicator.col3Options],
    })),
    customRows: existing.customRows.map((row) => ({
      ...row,
      col2Options: [...row.col2Options],
      col3Options: [...row.col3Options],
      months: [...row.months],
    })),
    existingCustomRows: existing.customRows.map((row) => ({
      ...row,
      col2Options: [...row.col2Options],
      col3Options: [...row.col3Options],
      months: [...row.months],
    })),
  };
}

function naturalIndicatorKey(indicator: Pick<MonthlyIndicatorConfig, "section" | "subsection" | "label" | "col2Value" | "col3Unit" | "distanceKm">) {
  return [
    indicator.section,
    indicator.subsection ?? "",
    indicator.label,
    indicator.col2Value ?? "",
    normalizeUnit(indicator.col3Unit) ?? "",
    indicator.distanceKm ?? "",
  ].map(normalizeKey).join("::");
}

function findHseIndicator(state: HseImportState, config: MonthlyIndicatorConfig) {
  if (config.id) {
    const byId = state.indicatorConfig.find((indicator) => indicator.id === config.id);
    if (byId) return byId;
  }
  if (config.legacyKey) {
    const byLegacy = state.indicatorConfig.find((indicator) => indicator.legacyKey === config.legacyKey);
    if (byLegacy) return byLegacy;
  }

  const naturalKey = naturalIndicatorKey(config);
  const byNatural = state.indicatorConfig.find((indicator) => naturalIndicatorKey(indicator) === naturalKey);
  if (byNatural) return byNatural;

  const rowByNatural = state.customRows.find((row) => naturalIndicatorKey(row) === naturalKey);
  if (!rowByNatural) return null;

  return state.indicatorConfig.find((indicator) => indicator.id === rowByNatural.id) ?? {
    id: rowByNatural.id,
    section: rowByNatural.section,
    subsection: rowByNatural.subsection,
    label: rowByNatural.label,
    legacyKey: null,
    enabled: rowByNatural.enabled,
    col2Label: rowByNatural.col2Label,
    col2Value: rowByNatural.col2Value,
    col2Options: [...rowByNatural.col2Options],
    col3Unit: rowByNatural.col3Unit,
    col3Options: [...rowByNatural.col3Options],
    distanceKm: rowByNatural.distanceKm,
    valueMode: rowByNatural.valueMode,
  };
}

function ensureHseIndicator(state: HseImportState, config: MonthlyIndicatorConfig) {
  let indicator = findHseIndicator(state, config);
  if (!indicator) {
    indicator = config;
    state.indicatorConfig.push(indicator);
    if (!indicator.legacyKey) {
      state.customRows.push(createCustomRowFromIndicator(indicator));
    }
    state.summary.indicatorsCreated += 1;
    return indicator;
  }

  if (!state.indicatorConfig.some((entry) => entry.id === indicator.id)) {
    state.indicatorConfig.push(indicator);
    state.summary.indicatorsCreated += 1;
  }

  const before = JSON.stringify(indicator);
  const merged = {
    ...config,
    id: indicator.id,
    legacyKey: indicator.legacyKey,
    valueMode: indicator.valueMode,
  };
  applyImportedIndicatorMeta(indicator, merged);
  syncCustomRowMeta(state.customRows, indicator);
  if (JSON.stringify(indicator) !== before) state.summary.indicatorsUpdated += 1;

  if (!indicator.legacyKey && !state.customRows.some((row) => row.id === indicator.id)) {
    state.customRows.push(createCustomRowFromIndicator(indicator));
  }

  return indicator;
}

function setHseMonthlyValue(state: HseImportState, indicator: MonthlyIndicatorConfig, monthIndex: number, value: number) {
  if (indicator.legacyKey) {
    const oldValue = state.months[monthIndex]?.[indicator.legacyKey] ?? null;
    state.months[monthIndex] = {
      ...state.months[monthIndex]!,
      [indicator.legacyKey]: value,
    };
    if (oldValue === null) state.summary.monthlyValuesCreated += 1;
    else state.summary.monthlyValuesUpdated += 1;
    return;
  }

  let row = state.customRows.find((entry) => entry.id === indicator.id);
  if (!row) {
    row = createCustomRowFromIndicator(indicator);
    state.customRows.push(row);
  }
  const oldValue = row.months[monthIndex] ?? null;
  row.months[monthIndex] = value;
  if (oldValue === null) state.summary.monthlyValuesCreated += 1;
  else state.summary.monthlyValuesUpdated += 1;
}

function applyHseMonthlyValues(input: {
  state: HseImportState;
  indicator: MonthlyIndicatorConfig;
  values: Array<number | null>;
  sheetName: string;
  rowNumber: number;
}) {
  input.values.forEach((value, monthIndex) => {
    if (typeof value !== "number") return;
    if (isIntegerLegacyKey(input.indicator.legacyKey) && !Number.isInteger(value)) {
      input.state.summary.errors.push(createIssue(input.sheetName, input.rowNumber, MONTHS[monthIndex]?.label ?? `Month ${monthIndex + 1}`, "This indicator requires an integer value."));
      return;
    }
    setHseMonthlyValue(input.state, input.indicator, monthIndex, value);
  });
}

function applyHseAggregateLegacyValues(input: {
  state: HseImportState;
  indicator: MonthlyIndicatorConfig;
  values: Array<number | null>;
  sheetName: string;
  rowNumber: number;
}) {
  if (!input.indicator.legacyKey) return;
  input.values.forEach((value, monthIndex) => {
    if (typeof value !== "number") return;
    const current = input.state.months[monthIndex]?.[input.indicator.legacyKey!] ?? null;
    setHseMonthlyValue(input.state, input.indicator, monthIndex, (current ?? 0) + value);
  });
}

function hseConfig(input: {
  id: string;
  section: string;
  subsection: string | null;
  label: string;
  legacyKey?: LegacyMetricKey | null;
  col2Label?: string | null;
  col2Value?: string | null;
  col2Options?: string[];
  col3Unit?: string | null;
  col3Options?: string[];
  distanceKm?: string | null;
  valueMode?: "manual" | "computed";
}) {
  return {
    id: input.id,
    section: input.section,
    subsection: input.subsection,
    label: input.label,
    legacyKey: input.legacyKey ?? null,
    enabled: true,
    col2Label: input.col2Label ?? null,
    col2Value: input.col2Value ?? null,
    col2Options: input.col2Options ?? [],
    col3Unit: input.col3Unit ?? null,
    col3Options: input.col3Options ?? [],
    distanceKm: input.distanceKm ?? null,
    valueMode: input.valueMode ?? "manual",
  } satisfies MonthlyIndicatorConfig;
}

function classifySustainabilityBlock(text: string, current: { section: string; subsection: string | null }) {
  const normalized = normalizeHeader(text);
  if (!normalized) return current;
  if (normalized.includes("core input")) return { section: "Core Inputs", subsection: null };
  if (normalized.includes("scope 1")) return { section: "Scope 1", subsection: null };
  if (normalized.includes("scope 2")) return { section: "Scope 2", subsection: null };
  if (normalized.includes("water")) return { section: "Scope 3", subsection: "Water" };
  if (normalized.includes("waste")) return { section: "Scope 3", subsection: "Waste" };
  if (normalized.includes("property vehicle")) return { section: "Scope 1", subsection: "Property Vehicles" };
  if (normalized.includes("scope 3")) return { section: "Scope 3", subsection: null };
  return current;
}

function classifyWasteSubsection(text: string, fallback: string | null, code: string) {
  const normalized = normalizeHeader(text);
  if (normalized.includes("non hazardous") || normalized.includes("nonhazardous") || normalized.includes("not hazardous")) return "Non Hazardous waste";
  if (normalized.includes("hazard")) return "Hazard waste";
  if (fallback === "Hazard waste" || fallback === "Non Hazardous waste") return fallback;
  if (HSE_HAZARDOUS_FALLBACK_CODES.has(code)) return "Hazard waste";
  return "Waste";
}

function buildSustainabilityConfig(input: {
  label: string;
  text: string;
  unit: string | null;
  section: string;
  subsection: string | null;
  legacyKeyFromCell: string | null;
}) {
  const labelKey = normalizeHeader(input.label);
  const textKey = normalizeHeader(input.text);
  const unit = normalizeUnit(input.unit);
  const legacyKey = isLegacyMetricKey(input.legacyKeyFromCell ?? "") ? input.legacyKeyFromCell as LegacyMetricKey : null;
  if (legacyKey) {
    return hseConfig({
      id: deterministicHseId("legacy", [legacyKey]),
      section: input.section,
      subsection: input.subsection,
      label: input.label,
      legacyKey,
      col3Unit: unit,
    });
  }

  if (labelKey.includes("headcount total")) {
    return hseConfig({ id: "workers", section: "Core Inputs", subsection: null, label: "Headcount total", legacyKey: "workerCount", col3Unit: unit ?? "Workers" });
  }
  if (labelKey.includes("spills number")) {
    return hseConfig({ id: "spills-number", section: "Core Inputs", subsection: null, label: "Spills number", legacyKey: "spillsNumber", col3Unit: unit ?? "Number" });
  }
  if (labelKey.includes("production") && (unit === "Hours" || textKey.includes("st h"))) {
    return hseConfig({ id: "standard-hours", section: "Standard hours", subsection: null, label: "Standard hours", legacyKey: "standardHours", col3Unit: "Hours", valueMode: "computed" });
  }
  if (textKey.includes("electricity self consumed") || textKey.includes("electricity self produced") || textKey.includes("electricity self produced")) {
    return hseConfig({ id: "scope1-self-produced-electricity", section: "Scope 1", subsection: "Energy", label: input.label, legacyKey: "selfProducedEnergyMwh", col3Unit: unit ?? "MWh" });
  }
  if (labelKey.includes("heating") && textKey.includes("natural gas") && unit === "M3") {
    return hseConfig({ id: "scope1-heating", section: "Scope 1", subsection: "Energy", label: input.label, legacyKey: "heatingM3", col2Label: "Energy type", col2Value: "Natural gas", col3Unit: "M3" });
  }
  if (textKey.includes("electricity from the grid")) {
    return hseConfig({ id: "scope2-grid-electricity", section: "Scope 2", subsection: null, label: input.label, legacyKey: "electricityFromGridMwh", col3Unit: unit ?? "MWh" });
  }
  if ((textKey.includes("compressed air from third part") || textKey.includes("compressed air from third party")) && unit === "M3") {
    return hseConfig({ id: "scope2-third-party-compressed-air", section: "Scope 2", subsection: null, label: input.label, legacyKey: "compressedAirConsumedM3", col3Unit: "M3" });
  }
  if (labelKey.includes("civil water")) {
    return hseConfig({ id: "scope3-civil-water", section: "Scope 3", subsection: "Water", label: input.label, legacyKey: "waterConsumedNetworkM3", col3Unit: unit ?? "M3" });
  }
  if (labelKey.includes("ground water")) {
    return hseConfig({ id: "scope3-ground-water", section: "Scope 3", subsection: "Water", label: input.label, legacyKey: "waterConsumedCapturedM3", col3Unit: unit ?? "M3" });
  }

  const section = input.section;
  const subsection = input.subsection ?? (textKey.includes("water") ? "Water" : null);
  return hseConfig({
    id: deterministicHseId("generic", [section, subsection, input.label, unit]),
    section,
    subsection,
    label: input.label,
    col3Unit: unit,
  });
}

function importHseWasteRow(input: {
  state: HseImportState;
  sheetName: string;
  rowNumber: number;
  text: string;
  values: Array<number | null>;
  unit: string | null;
  treatment: string | null;
  currentSubsection: string | null;
}) {
  const code = extractEwcCode(input.text);
  if (!code) return false;

  const unit = normalizeUnit(input.unit);
  if (isDistanceOnlyUnit(unit)) {
    input.state.summary.warnings.push(createIssue(input.sheetName, input.rowNumber, "Unit", "Distance unit was ignored as waste quantity."));
    return true;
  }

  const subsection = classifyWasteSubsection(input.text, input.currentSubsection, code);
  if (subsection === "Waste") {
    input.state.summary.warnings.push(createIssue(input.sheetName, input.rowNumber, "EWC", "Waste hazardous/non-hazardous classification is ambiguous."));
  }
  if (!input.treatment) {
    input.state.summary.warnings.push(createIssue(input.sheetName, input.rowNumber, "Treatment", "Waste treatment is empty."));
  }

  const description = shortWasteDescription(input.text, code);
  const label = `${code} - ${description}`;
  const legacyKey = HSE_KNOWN_EWC_LEGACY_KEYS[code as keyof typeof HSE_KNOWN_EWC_LEGACY_KEYS] ?? null;

  if (legacyKey) {
    const converted = input.values.map((value) => (typeof value === "number" ? toTons(value, unit) : null));
    if (converted.some((value, index) => input.values[index] !== null && value === null)) {
      input.state.summary.warnings.push(createIssue(input.sheetName, input.rowNumber, "Unit", "Waste unit is not convertible to tons for the legacy indicator."));
    }
    const indicator = ensureHseIndicator(input.state, hseConfig({
      id: deterministicHseId("waste", ["legacy", code, input.treatment, unit, subsection]),
      section: "Scope 3",
      subsection,
      label,
      legacyKey,
      col2Label: "Treatment",
      col2Value: input.treatment,
      col2Options: ["Disposal", "Recovery"],
      col3Unit: unit,
      col3Options: ["Toneladas", "Kg", "Litros"],
    }));
    applyHseMonthlyValues({ state: input.state, indicator, values: converted, sheetName: input.sheetName, rowNumber: input.rowNumber });
  }

  if (!legacyKey || subsection === "Hazard waste") {
    const indicator = ensureHseIndicator(input.state, hseConfig({
      id: deterministicHseId("waste", [code, input.treatment, unit, subsection]),
      section: "Scope 3",
      subsection,
      label,
      col2Label: "Treatment",
      col2Value: input.treatment,
      col2Options: ["Disposal", "Recovery"],
      col3Unit: unit,
      col3Options: ["Toneladas", "Kg", "Litros"],
    }));
    applyHseMonthlyValues({ state: input.state, indicator, values: input.values, sheetName: input.sheetName, rowNumber: input.rowNumber });
  }

  const tons = input.values.map((value) => (typeof value === "number" ? toTons(value, unit) : null));
  if (subsection === "Hazard waste") {
    const indicator = ensureHseIndicator(input.state, hseConfig({
      id: "scope3-hazardous-waste",
      section: "Scope 3",
      subsection: "Hazard waste",
      label: "Hazard waste",
      legacyKey: "hazardousWasteTons",
      col3Unit: "Toneladas",
    }));
    applyHseAggregateLegacyValues({ state: input.state, indicator, values: tons, sheetName: input.sheetName, rowNumber: input.rowNumber });
  }
  if (input.treatment === "Recovery") {
    const indicator = ensureHseIndicator(input.state, hseConfig({
      id: "scope3-recycled-waste",
      section: "Scope 3",
      subsection: "Waste",
      label: "Recycled waste",
      legacyKey: "recycledWasteTons",
      col3Unit: "Toneladas",
    }));
    applyHseAggregateLegacyValues({ state: input.state, indicator, values: tons, sheetName: input.sheetName, rowNumber: input.rowNumber });
  }

  return true;
}

function importHseSustainabilitySheet(state: HseImportState, sheet: ExcelJS.Worksheet) {
  const monthHeader = findMonthHeader(sheet);
  if (!monthHeader) {
    state.summary.errors.push(createIssue(sheet.name, 0, "Month headers", "Required monthly headers are missing in Sustainability data entry."));
    return;
  }

  const headerRow = sheet.getRow(monthHeader.rowNumber);
  const firstMonthColumn = Math.min(...Array.from(monthHeader.monthColumns.values()));
  const labelColumn = findColumn(headerRow, ["Indicator", "Indicator name", "Description", "Description / question", "Item", "Source"]);
  const unitColumn = findColumn(headerRow, ["Unit", "Unidade"]);
  const treatmentColumn = findColumn(headerRow, ["Treatment", "Disposal / Recovery"]);
  const legacyColumn = findColumn(headerRow, ["Legacy key", "Code"]);
  const sectionColumn = findColumn(headerRow, ["Section", "Category"]);
  const subsectionColumn = findColumn(headerRow, ["Subsection", "Subcategory"]);
  const ignoredColumns = new Set([unitColumn, treatmentColumn, legacyColumn, sectionColumn, subsectionColumn].filter(Boolean));
  let currentBlock = { section: "Scope 3", subsection: null as string | null };

  for (let rowNumber = monthHeader.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const text = rowText(row, firstMonthColumn - 1);
    if (!text) continue;

    currentBlock = classifySustainabilityBlock(text, currentBlock);
    const values = parseMonthlyValues({ row, sheetName: sheet.name, monthColumns: monthHeader.monthColumns, summary: state.summary });
    if (!values) continue;

    const normalizedText = normalizeHeader(text);
    if (normalizedText === "total" || normalizedText.startsWith("total ")) {
      state.summary.warnings.push(createIssue(sheet.name, rowNumber, "Row", "Total row ignored."));
      continue;
    }

    const unit = normalizeUnit(textCell(unitColumn ? row.getCell(unitColumn).value : null)) ?? inferUnitFromRow(text);
    const treatment = normalizeTreatment(textCell(treatmentColumn ? row.getCell(treatmentColumn).value : null)) ?? inferTreatmentFromRow(text);
    if (importHseWasteRow({ state, sheetName: sheet.name, rowNumber, text, values, unit, treatment, currentSubsection: currentBlock.subsection })) {
      continue;
    }

    if (isDistanceOnlyUnit(unit)) {
      state.summary.warnings.push(createIssue(sheet.name, rowNumber, "Unit", "Distance-only row ignored as monthly quantity."));
      continue;
    }

    const label = textCell(labelColumn ? row.getCell(labelColumn).value : null) || firstTextBeforeMonths(row, firstMonthColumn, ignoredColumns);
    if (!label) {
      state.summary.warnings.push(createIssue(sheet.name, rowNumber, "Indicator", "Indicator row ignored because it has no name."));
      continue;
    }
    const section = textCell(sectionColumn ? row.getCell(sectionColumn).value : null) || currentBlock.section;
    const subsection = textCell(subsectionColumn ? row.getCell(subsectionColumn).value : null) || currentBlock.subsection;
    const legacyKeyFromCell = textCell(legacyColumn ? row.getCell(legacyColumn).value : null) || null;
    const indicator = ensureHseIndicator(state, buildSustainabilityConfig({ label, text, unit, section, subsection, legacyKeyFromCell }));
    applyHseMonthlyValues({ state, indicator, values, sheetName: sheet.name, rowNumber });
  }
}

function findStandardHoursColumns(sheet: ExcelJS.Worksheet) {
  const volumeColumns = new Map<number, number>();
  const standardColumns = new Map<number, number>();

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.eachCell((cell, columnNumber) => {
      const text = normalizeHeader(cell.value);
      const monthIndex = monthIndexFromHeader(cell.value);
      if (monthIndex !== null) {
        if (text.includes("volume")) volumeColumns.set(monthIndex, columnNumber);
        if (text.includes("standard") || text.includes("st h")) standardColumns.set(monthIndex, columnNumber);

        const below = normalizeHeader(sheet.getRow(rowNumber + 1).getCell(columnNumber).value);
        if (below.includes("volume")) volumeColumns.set(monthIndex, columnNumber);
        if (below.includes("standard") || below.includes("st h")) standardColumns.set(monthIndex, columnNumber);

        const nextBelow = normalizeHeader(sheet.getRow(rowNumber + 1).getCell(columnNumber + 1).value);
        if (nextBelow.includes("volume")) volumeColumns.set(monthIndex, columnNumber + 1);
        if (nextBelow.includes("standard") || nextBelow.includes("st h")) standardColumns.set(monthIndex, columnNumber + 1);
      }
    });
  }

  return { volumeColumns, standardColumns };
}

function importHseStandardHoursSheet(state: HseImportState, sheet: ExcelJS.Worksheet) {
  const { volumeColumns, standardColumns } = findStandardHoursColumns(sheet);
  if (volumeColumns.size === 0 && standardColumns.size === 0) {
    state.summary.warnings.push(createIssue(sheet.name, 0, "Month headers", "Standard hours sheet ignored because monthly volume/standard-hours columns were not found."));
    return;
  }

  const volumes = emptyMonths();
  const standardHours = emptyMonths();
  const totalStandardHours = emptyMonths();
  const totalVolumes = emptyMonths();

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const text = normalizeHeader(rowText(row, Math.max(1, Math.min(...[...volumeColumns.values(), ...standardColumns.values()].filter(Boolean)) - 1)));
    const isTotal = text.includes("total");

    volumeColumns.forEach((column, monthIndex) => {
      const value = toNumberOrNull(row.getCell(column).value);
      if (Number.isNaN(value)) return;
      if (typeof value === "number") {
        if (isTotal) totalVolumes[monthIndex] = value;
        else volumes[monthIndex] = (volumes[monthIndex] ?? 0) + value;
      }
    });

    standardColumns.forEach((column, monthIndex) => {
      const value = toNumberOrNull(row.getCell(column).value);
      if (Number.isNaN(value)) return;
      if (typeof value === "number") {
        if (isTotal) totalStandardHours[monthIndex] = value;
        else standardHours[monthIndex] = (standardHours[monthIndex] ?? 0) + value;
      }
    });
  }

  const finalVolumes = volumes.map((value, index) => totalVolumes[index] ?? value);
  const finalStandardHours = standardHours.map((value, index) => totalStandardHours[index] ?? value);
  const totalMinCar = finalStandardHours.map((value, index) => {
    const volume = finalVolumes[index];
    if (typeof value !== "number" || typeof volume !== "number" || volume <= 0) return null;
    return Number(((value * 60) / volume).toFixed(6));
  });

  const volumeIndicator = ensureHseIndicator(state, hseConfig({ id: "volumes", section: "Standard hours", subsection: null, label: "Volumes", col3Unit: "Units" }));
  const totalMinCarIndicator = ensureHseIndicator(state, hseConfig({ id: "total-min-car", section: "Standard hours", subsection: null, label: "Total min/car", col3Unit: "min/car" }));
  const standardHoursIndicator = ensureHseIndicator(state, hseConfig({ id: "standard-hours", section: "Standard hours", subsection: null, label: "Standard hours", legacyKey: "standardHours", col3Unit: "Hours", valueMode: "computed" }));

  applyHseMonthlyValues({ state, indicator: volumeIndicator, values: finalVolumes, sheetName: sheet.name, rowNumber: 0 });
  applyHseMonthlyValues({ state, indicator: totalMinCarIndicator, values: totalMinCar, sheetName: sheet.name, rowNumber: 0 });
  applyHseMonthlyValues({ state, indicator: standardHoursIndicator, values: finalStandardHours, sheetName: sheet.name, rowNumber: 0 });
}

function importHseLogMatSoldSheet(state: HseImportState, sheet: ExcelJS.Worksheet) {
  let currentBlock: "inbound" | "outbound" | "materials" | "sold" | null = null;
  let headerRowNumber = 0;
  let monthColumns: MonthColumns | null = null;

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const text = rowText(row);
    const normalized = normalizeHeader(text);
    if (!normalized) continue;

    if (normalized.includes("inbound logistic")) {
      currentBlock = "inbound";
      headerRowNumber = 0;
      monthColumns = null;
      continue;
    }
    if (normalized.includes("outbound logistic")) {
      currentBlock = "outbound";
      headerRowNumber = 0;
      monthColumns = null;
      continue;
    }
    if (normalized.includes("sold product")) {
      currentBlock = "sold";
      headerRowNumber = 0;
      monthColumns = null;
      continue;
    }
    if (normalized === "materials" || normalized.includes(" materials ")) {
      currentBlock = "materials";
      headerRowNumber = 0;
      monthColumns = null;
      continue;
    }

    const candidateMonthColumns = getMonthColumnsFromRow(row);
    if (currentBlock && candidateMonthColumns.size >= 2) {
      headerRowNumber = rowNumber;
      monthColumns = candidateMonthColumns;
      continue;
    }
    if (!currentBlock || !monthColumns || !headerRowNumber) continue;

    const values = parseMonthlyValues({ row, sheetName: sheet.name, monthColumns, summary: state.summary });
    if (!values) continue;

    const header = sheet.getRow(headerRowNumber);
    const firstMonthColumn = Math.min(...Array.from(monthColumns.values()));
    const labelColumn = findColumn(header, currentBlock === "materials" || currentBlock === "sold"
      ? ["Material", "Product", "Name", "Description", "Item"]
      : ["Supplier", "Customer", "Destination", "Entity", "Name", "Description"]);
    const unitColumn = findColumn(header, ["Unit", "Unidade"]);
    const transportColumn = findColumn(header, ["Transport type", "Transport", "Transport mode", "Mode"]);
    const distanceColumn = findColumn(header, ["Distance KM", "Distance", "Km"]);
    const subsectionColumn = findColumn(header, ["Subsection", "Classification", "Direct / Indirect", "Direct indirect"]);
    const ignored = new Set([unitColumn, transportColumn, distanceColumn, subsectionColumn].filter(Boolean));
    const label = textCell(labelColumn ? row.getCell(labelColumn).value : null) || firstTextBeforeMonths(row, firstMonthColumn, ignored);
    if (!label) {
      state.summary.warnings.push(createIssue(sheet.name, rowNumber, "Name", "Supplier/material row ignored because it has no name."));
      continue;
    }

    const unit = normalizeUnit(textCell(unitColumn ? row.getCell(unitColumn).value : null)) ?? inferUnitFromRow(text);
    const transport = textCell(transportColumn ? row.getCell(transportColumn).value : null) || null;
    const distance = textCell(distanceColumn ? row.getCell(distanceColumn).value : null) || null;
    const subsection = textCell(subsectionColumn ? row.getCell(subsectionColumn).value : null) || (currentBlock === "sold" ? "Sold products" : null);

    const section = currentBlock === "inbound" ? "Inbounds" : currentBlock === "outbound" ? "Outbounds" : "Materials";
    const idPrefix = currentBlock === "inbound" ? "inbound" : currentBlock === "outbound" ? "outbound" : "material";
    const indicator = ensureHseIndicator(state, hseConfig({
      id: deterministicHseId(idPrefix, [section, subsection, label, transport, unit, distance]),
      section,
      subsection,
      label,
      col2Label: section === "Materials" ? null : "Transport type",
      col2Value: section === "Materials" ? null : transport,
      col3Unit: unit,
      distanceKm: distance,
    }));
    applyHseMonthlyValues({ state, indicator, values, sheetName: sheet.name, rowNumber });
  }
}

function setHseWorkbookVisibilityWarnings(state: HseImportState, workbook: ExcelJS.Workbook) {
  for (const sheet of getVisibleWorksheets(workbook)) {
    const normalized = normalizeSheetName(sheet.name);
    if (["sustainability data entry", "standard hours", "log mat sold", "metadata", "instructions"].includes(normalized)) continue;
    if (normalized === "env data output") {
      state.summary.warnings.push(createIssue(sheet.name, 0, "Sheet", "Env data output ignored because it is a calculated output sheet."));
    } else {
      state.summary.warnings.push(createIssue(sheet.name, 0, "Sheet", "Visible worksheet ignored because it is not a supported HSE input sheet."));
    }
  }
}

async function importHseWorkbook(plantId: string, workbook: ExcelJS.Workbook) {
  const year = parseHseYear(workbook);
  const summary: MonthlyInputsImportSummary = {
    year: year ?? new Date().getUTCFullYear(),
    indicatorsCreated: 0,
    indicatorsUpdated: 0,
    monthlyValuesCreated: 0,
    monthlyValuesUpdated: 0,
    rowsIgnored: 0,
    errors: [],
    warnings: [],
  };

  if (!year) {
    summary.errors.push(createIssue("Workbook", 0, "Year", "A valid year between 2000 and 2100 is required in the HSE workbook title, top cells, or Metadata!B2."));
    return summary;
  }

  const existing = await loadMonthlyInputState(plantId, year);
  const cloned = cloneMonthlyState(existing);
  const state: HseImportState = {
    plantId,
    year,
    summary,
    ...cloned,
  };

  setHseWorkbookVisibilityWarnings(state, workbook);

  const sustainability = findVisibleWorksheet(workbook, "Sustainability data entry");
  if (!sustainability) {
    summary.errors.push(createIssue("Workbook", 0, "Sheet", "Visible Sustainability data entry sheet is required for HSE-compatible import."));
    return summary;
  }
  importHseSustainabilitySheet(state, sustainability);

  const standardHours = findVisibleWorksheet(workbook, "Standard hours");
  if (standardHours) importHseStandardHoursSheet(state, standardHours);

  const logMatSold = findVisibleWorksheet(workbook, "Log-Mat-Sold");
  if (logMatSold) importHseLogMatSoldSheet(state, logMatSold);

  if (summary.errors.length > 0) return summary;

  await persistMonthlyInputState({
    plantId,
    year,
    months: state.months,
    indicatorConfig: state.indicatorConfig,
    customRows: state.customRows,
  });

  logger.info(
    {
      plantId,
      year,
      indicatorsCreated: summary.indicatorsCreated,
      indicatorsUpdated: summary.indicatorsUpdated,
      monthlyValuesCreated: summary.monthlyValuesCreated,
      monthlyValuesUpdated: summary.monthlyValuesUpdated,
      warnings: summary.warnings.length,
    },
    "monthly_inputs_hse_excel_imported",
  );

  return summary;
}

function styleHseHeader(row: ExcelJS.Row, color = "FF0F766E") {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function addHseSheetTitle(sheet: ExcelJS.Worksheet, title: string, year: number, columnCount: number) {
  sheet.getRow(1).values = [title];
  sheet.mergeCells(1, 1, 1, columnCount);
  styleHseHeader(sheet.getRow(1), "FF002663");
  sheet.getRow(2).values = [`Year: ${year}`];
  sheet.mergeCells(2, 1, 2, columnCount);
}

function addHseBlockRow(sheet: ExcelJS.Worksheet, label: string, columnCount: number) {
  const row = sheet.addRow(Array.from({ length: columnCount }, (_, index) => (index === 9 ? label : "")));
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
}

function buildHseCompatibleTemplate(input: {
  plantCode: string;
  plantName: string;
  year: number;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MA HSE";
  workbook.created = new Date();

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const metadata = workbook.addWorksheet("Metadata");
  metadata.columns = [{ width: 28 }, { width: 48 }];
  metadata.addRows([
    ["Field", "Value"],
    ["Year", input.year],
    ["Plant code", input.plantCode],
    ["Plant name", input.plantName],
    ["Format", "HSE-compatible monthly inputs"],
  ]);
  styleHseHeader(metadata.getRow(1), "FF002663");

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 120 }];
  instructions.addRows([
    ["Fill visible input sheets only: Sustainability data entry, Standard hours, and Log-Mat-Sold."],
    ["Technical columns are hidden for stable import matching. New suppliers, customers, materials, and EWC codes can be added as rows."],
    ["Leave unknown monthly values empty. Negative values are not accepted."],
  ]);

  const sustainabilityColumns = [
    "Internal ID",
    "Legacy key",
    "Section",
    "Subsection",
    "Value mode",
    "Unit",
    "Treatment",
    "Transport type",
    "Distance KM",
    "Indicator",
    "Description",
    "Unit",
    "Treatment",
    "Parameter",
    "Distance KM",
    ...monthLabels,
  ];
  const sustainability = workbook.addWorksheet("Sustainability data entry");
  sustainability.columns = sustainabilityColumns.map((header, index) => ({
    header,
    key: `c${index + 1}`,
    width: index < 9 ? 14 : Math.max(12, Math.min(28, header.length + 4)),
    hidden: index < 9,
  }));
  addHseSheetTitle(sustainability, `MAAP - Sustainability Data Input ${input.year}`, input.year, sustainabilityColumns.length);
  sustainability.getRow(HEADER_ROW).values = sustainabilityColumns;
  styleHseHeader(sustainability.getRow(HEADER_ROW));

  const addSustainabilityRow = (entry: {
    block?: string;
    id?: string;
    legacyKey?: LegacyMetricKey | "";
    section?: string;
    subsection?: string;
    label?: string;
    description?: string;
    unit?: string;
    treatment?: string;
    parameter?: string;
  }) => {
    if (entry.block) {
      addHseBlockRow(sustainability, entry.block, sustainabilityColumns.length);
      return;
    }
    sustainability.addRow([
      entry.id ?? "",
      entry.legacyKey ?? "",
      entry.section ?? "",
      entry.subsection ?? "",
      "manual",
      entry.unit ?? "",
      entry.treatment ?? "",
      "",
      "",
      entry.label ?? "",
      entry.description ?? entry.label ?? "",
      entry.unit ?? "",
      entry.treatment ?? "",
      entry.parameter ?? "",
      "",
      ...emptyMonths(),
    ]);
  };

  addSustainabilityRow({ block: "Core Inputs" });
  addSustainabilityRow({ id: "workers", legacyKey: "workerCount", section: "Core Inputs", label: "Headcount total", unit: "Workers" });
  addSustainabilityRow({ id: "spills-number", legacyKey: "spillsNumber", section: "Core Inputs", label: "Spills number", unit: "Number" });
  addSustainabilityRow({ block: "Scope 1" });
  addSustainabilityRow({ id: "scope1-self-produced-electricity", legacyKey: "selfProducedEnergyMwh", section: "Scope 1", subsection: "Energy", label: "Electricity self-produced", unit: "MWh" });
  addSustainabilityRow({ id: "scope1-heating", legacyKey: "heatingM3", section: "Scope 1", subsection: "Energy", label: "Heating", description: "Heating - Natural gas", unit: "M3", parameter: "Natural gas" });
  addSustainabilityRow({ block: "Scope 2" });
  addSustainabilityRow({ id: "scope2-grid-electricity", legacyKey: "electricityFromGridMwh", section: "Scope 2", label: "Electricity from the grid", unit: "MWh" });
  addSustainabilityRow({ id: "scope2-third-party-compressed-air", legacyKey: "compressedAirConsumedM3", section: "Scope 2", label: "Compressed air from third-party", unit: "M3" });
  addSustainabilityRow({ block: "Scope 3 - Water" });
  addSustainabilityRow({ id: "scope3-civil-water", legacyKey: "waterConsumedNetworkM3", section: "Scope 3", subsection: "Water", label: "Civil water", unit: "M3" });
  addSustainabilityRow({ id: "scope3-ground-water", legacyKey: "waterConsumedCapturedM3", section: "Scope 3", subsection: "Water", label: "Ground water", unit: "M3" });
  addSustainabilityRow({ section: "Scope 3", subsection: "Water", label: "Surface water", unit: "M3" });
  addSustainabilityRow({ block: "Scope 3 - Waste" });
  addSustainabilityRow({ section: "Scope 3", subsection: "Non Hazardous waste", label: "EWC 000000 - Waste description", unit: "Toneladas", treatment: "Recovery" });
  addSustainabilityRow({ section: "Scope 3", subsection: "Hazard waste", label: "EWC 000000 - Hazardous waste description", unit: "Kg", treatment: "Disposal" });
  addSustainabilityRow({ block: "Property Vehicles" });
  addSustainabilityRow({ section: "Scope 1", subsection: "Property Vehicles", label: "Property vehicle", unit: "Km" });
  sustainability.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 9 }];

  const standardColumns = ["Model", ...monthLabels.flatMap((month) => [`${month} Volumes`, `${month} Standard Hours`])];
  const standard = workbook.addWorksheet("Standard hours");
  standard.columns = standardColumns.map((header, index) => ({ header, key: `c${index + 1}`, width: index === 0 ? 24 : 16 }));
  addHseSheetTitle(standard, `Standard hours ${input.year}`, input.year, standardColumns.length);
  standard.getRow(HEADER_ROW).values = standardColumns;
  styleHseHeader(standard.getRow(HEADER_ROW));
  standard.addRow(["TOTAL", ...Array.from({ length: 24 }, () => null)]);
  standard.addRow(["Model / product", ...Array.from({ length: 24 }, () => null)]);
  standard.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 1 }];

  const logColumns = [
    "Internal ID",
    "Legacy key",
    "Section",
    "Subsection",
    "Value mode",
    "Unit",
    "Treatment",
    "Transport type",
    "Distance KM",
    "Name",
    "Unit",
    "Transport type",
    "Distance KM",
    "Classification",
    ...monthLabels,
  ];
  const log = workbook.addWorksheet("Log-Mat-Sold");
  log.columns = logColumns.map((header, index) => ({
    header,
    key: `c${index + 1}`,
    width: index < 9 ? 14 : Math.max(12, Math.min(28, header.length + 4)),
    hidden: index < 9,
  }));
  addHseSheetTitle(log, `Log-Mat-Sold ${input.year}`, input.year, logColumns.length);

  const addLogHeader = (label: string) => {
    addHseBlockRow(log, label, logColumns.length);
    log.addRow(logColumns);
    styleHseHeader(log.getRow(log.rowCount));
  };
  const addLogBlank = (section: string, subsection = "") => {
    log.addRow(["", "", section, subsection, "manual", "", "", "", "", "", "", "", "", subsection, ...emptyMonths()]);
  };
  addLogHeader("INBOUND LOGISTIC");
  addLogBlank("Inbounds");
  addLogHeader("OUTBOUND LOGISTIC");
  addLogBlank("Outbounds");
  addLogHeader("MATERIALS");
  addLogBlank("Materials", "Direct");
  addLogHeader("SOLD PRODUCTS");
  addLogBlank("Materials", "Sold products");
  log.views = [{ state: "frozen", ySplit: 3, xSplit: 9 }];

  return workbook;
}

export const MonthlyInputExcelService = {
  maxImportBytes: MAX_IMPORT_BYTES,

  async buildExport(input: {
    plantId: string;
    plantCode: string;
    plantName: string;
    year: number;
    category?: string | null;
    templateOnly?: boolean;
  }) {
    if (input.templateOnly) {
      const workbook = buildHseCompatibleTemplate({
        plantCode: input.plantCode,
        plantName: input.plantName,
        year: input.year,
      });
      const buffer = await workbook.xlsx.writeBuffer();
      logger.info(
        {
          plantId: input.plantId,
          plantCode: input.plantCode,
          year: input.year,
          category: input.category ?? null,
        },
        "monthly_inputs_hse_excel_template_exported",
      );
      return Buffer.from(buffer as ArrayBuffer);
    }

    const state = await loadMonthlyInputState(input.plantId, input.year);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MA HSE";
    workbook.created = new Date();

    const metadata = workbook.addWorksheet("Metadata");
    metadata.columns = [{ width: 28 }, { width: 48 }];
    metadata.addRows([
      ["Field", "Value"],
      ["Year", input.year],
      ["Plant code", input.plantCode],
      ["Plant name", input.plantName],
      ["Instructions", "Edit existing rows or add new rows. Import matches by Internal ID, then Code, then Category + Indicator name."],
      ["Formula note", "Standard hours uses Excel formulas. Other imported formulas are stored as text and calculated by backend only when supported."],
    ]);
    metadata.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    metadata.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    metadata.views = [{ state: "frozen", ySplit: 1 }];

    const sections = Array.from(
      new Set([
        ...getMonthlyInputSectionOrder(),
        ...state.indicatorConfig.map((indicator) => indicator.section),
      ]),
    ).filter((section) => !input.category || normalizeKey(section) === normalizeKey(input.category));
    const usedSheetNames = new Set<string>();

    for (const section of sections) {
      const indicators = state.indicatorConfig.filter((indicator) => indicator.section === section);
      const sheet = workbook.addWorksheet(safeSheetName(section, usedSheetNames));
      const columns = [...BASE_COLUMNS, ...MONTHS.map((month) => month.label)];
      sheet.columns = columns.map((header, index) => ({
        header,
        key: `c${index + 1}`,
        width: index < BASE_COLUMNS.length ? Math.max(14, Math.min(32, header.length + 4)) : 14,
      }));
      sheet.getRow(1).values = [`${section} - Monthly Inputs ${input.year}`];
      sheet.mergeCells(1, 1, 1, columns.length);
      sheet.getRow(1).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
      sheet.getRow(2).values = [`Year: ${input.year}`];
      sheet.mergeCells(2, 1, 2, columns.length);
      sheet.getRow(HEADER_ROW).values = columns;
      sheet.getRow(HEADER_ROW).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(HEADER_ROW).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

      const standardHours = computeStandardHours(state.indicatorConfig, state.customRows);
      const dataStartRow = FIRST_DATA_ROW;
      const rowById = new Map<string, number>();
      indicators.forEach((indicator, index) => rowById.set(indicator.id, dataStartRow + index));

      indicators.forEach((indicator, index) => {
        const rowNumber = dataStartRow + index;
        const row = sheet.getRow(rowNumber);
        const values = getRowValues({
          months: state.months,
          customRows: state.customRows,
          standardHours,
          indicator,
        });
        row.values = [
          indicator.id,
          indicator.legacyKey ?? "",
          indicator.section,
          indicator.subsection ?? "",
          indicator.label,
          indicator.label,
          indicator.col3Unit ?? "",
          indicator.valueMode,
          indicator.valueMode === "computed" ? indicator.col2Value ?? "" : "",
          indicator.col2Label ?? "",
          indicator.col2Value ?? "",
          indicator.col2Options.join("; "),
          indicator.col3Options.join("; "),
          indicator.distanceKm ?? "",
          indicator.enabled ? "Yes" : "No",
          "",
          ...values,
        ];

        MONTHS.forEach((_month, monthIndex) => {
          const cell = row.getCell(MONTH_START_COLUMN + monthIndex);
          const formula = buildExcelFormulaForMonthlyCell(indicator, rowNumber, monthIndex, rowById);
          if (formula) {
            cell.value = { formula, result: values[monthIndex] ?? undefined };
          }
          if (indicator.valueMode === "computed") {
            cell.protection = { locked: true };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
          }
        });
      });

      sheet.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: BASE_COLUMNS.length }];
      sheet.autoFilter = {
        from: { row: HEADER_ROW, column: 1 },
        to: { row: Math.max(HEADER_ROW, FIRST_DATA_ROW + indicators.length - 1), column: columns.length },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    logger.info(
      {
        plantId: input.plantId,
        plantCode: input.plantCode,
        year: input.year,
        category: input.category ?? null,
      },
      "monthly_inputs_excel_exported",
    );
    return Buffer.from(buffer as ArrayBuffer);
  },

  async importFromExcel(plantId: string, fileBuffer: Uint8Array) {
    if (fileBuffer.byteLength > MAX_IMPORT_BYTES) {
      return {
        year: new Date().getUTCFullYear(),
        indicatorsCreated: 0,
        indicatorsUpdated: 0,
        monthlyValuesCreated: 0,
        monthlyValuesUpdated: 0,
        rowsIgnored: 0,
        errors: [createIssue("Workbook", 0, "File", "Excel file is too large.")],
        warnings: [],
      } satisfies MonthlyInputsImportSummary;
    }

    const workbook = new ExcelJS.Workbook();
    await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(fileBuffer);
    const format = detectWorkbookFormat(workbook);
    if (format === "hse") {
      return importHseWorkbook(plantId, workbook);
    }
    if (format === "unknown") {
      return {
        year: new Date().getUTCFullYear(),
        indicatorsCreated: 0,
        indicatorsUpdated: 0,
        monthlyValuesCreated: 0,
        monthlyValuesUpdated: 0,
        rowsIgnored: 0,
        errors: [createIssue("Workbook", 0, "Format", "Workbook format was not recognized. Expected legacy Metadata sheet or visible Sustainability data entry sheet.")],
        warnings: [],
      } satisfies MonthlyInputsImportSummary;
    }

    const year = parseYear(workbook);
    const summary: MonthlyInputsImportSummary = {
      year: year ?? new Date().getUTCFullYear(),
      indicatorsCreated: 0,
      indicatorsUpdated: 0,
      monthlyValuesCreated: 0,
      monthlyValuesUpdated: 0,
      rowsIgnored: 0,
      errors: [],
      warnings: [],
    };

    if (!year) {
      summary.errors.push(createIssue("Metadata", 2, "Year", "A valid year between 2000 and 2100 is required in Metadata!B2."));
      return summary;
    }

    const existing = await loadMonthlyInputState(plantId, year);
    const existingMonths = existing.months.map((month) => ({ ...month }));
    const existingCustomRows = existing.customRows.map((row) => ({ ...row, months: [...row.months] }));
    const indicatorConfig = existing.indicatorConfig.map((indicator) => ({ ...indicator, col2Options: [...indicator.col2Options], col3Options: [...indicator.col3Options] }));
    const customRows = existing.customRows.map((row) => ({ ...row, col2Options: [...row.col2Options], col3Options: [...row.col3Options], months: [...row.months] }));
    const byId = new Map(indicatorConfig.map((indicator) => [indicator.id, indicator]));
    const byCode = new Map(indicatorConfig.flatMap((indicator) => (indicator.legacyKey ? [[normalizeKey(indicator.legacyKey), indicator] as const] : [])));
    const bySectionLabel = new Map(indicatorConfig.map((indicator) => [indicatorMatchKey(indicator), indicator]));
    const seenExcelKeys = new Set<string>();
    const recognizedSections = new Set(getMonthlyInputSectionOrder().map(normalizeKey));
    indicatorConfig.forEach((indicator) => recognizedSections.add(normalizeKey(indicator.section)));

    for (const sheet of workbook.worksheets) {
      if (sheet.name === "Metadata") continue;
      const sectionKey = normalizeKey(sheet.name);
      if (!recognizedSections.has(sectionKey)) {
        summary.warnings.push(createIssue(sheet.name, 0, "Sheet", "Worksheet was ignored because it is not a known monthly input category."));
        continue;
      }

      const headerMap = buildHeaderMap(sheet);
      const missingMonth = MONTHS.find((month) => !getColumn(headerMap, month.label));
      if (!getColumn(headerMap, "Indicator name") || missingMonth) {
        summary.errors.push(createIssue(sheet.name, HEADER_ROW, missingMonth?.label ?? "Indicator name", "Required header is missing."));
        continue;
      }

      for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (looksBlankRow(row, headerMap)) {
          summary.rowsIgnored += 1;
          continue;
        }

        const parsed = parseImportedIndicator({
          row,
          sheetName: sheet.name,
          sectionFromSheet: sheet.name,
          headerMap,
          errors: summary.errors,
          warnings: summary.warnings,
        });
        if (!parsed) continue;

        const excelKey = parsed.id
          ? `id:${parsed.id}`
          : parsed.code
            ? `code:${normalizeKey(parsed.code)}`
            : `name:${indicatorMatchKey(parsed.config)}`;
        if (seenExcelKeys.has(excelKey)) {
          summary.errors.push(createIssue(sheet.name, rowNumber, "Indicator name", "Duplicate indicator in Excel file."));
          continue;
        }
        seenExcelKeys.add(excelKey);

        let indicator = parsed.id ? byId.get(parsed.id) : undefined;
        indicator ??= parsed.code ? byCode.get(normalizeKey(parsed.code)) : undefined;
        indicator ??= bySectionLabel.get(indicatorMatchKey(parsed.config));

        let isNew = false;
        if (!indicator) {
          isNew = true;
          const id = parsed.id || `custom-${normalizeKey(parsed.config.section).replaceAll(" ", "-")}-${randomUUID()}`;
          indicator = {
            ...parsed.config,
            id,
            legacyKey: null,
            valueMode: "manual",
          };
          indicatorConfig.push(indicator);
          byId.set(indicator.id, indicator);
          bySectionLabel.set(indicatorMatchKey(indicator), indicator);
          const customRow = createCustomRowFromIndicator(indicator);
          customRows.push(customRow);
          summary.indicatorsCreated += 1;
        } else {
          const before = JSON.stringify(indicator);
          const merged = {
            ...parsed.config,
            id: indicator.id,
            legacyKey: indicator.legacyKey,
            valueMode: indicator.valueMode,
          };
          applyImportedIndicatorMeta(indicator, merged);
          syncCustomRowMeta(customRows, indicator);
          if (JSON.stringify(indicator) !== before) summary.indicatorsUpdated += 1;
        }

        const activeIndicator = indicator;
        if (!activeIndicator) continue;

        const existingValueCount = countExistingMonthlyValues({
          indicator: activeIndicator,
          existingMonths,
          existingCustomRows,
        });
        let importedValueCount = 0;

        MONTHS.forEach((month, monthIndex) => {
          const rawValue = getCell(row, headerMap, month.label);
          const parsedValue = toNumberOrNull(rawValue);
          if (Number.isNaN(parsedValue)) {
            summary.errors.push(createIssue(sheet.name, rowNumber, month.label, "Monthly value must be numeric and non-negative."));
            return;
          }
          if (parsedValue === null) return;
          if (isIntegerLegacyKey(activeIndicator.legacyKey) && !Number.isInteger(parsedValue)) {
            summary.errors.push(createIssue(sheet.name, rowNumber, month.label, "This indicator requires an integer value."));
            return;
          }
          if (updateMonthlyValue({ months: existingMonths, customRows, indicator: activeIndicator, monthIndex, value: parsedValue })) {
            importedValueCount += 1;
          }
        });

        if (isNew) {
          summary.monthlyValuesCreated += importedValueCount;
        } else if (existingValueCount > 0) {
          summary.monthlyValuesUpdated += importedValueCount;
        } else {
          summary.monthlyValuesCreated += importedValueCount;
        }
      }
    }

    if (summary.errors.length > 0) return summary;

    const standardHours = computeStandardHours(indicatorConfig, customRows);
    const standardHoursIndicator = indicatorConfig.find((indicator) => indicator.id === "standard-hours");
    if (standardHoursIndicator?.legacyKey === "standardHours") {
      standardHours.forEach((value, index) => {
        existingMonths[index] = {
          ...existingMonths[index]!,
          standardHours: value,
        };
      });
    }

    await persistMonthlyInputState({
      plantId,
      year,
      months: existingMonths,
      indicatorConfig,
      customRows,
    });

    logger.info(
      {
        plantId,
        year,
        indicatorsCreated: summary.indicatorsCreated,
        indicatorsUpdated: summary.indicatorsUpdated,
        monthlyValuesCreated: summary.monthlyValuesCreated,
        monthlyValuesUpdated: summary.monthlyValuesUpdated,
        rowsIgnored: summary.rowsIgnored,
        warnings: summary.warnings.length,
      },
      "monthly_inputs_excel_imported",
    );

    return summary;
  },
};

export { monthlyCustomRowsKey };
