type DecimalLike = {
  toString(): string;
};

type MonthlyNumber = DecimalLike | number | null | undefined;

export type EnvironmentMonthlyInputRecord = {
  year: number;
  month: number;
  workerCount: number | null;
  hoursWorked: MonthlyNumber;
  standardHours: MonthlyNumber;
  spillsNumber: number | null;
  energyConsumedMwh: MonthlyNumber;
  electricityFromGridMwh: MonthlyNumber;
  selfProducedEnergyMwh: MonthlyNumber;
  heatingM3: MonthlyNumber;
  waterConsumedNetworkM3: MonthlyNumber;
  waterConsumedCapturedM3: MonthlyNumber;
  compressedAirConsumedM3: MonthlyNumber;
  compressedAirConsumedMwh: MonthlyNumber;
  nonHazardousWasteTons: MonthlyNumber;
  ewc150101PaperCardboardPackagingTons: MonthlyNumber;
  ewc150102PlasticPackagingTons: MonthlyNumber;
  ewc150103WoodTons: MonthlyNumber;
  ewc160117FerrousMetalsTons: MonthlyNumber;
  ewc160118NonFerrousMetalsCopperTons: MonthlyNumber;
  ewc170117ConstructionWasteTons: MonthlyNumber;
  ewc200111Tons: MonthlyNumber;
  ewc200136ElectricalElectronicEquipmentTons: MonthlyNumber;
  ewc200139PlasticTons: MonthlyNumber;
  ewc200301UnsortedUrbanWasteTons: MonthlyNumber;
  hazardousWasteTons: MonthlyNumber;
  recycledWasteTons: MonthlyNumber;
};

export type EnvironmentWasteBreakdownItem = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type EnvironmentMonthlySnapshot = {
  key: string;
  label: string;
  year: number;
  month: number;
  workers: number;
  hoursWorked: number;
  standardHours: number;
  spills: number;
  energyMwh: number;
  electricityFromGridMwh: number;
  selfProducedEnergyMwh: number;
  heatingM3: number;
  waterM3: number;
  waterNetworkM3: number;
  waterCapturedM3: number;
  compressedAirM3: number;
  compressedAirMwh: number;
  totalWasteTons: number;
  nonHazardousWasteTons: number;
  hazardousWasteTons: number;
  recycledWasteTons: number;
  wasteBreakdown: EnvironmentWasteBreakdownItem[];
};

export type EnvironmentDashboardPlant = {
  id: string;
  code: string;
  name: string;
  months: EnvironmentMonthlySnapshot[];
};

export type EnvironmentSummary = {
  monthsCount: number;
  energyMwh: number;
  electricityFromGridMwh: number;
  selfProducedEnergyMwh: number;
  heatingM3: number;
  waterM3: number;
  waterNetworkM3: number;
  waterCapturedM3: number;
  compressedAirM3: number;
  compressedAirMwh: number;
  totalWasteTons: number;
  nonHazardousWasteTons: number;
  hazardousWasteTons: number;
  recycledWasteTons: number;
  spills: number;
  hoursWorked: number;
  standardHours: number;
  averageWorkers: number;
  wasteBreakdown: EnvironmentWasteBreakdownItem[];
};

const WASTE_COLORS = {
  paper: "#22c55e",
  plastic: "#f97316",
  wood: "#a16207",
  metals: "#0ea5e9",
  construction: "#64748b",
  textiles: "#8b5cf6",
  electrical: "#14b8a6",
  urban: "#ef4444",
  nonHazardous: "#84cc16",
  hazardous: "#be123c",
  recycled: "#10b981",
};

