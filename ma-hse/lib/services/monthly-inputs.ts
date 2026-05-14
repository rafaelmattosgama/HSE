type MonthlyInputRow = {
  month: number;
  workerCount: number | null;
  hoursWorked: number | null;
  standardHours: number | null;
  spillsNumber: number | null;
  electricityFromGridMwh: number | null;
  selfProducedEnergyMwh: number | null;
  heatingM3: number | null;
  waterConsumedNetworkM3: number | null;
  waterConsumedCapturedM3: number | null;
  compressedAirConsumedM3: number | null;
  compressedAirConsumedMwh: number | null;
  ewc150101PaperCardboardPackagingTons: number | null;
  ewc150102PlasticPackagingTons: number | null;
  ewc150103WoodTons: number | null;
  ewc160117FerrousMetalsTons: number | null;
  ewc160118NonFerrousMetalsCopperTons: number | null;
  ewc170117ConstructionWasteTons: number | null;
  ewc200111Tons: number | null;
  ewc200136ElectricalElectronicEquipmentTons: number | null;
  ewc200139PlasticTons: number | null;
  ewc200301UnsortedUrbanWasteTons: number | null;
  hazardousWasteTons: number | null;
  recycledWasteTons: number | null;
};

type DecimalLike = {
  toString(): string;
};

type PlantMonthlyInputLike = {
  month: number;
  workerCount: number | null;
  hoursWorked: DecimalLike | null;
  standardHours: DecimalLike | null;
  spillsNumber: number | null;
  energyConsumedMwh: DecimalLike | null;
  electricityFromGridMwh: DecimalLike | null;
  selfProducedEnergyMwh: DecimalLike | null;
  heatingM3: DecimalLike | null;
  waterConsumedNetworkM3: DecimalLike | null;
  waterConsumedCapturedM3: DecimalLike | null;
  compressedAirConsumedM3: DecimalLike | null;
  compressedAirConsumedMwh: DecimalLike | null;
  nonHazardousWasteTons: DecimalLike | null;
  ewc150101PaperCardboardPackagingTons: DecimalLike | null;
  ewc150102PlasticPackagingTons: DecimalLike | null;
  ewc150103WoodTons: DecimalLike | null;
  ewc160117FerrousMetalsTons: DecimalLike | null;
  ewc160118NonFerrousMetalsCopperTons: DecimalLike | null;
  ewc170117ConstructionWasteTons: DecimalLike | null;
  ewc200111Tons: DecimalLike | null;
  ewc200136ElectricalElectronicEquipmentTons: DecimalLike | null;
  ewc200139PlasticTons: DecimalLike | null;
  ewc200301UnsortedUrbanWasteTons: DecimalLike | null;
  hazardousWasteTons: DecimalLike | null;
  recycledWasteTons: DecimalLike | null;
};

type SafetyKpiMonthlyInputLike = {
  month: number;
  hoursWorked: DecimalLike;
};

function toNullableNumber(value: DecimalLike | null | undefined) {
  return value == null ? null : Number(value);
}

function toNonHazardousWasteRows(row: PlantMonthlyInputLike | undefined) {
  const detailedValues = [
    toNullableNumber(row?.ewc150101PaperCardboardPackagingTons),
    toNullableNumber(row?.ewc150102PlasticPackagingTons),
    toNullableNumber(row?.ewc150103WoodTons),
    toNullableNumber(row?.ewc160117FerrousMetalsTons),
    toNullableNumber(row?.ewc160118NonFerrousMetalsCopperTons),
    toNullableNumber(row?.ewc170117ConstructionWasteTons),
    toNullableNumber(row?.ewc200111Tons),
    toNullableNumber(row?.ewc200136ElectricalElectronicEquipmentTons),
    toNullableNumber(row?.ewc200139PlasticTons),
    toNullableNumber(row?.ewc200301UnsortedUrbanWasteTons),
  ];

  const hasDetailedValues = detailedValues.some((value) => value !== null);

  return {
    ewc150101PaperCardboardPackagingTons:
      toNullableNumber(row?.ewc150101PaperCardboardPackagingTons) ?? (!hasDetailedValues ? toNullableNumber(row?.nonHazardousWasteTons) : null),
    ewc150102PlasticPackagingTons: toNullableNumber(row?.ewc150102PlasticPackagingTons),
    ewc150103WoodTons: toNullableNumber(row?.ewc150103WoodTons),
    ewc160117FerrousMetalsTons: toNullableNumber(row?.ewc160117FerrousMetalsTons),
    ewc160118NonFerrousMetalsCopperTons: toNullableNumber(row?.ewc160118NonFerrousMetalsCopperTons),
    ewc170117ConstructionWasteTons: toNullableNumber(row?.ewc170117ConstructionWasteTons),
    ewc200111Tons: toNullableNumber(row?.ewc200111Tons),
    ewc200136ElectricalElectronicEquipmentTons: toNullableNumber(row?.ewc200136ElectricalElectronicEquipmentTons),
    ewc200139PlasticTons: toNullableNumber(row?.ewc200139PlasticTons),
    ewc200301UnsortedUrbanWasteTons: toNullableNumber(row?.ewc200301UnsortedUrbanWasteTons),
  };
}

export function buildMonthlyInputRows(
  rows: PlantMonthlyInputLike[],
  kpiRows: SafetyKpiMonthlyInputLike[],
): MonthlyInputRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row = rows.find((entry) => entry.month === month);
    const kpiRow = kpiRows.find((entry) => entry.month === month);
    const nonHazardousWasteRows = toNonHazardousWasteRows(row);

    return {
      month,
      workerCount: row?.workerCount ?? null,
      hoursWorked: toNullableNumber(row?.hoursWorked) ?? toNullableNumber(kpiRow?.hoursWorked),
      standardHours: toNullableNumber(row?.standardHours),
      spillsNumber: row?.spillsNumber ?? null,
      electricityFromGridMwh:
        toNullableNumber(row?.electricityFromGridMwh) ?? (row?.selfProducedEnergyMwh == null ? toNullableNumber(row?.energyConsumedMwh) : null),
      selfProducedEnergyMwh: toNullableNumber(row?.selfProducedEnergyMwh),
      heatingM3: toNullableNumber(row?.heatingM3),
      waterConsumedNetworkM3: toNullableNumber(row?.waterConsumedNetworkM3),
      waterConsumedCapturedM3: toNullableNumber(row?.waterConsumedCapturedM3),
      compressedAirConsumedM3: toNullableNumber(row?.compressedAirConsumedM3),
      compressedAirConsumedMwh: toNullableNumber(row?.compressedAirConsumedMwh),
      ...nonHazardousWasteRows,
      hazardousWasteTons: toNullableNumber(row?.hazardousWasteTons),
      recycledWasteTons: toNullableNumber(row?.recycledWasteTons),
    };
  });
}

export type { MonthlyInputRow };
