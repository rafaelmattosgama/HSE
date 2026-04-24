import type { MonthlyInputRow } from "@/lib/services/monthly-inputs";

type LegacyMetricKey = keyof Omit<MonthlyInputRow, "month">;
type ValueMode = "manual" | "computed";

export type MonthlyIndicatorConfig = {
  id: string;
  section: string;
  subsection: string | null;
  label: string;
  legacyKey: LegacyMetricKey | null;
  enabled: boolean;
  col2Label: string | null;
  col2Value: string | null;
  col2Options: string[];
  col3Unit: string | null;
  col3Options: string[];
  distanceKm: string | null;
  valueMode: ValueMode;
};

export type CustomMonthlyRow = {
  id: string;
  section: string;
  subsection: string | null;
  label: string;
  enabled: boolean;
  col2Label: string | null;
  col2Value: string | null;
  col2Options: string[];
  col3Unit: string | null;
  col3Options: string[];
  distanceKm: string | null;
  valueMode: ValueMode;
  months: Array<number | null>;
};

const ENERGY_SELF_PRODUCED_TYPES = ["Solar", "Eolic", "Geothermal", "Biomass"];
const HEATING_TYPES = ["Natural gas", "LNG", "LPG", "Biomass"];
const ENERGY_UNITS = ["MWh", "GJ", "KWh"];
const HEATING_UNITS = ["M3", "MWh", "GJ", "KG", "L", "t"];
const WATER_UNITS = ["M3", "L"];
const COMPRESSED_AIR_UNITS = ["MWh", "GJ", "KWh", "M3"];
const VEHICLE_TYPES = ["Carro", "Veiculo comercial ligeiro", "Mobile Crane", "Drive", "Forklift"];
const VEHICLE_ENERGY_TYPES = ["Electric", "Gasoline", "LNG", "Diesel", "Propane/Butane", "Ethanol"];
const DISPOSAL_TYPES = ["Disposal", "Recovery"];
const WASTE_UNITS = ["Litros", "Toneladas", "Kg"];

const NON_HAZARDOUS_LER_CODES = [
  "150101 - Paper and cardboard packaging",
  "150102 - Plastic packaging",
  "150103 - Wood packaging",
  "160117 - Ferrous metals",
  "160118 - Non-ferrous metals",
  "170117 - Construction waste",
  "200111 - Textiles",
  "200136 - Electrical and electronic equipment",
  "200139 - Plastics",
  "200301 - Mixed municipal waste",
];

const HAZARDOUS_LER_CODES = [
  "130205 - Mineral-based non-chlorinated engine oils",
  "150110 - Packaging containing residues of hazardous substances",
  "160107 - Oil filters",
  "160113 - Brake fluids",
  "160601 - Lead batteries",
  "200121 - Fluorescent tubes and other mercury-containing waste",
];

function emptyMonths() {
  return Array.from({ length: 12 }, () => null);
}

function indicator(input: MonthlyIndicatorConfig): MonthlyIndicatorConfig {
  return input;
}