function nullableNumber(value: MonthlyNumber) {
  if (value == null) return null;
  const numberValue = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numberValue(value: MonthlyNumber) {
  return nullableNumber(value) ?? 0;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function positiveWasteItem(key: string, label: string, value: number, color: string): EnvironmentWasteBreakdownItem | null {
  return value > 0 ? { key, label, value, color } : null;
}

function buildWasteBreakdown(row: EnvironmentMonthlyInputRecord) {
  const paper = numberValue(row.ewc150101PaperCardboardPackagingTons);
  const plastic = numberValue(row.ewc150102PlasticPackagingTons) + numberValue(row.ewc200139PlasticTons);
  const wood = numberValue(row.ewc150103WoodTons);
  const metals = numberValue(row.ewc160117FerrousMetalsTons) + numberValue(row.ewc160118NonFerrousMetalsCopperTons);
  const construction = numberValue(row.ewc170117ConstructionWasteTons);
  const textiles = numberValue(row.ewc200111Tons);
  const electrical = numberValue(row.ewc200136ElectricalElectronicEquipmentTons);
  const urban = numberValue(row.ewc200301UnsortedUrbanWasteTons);
  const detailedNonHazardous = paper + plastic + wood + metals + construction + textiles + electrical + urban;
  const hasDetailedNonHazardous = [
    row.ewc150101PaperCardboardPackagingTons,
    row.ewc150102PlasticPackagingTons,
    row.ewc150103WoodTons,
    row.ewc160117FerrousMetalsTons,
    row.ewc160118NonFerrousMetalsCopperTons,
    row.ewc170117ConstructionWasteTons,
    row.ewc200111Tons,
    row.ewc200136ElectricalElectronicEquipmentTons,
    row.ewc200139PlasticTons,
    row.ewc200301UnsortedUrbanWasteTons,
  ].some((value) => nullableNumber(value) !== null);
  const legacyNonHazardous = numberValue(row.nonHazardousWasteTons);
  const nonHazardousWasteTons = hasDetailedNonHazardous ? detailedNonHazardous : legacyNonHazardous;
  const hazardousWasteTons = numberValue(row.hazardousWasteTons);
  const recycledWasteTons = numberValue(row.recycledWasteTons);

  const detailedItems = [
    positiveWasteItem("paper", "Paper/cardboard", paper, WASTE_COLORS.paper),
    positiveWasteItem("plastic", "Plastic", plastic, WASTE_COLORS.plastic),
    positiveWasteItem("wood", "Wood", wood, WASTE_COLORS.wood),
    positiveWasteItem("metals", "Metals", metals, WASTE_COLORS.metals),
    positiveWasteItem("construction", "Construction", construction, WASTE_COLORS.construction),
    positiveWasteItem("textiles", "Textiles", textiles, WASTE_COLORS.textiles),
    positiveWasteItem("electrical", "Electrical equipment", electrical, WASTE_COLORS.electrical),
    positiveWasteItem("urban", "Urban waste", urban, WASTE_COLORS.urban),
  ].filter((item): item is EnvironmentWasteBreakdownItem => item !== null);

  const wasteBreakdown = [
    ...(hasDetailedNonHazardous
      ? detailedItems
      : [positiveWasteItem("non-hazardous", "Non-hazardous", legacyNonHazardous, WASTE_COLORS.nonHazardous)].filter(
          (item): item is EnvironmentWasteBreakdownItem => item !== null,
        )),
    positiveWasteItem("hazardous", "Hazardous", hazardousWasteTons, WASTE_COLORS.hazardous),
    positiveWasteItem("recycled", "Recycled", recycledWasteTons, WASTE_COLORS.recycled),
  ].filter((item): item is EnvironmentWasteBreakdownItem => item !== null);

  return {
    nonHazardousWasteTons,
    hazardousWasteTons,
    recycledWasteTons,
    totalWasteTons: nonHazardousWasteTons + hazardousWasteTons + recycledWasteTons,
    wasteBreakdown,
  };
}

export function buildEnvironmentDashboardPlant(input: {
  id: string;
  code: string;
  name: string;
  rows: EnvironmentMonthlyInputRecord[];
}): EnvironmentDashboardPlant {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    months: input.rows
      .map((row) => {
        const selfProducedEnergyMwh = numberValue(row.selfProducedEnergyMwh);
        const gridEnergyFallback =
          nullableNumber(row.electricityFromGridMwh) ?? (nullableNumber(row.selfProducedEnergyMwh) === null ? numberValue(row.energyConsumedMwh) : 0);
        const compressedAirMwh = numberValue(row.compressedAirConsumedMwh);
        const waterNetworkM3 = numberValue(row.waterConsumedNetworkM3);
        const waterCapturedM3 = numberValue(row.waterConsumedCapturedM3);
        const waste = buildWasteBreakdown(row);

        return {
          key: monthKey(row.year, row.month),
          label: monthLabel(row.year, row.month),
          year: row.year,
          month: row.month,
          workers: row.workerCount ?? 0,
          hoursWorked: numberValue(row.hoursWorked),
          standardHours: numberValue(row.standardHours),
          spills: row.spillsNumber ?? 0,
          energyMwh: gridEnergyFallback + selfProducedEnergyMwh + compressedAirMwh,
          electricityFromGridMwh: gridEnergyFallback,
          selfProducedEnergyMwh,
          heatingM3: numberValue(row.heatingM3),
          waterM3: waterNetworkM3 + waterCapturedM3,
          waterNetworkM3,
          waterCapturedM3,
          compressedAirM3: numberValue(row.compressedAirConsumedM3),
          compressedAirMwh,
          ...waste,
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export function aggregateEnvironmentMonths(plants: EnvironmentDashboardPlant[]): EnvironmentMonthlySnapshot[] {
  const months = new Map<string, EnvironmentMonthlySnapshot>();

  for (const plant of plants) {
    for (const month of plant.months) {
      const current =
        months.get(month.key) ??
        ({
          ...month,
          workers: 0,
          hoursWorked: 0,
          standardHours: 0,
          spills: 0,
          energyMwh: 0,
          electricityFromGridMwh: 0,
          selfProducedEnergyMwh: 0,
          heatingM3: 0,
          waterM3: 0,
          waterNetworkM3: 0,
          waterCapturedM3: 0,
          compressedAirM3: 0,
          compressedAirMwh: 0,
          totalWasteTons: 0,
          nonHazardousWasteTons: 0,
          hazardousWasteTons: 0,
          recycledWasteTons: 0,
          wasteBreakdown: [],
        } satisfies EnvironmentMonthlySnapshot);

      current.workers += month.workers;
      current.hoursWorked += month.hoursWorked;
      current.standardHours += month.standardHours;
      current.spills += month.spills;
      current.energyMwh += month.energyMwh;
      current.electricityFromGridMwh += month.electricityFromGridMwh;
      current.selfProducedEnergyMwh += month.selfProducedEnergyMwh;
      current.heatingM3 += month.heatingM3;
      current.waterM3 += month.waterM3;
      current.waterNetworkM3 += month.waterNetworkM3;
      current.waterCapturedM3 += month.waterCapturedM3;
      current.compressedAirM3 += month.compressedAirM3;
      current.compressedAirMwh += month.compressedAirMwh;
      current.totalWasteTons += month.totalWasteTons;
      current.nonHazardousWasteTons += month.nonHazardousWasteTons;
      current.hazardousWasteTons += month.hazardousWasteTons;
      current.recycledWasteTons += month.recycledWasteTons;
      current.wasteBreakdown = mergeWasteBreakdown([...current.wasteBreakdown, ...month.wasteBreakdown]);
      months.set(month.key, current);
    }
  }

  return [...months.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function mergeWasteBreakdown(items: EnvironmentWasteBreakdownItem[]) {
  const itemMap = new Map<string, EnvironmentWasteBreakdownItem>();

  for (const item of items) {
    const current = itemMap.get(item.key);
    if (current) {
      current.value += item.value;
    } else {
      itemMap.set(item.key, { ...item });
    }
  }

  return [...itemMap.values()].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

export function summarizeEnvironmentMonths(months: EnvironmentMonthlySnapshot[]): EnvironmentSummary {
  const workerMonths = months.filter((month) => month.workers > 0);
  const wasteBreakdown = mergeWasteBreakdown(months.flatMap((month) => month.wasteBreakdown));

  return {
    monthsCount: months.length,
    energyMwh: months.reduce((sum, month) => sum + month.energyMwh, 0),
    electricityFromGridMwh: months.reduce((sum, month) => sum + month.electricityFromGridMwh, 0),
    selfProducedEnergyMwh: months.reduce((sum, month) => sum + month.selfProducedEnergyMwh, 0),
    heatingM3: months.reduce((sum, month) => sum + month.heatingM3, 0),
    waterM3: months.reduce((sum, month) => sum + month.waterM3, 0),
    waterNetworkM3: months.reduce((sum, month) => sum + month.waterNetworkM3, 0),
    waterCapturedM3: months.reduce((sum, month) => sum + month.waterCapturedM3, 0),
    compressedAirM3: months.reduce((sum, month) => sum + month.compressedAirM3, 0),
    compressedAirMwh: months.reduce((sum, month) => sum + month.compressedAirMwh, 0),
    totalWasteTons: months.reduce((sum, month) => sum + month.totalWasteTons, 0),
    nonHazardousWasteTons: months.reduce((sum, month) => sum + month.nonHazardousWasteTons, 0),
    hazardousWasteTons: months.reduce((sum, month) => sum + month.hazardousWasteTons, 0),
    recycledWasteTons: months.reduce((sum, month) => sum + month.recycledWasteTons, 0),
    spills: months.reduce((sum, month) => sum + month.spills, 0),
    hoursWorked: months.reduce((sum, month) => sum + month.hoursWorked, 0),
    standardHours: months.reduce((sum, month) => sum + month.standardHours, 0),
    averageWorkers: workerMonths.length > 0 ? workerMonths.reduce((sum, month) => sum + month.workers, 0) / workerMonths.length : 0,
    wasteBreakdown,
  };
}
