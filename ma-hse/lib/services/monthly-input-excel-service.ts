import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  createCustomRowFromIndicator,
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
        const values = input.templateOnly ? emptyMonths() : getRowValues({
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