export function getDefaultMonthlyIndicatorConfig(): MonthlyIndicatorConfig[] {
  return [
    indicator({
      id: "workers",
      section: "Core Inputs",
      subsection: null,
      label: "Workers",
      legacyKey: "workerCount",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "Workers",
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "worked-hours",
      section: "Core Inputs",
      subsection: null,
      label: "Worked hours",
      legacyKey: "hoursWorked",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "Hours",
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "total-min-car",
      section: "Core Inputs",
      subsection: null,
      label: "Total min/car",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "min/car",
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "volumes",
      section: "Core Inputs",
      subsection: null,
      label: "Volumes",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "Units",
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "standard-hours",
      section: "Core Inputs",
      subsection: null,
      label: "Standard hours",
      legacyKey: "standardHours",
      enabled: true,
      col2Label: "Formula",
      col2Value: "(Total min/car x volumes) / 60",
      col2Options: [],
      col3Unit: "Hours",
      col3Options: [],
      distanceKm: null,
      valueMode: "computed",
    }),
    indicator({
      id: "scope1-self-produced-electricity",
      section: "Scope 1",
      subsection: "Energy",
      label: "Electricity self produced",
      legacyKey: "selfProducedEnergyMwh",
      enabled: true,
      col2Label: "Energy type",
      col2Value: "Solar",
      col2Options: ENERGY_SELF_PRODUCED_TYPES,
      col3Unit: "MWh",
      col3Options: ENERGY_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope1-heating",
      section: "Scope 1",
      subsection: "Energy",
      label: "Heating",
      legacyKey: "heatingM3",
      enabled: true,
      col2Label: "Energy type",
      col2Value: "Natural gas",
      col2Options: HEATING_TYPES,
      col3Unit: "M3",
      col3Options: HEATING_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope1-emissions-ac",
      section: "Scope 1",
      subsection: "Emissions",
      label: "Gas Leak Air Conditioning Systems",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "Kg",
      col3Options: ["Kg"],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope1-property-vehicles",
      section: "Scope 1",
      subsection: "Property Vehicles",
      label: "Property vehicle",
      legacyKey: null,
      enabled: true,
      col2Label: "Vehicle type",
      col2Value: "Carro",
      col2Options: VEHICLE_TYPES,
      col3Unit: "Electric",
      col3Options: VEHICLE_ENERGY_TYPES,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope2-grid-electricity",
      section: "Scope 2",
      subsection: null,
      label: "Electricity from the grid",
      legacyKey: "electricityFromGridMwh",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "MWh",
      col3Options: ENERGY_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope2-third-party-electricity",
      section: "Scope 2",
      subsection: null,
      label: "Electricity from the third-part",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "MWh",
      col3Options: ENERGY_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope2-third-party-heating",
      section: "Scope 2",
      subsection: null,
      label: "Heating from the third-part",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "MWh",
      col3Options: [...ENERGY_UNITS, "KG", "L", "t"],
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope2-third-party-compressed-air",
      section: "Scope 2",
      subsection: null,
      label: "Compressed air from the third-part",
      legacyKey: "compressedAirConsumedM3",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: COMPRESSED_AIR_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-civil-water",
      section: "Scope 3",
      subsection: "Water",
      label: "Civil Water",
      legacyKey: "waterConsumedNetworkM3",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-surface-water",
      section: "Scope 3",
      subsection: "Water",
      label: "Surface water",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-ground-water",
      section: "Scope 3",
      subsection: "Water",
      label: "Ground water",
      legacyKey: "waterConsumedCapturedM3",
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-rainwater",
      section: "Scope 3",
      subsection: "Water",
      label: "Rainwater collected",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-waste-water",
      section: "Scope 3",
      subsection: "Water",
      label: "Waste water",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-municipal-water",
      section: "Scope 3",
      subsection: "Water",
      label: "Municipal water supplies",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-water-recycled",
      section: "Scope 3",
      subsection: "Water",
      label: "Water recycled and reused",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-water-discharges",
      section: "Scope 3",
      subsection: "Water",
      label: "Water discharges",
      legacyKey: null,
      enabled: true,
      col2Label: null,
      col2Value: null,
      col2Options: [],
      col3Unit: "M3",
      col3Options: WATER_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-leased-vehicles",
      section: "Scope 3",
      subsection: "Leased Vehicles",
      label: "Leased vehicle",
      legacyKey: null,
      enabled: true,
      col2Label: "Vehicle type",
      col2Value: "Carro",
      col2Options: VEHICLE_TYPES,
      col3Unit: "Electric",
      col3Options: VEHICLE_ENERGY_TYPES,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-150101",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "150101 - Paper and cardboard packaging",
      legacyKey: "ewc150101PaperCardboardPackagingTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-150102",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "150102 - Plastic packaging",
      legacyKey: "ewc150102PlasticPackagingTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-150103",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "150103 - Wood",
      legacyKey: "ewc150103WoodTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-160117",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "160117 - Ferrous metals",
      legacyKey: "ewc160117FerrousMetalsTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-160118",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "160118 - Non-ferrous metals",
      legacyKey: "ewc160118NonFerrousMetalsCopperTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-170117",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "170117 - Construction waste",
      legacyKey: "ewc170117ConstructionWasteTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-200111",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "200111 - Textiles",
      legacyKey: "ewc200111Tons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-200136",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "200136 - Electrical and electronic equipment",
      legacyKey: "ewc200136ElectricalElectronicEquipmentTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-200139",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "200139 - Plastic",
      legacyKey: "ewc200139PlasticTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Recovery",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-non-hazardous-200301",
      section: "Scope 3",
      subsection: "Non Hazardous waste",
      label: "200301 - Unsorted urban waste",
      legacyKey: "ewc200301UnsortedUrbanWasteTons",
      enabled: true,
      col2Label: "Treatment",
      col2Value: "Disposal",
      col2Options: DISPOSAL_TYPES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
    indicator({
      id: "scope3-hazardous-waste",
      section: "Scope 3",
      subsection: "Hazard waste",
      label: "Hazard waste",
      legacyKey: "hazardousWasteTons",
      enabled: true,
      col2Label: "LER code",
      col2Value: HAZARDOUS_LER_CODES[0],
      col2Options: HAZARDOUS_LER_CODES,
      col3Unit: "Toneladas",
      col3Options: WASTE_UNITS,
      distanceKm: null,
      valueMode: "manual",
    }),
  ];
}

export function createCustomRowFromIndicator(config: MonthlyIndicatorConfig): CustomMonthlyRow {
  return {
    id: config.id,
    section: config.section,
    subsection: config.subsection,
    label: config.label,
    enabled: config.enabled,
    col2Label: config.col2Label,
    col2Value: config.col2Value,
    col2Options: [...config.col2Options],
    col3Unit: config.col3Unit,
    col3Options: [...config.col3Options],
    distanceKm: config.distanceKm,
    valueMode: config.valueMode,
    months: emptyMonths(),
  };
}

function sanitizeConfig(entry: unknown): MonthlyIndicatorConfig | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.section !== "string" || typeof record.label !== "string") return null;

  return {
    id: record.id,
    section: record.section,
    subsection: typeof record.subsection === "string" ? record.subsection : null,
    label: record.label,
    legacyKey: typeof record.legacyKey === "string" ? (record.legacyKey as LegacyMetricKey) : null,
    enabled: record.enabled !== false,
    col2Label: typeof record.col2Label === "string" ? record.col2Label : null,
    col2Value: typeof record.col2Value === "string" ? record.col2Value : null,
    col2Options: Array.isArray(record.col2Options) ? record.col2Options.filter((item): item is string => typeof item === "string") : [],
    col3Unit: typeof record.col3Unit === "string" ? record.col3Unit : null,
    col3Options: Array.isArray(record.col3Options) ? record.col3Options.filter((item): item is string => typeof item === "string") : [],
    distanceKm: typeof record.distanceKm === "string" ? record.distanceKm : null,
    valueMode: record.valueMode === "computed" ? "computed" : "manual",
  };
}

function sanitizeCustomRow(entry: unknown): CustomMonthlyRow | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.section !== "string" || typeof record.label !== "string") return null;

  const rawMonths = Array.isArray(record.months) ? record.months : [];
  const months = Array.from({ length: 12 }, (_, index) => {
    const value = rawMonths[index];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });

  return {
    id: record.id,
    section: record.section,
    subsection: typeof record.subsection === "string" ? record.subsection : null,
    label: record.label,
    enabled: record.enabled !== false,
    col2Label: typeof record.col2Label === "string" ? record.col2Label : null,
    col2Value: typeof record.col2Value === "string" ? record.col2Value : null,
    col2Options: Array.isArray(record.col2Options) ? record.col2Options.filter((item): item is string => typeof item === "string") : [],
    col3Unit: typeof record.col3Unit === "string" ? record.col3Unit : null,
    col3Options: Array.isArray(record.col3Options) ? record.col3Options.filter((item): item is string => typeof item === "string") : [],
    distanceKm: typeof record.distanceKm === "string" ? record.distanceKm : null,
    valueMode: record.valueMode === "computed" ? "computed" : "manual",
    months,
  };
}

export function resolveMonthlyInputLayout(layoutRaw: unknown, customRowsRaw: unknown) {
  const defaultConfig = getDefaultMonthlyIndicatorConfig();
  const sanitizedConfig = Array.isArray(layoutRaw) ? layoutRaw.map(sanitizeConfig).filter((entry): entry is MonthlyIndicatorConfig => entry !== null) : [];
  const indicatorConfig = sanitizedConfig.length > 0 ? sanitizedConfig : defaultConfig;

  const customRowsMap = new Map<string, CustomMonthlyRow>();
  const persistedRows = Array.isArray(customRowsRaw) ? customRowsRaw.map(sanitizeCustomRow).filter((entry): entry is CustomMonthlyRow => entry !== null) : [];

  persistedRows.forEach((row) => customRowsMap.set(row.id, row));
  indicatorConfig
    .filter((config) => config.legacyKey === null)
    .forEach((config) => {
      if (!customRowsMap.has(config.id)) {
        customRowsMap.set(config.id, createCustomRowFromIndicator(config));
      }
    });

  return {
    indicatorConfig,
    customRows: Array.from(customRowsMap.values()),
  };
}

export function getNonHazardousLerCodes() {
  return [...NON_HAZARDOUS_LER_CODES];
}

export function getHazardousLerCodes() {
  return [...HAZARDOUS_LER_CODES];
}
