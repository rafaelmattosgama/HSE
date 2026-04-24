import { describe, expect, it } from "vitest";
import { buildMonthlyInputRows } from "@/lib/services/monthly-inputs";

describe("monthly inputs", () => {
  it("preserves zero values from plant monthly inputs", () => {
    const rows = [
      {
        month: 1,
        workerCount: 0,
        hoursWorked: { toString: () => "0" },
        standardHours: { toString: () => "160" },
        spillsNumber: 0,
        energyConsumedMwh: { toString: () => "0" },
        electricityFromGridMwh: { toString: () => "0" },
        selfProducedEnergyMwh: null,
        heatingM3: { toString: () => "0" },
        waterConsumedNetworkM3: null,
        waterConsumedCapturedM3: null,
        compressedAirConsumedM3: null,
        compressedAirConsumedMwh: null,
        ewc150101PaperCardboardPackagingTons: { toString: () => "1.5" },
        ewc150102PlasticPackagingTons: { toString: () => "0.5" },
        ewc150103WoodTons: null,
        ewc160117FerrousMetalsTons: null,
        ewc160118NonFerrousMetalsCopperTons: null,
        ewc170117ConstructionWasteTons: null,
        ewc200111Tons: null,
        ewc200136ElectricalElectronicEquipmentTons: null,
        ewc200139PlasticTons: null,
        ewc200301UnsortedUrbanWasteTons: null,
        nonHazardousWasteTons: null,
        hazardousWasteTons: null,
        recycledWasteTons: null,
      },
    ];

    const result = buildMonthlyInputRows(rows, []);

    expect(result[0]?.workerCount).toBe(0);
    expect(result[0]?.hoursWorked).toBe(0);
    expect(result[0]?.standardHours).toBe(160);
    expect(result[0]?.spillsNumber).toBe(0);
    expect(result[0]?.electricityFromGridMwh).toBe(0);
    expect(result[0]?.selfProducedEnergyMwh).toBeNull();
    expect(result[0]?.heatingM3).toBe(0);
    expect(result[0]?.ewc150101PaperCardboardPackagingTons).toBe(1.5);
    expect(result[0]?.ewc150102PlasticPackagingTons).toBe(0.5);
  });

  it("falls back to KPI hours worked only when the monthly input is missing", () => {
    const result = buildMonthlyInputRows(
      [
        {
          month: 1,
          workerCount: null,
          hoursWorked: null,
          standardHours: null,
          spillsNumber: null,
          energyConsumedMwh: null,
          electricityFromGridMwh: null,
          selfProducedEnergyMwh: null,
          heatingM3: null,
          waterConsumedNetworkM3: null,
          waterConsumedCapturedM3: null,
          compressedAirConsumedM3: null,
          compressedAirConsumedMwh: null,
          ewc150101PaperCardboardPackagingTons: null,
          ewc150102PlasticPackagingTons: null,
          ewc150103WoodTons: null,
          ewc160117FerrousMetalsTons: null,
          ewc160118NonFerrousMetalsCopperTons: null,
          ewc170117ConstructionWasteTons: null,
          ewc200111Tons: null,
          ewc200136ElectricalElectronicEquipmentTons: null,
          ewc200139PlasticTons: null,
          ewc200301UnsortedUrbanWasteTons: null,
          nonHazardousWasteTons: null,
          hazardousWasteTons: null,
          recycledWasteTons: null,
        },
        {
          month: 2,
          workerCount: null,
          hoursWorked: { toString: () => "0" },
          standardHours: null,
          spillsNumber: null,
          energyConsumedMwh: null,
          electricityFromGridMwh: null,
          selfProducedEnergyMwh: null,
          heatingM3: null,
          waterConsumedNetworkM3: null,
          waterConsumedCapturedM3: null,
          compressedAirConsumedM3: null,
          compressedAirConsumedMwh: null,
          ewc150101PaperCardboardPackagingTons: null,
          ewc150102PlasticPackagingTons: null,
          ewc150103WoodTons: null,
          ewc160117FerrousMetalsTons: null,
          ewc160118NonFerrousMetalsCopperTons: null,
          ewc170117ConstructionWasteTons: null,
          ewc200111Tons: null,
          ewc200136ElectricalElectronicEquipmentTons: null,
          ewc200139PlasticTons: null,
          ewc200301UnsortedUrbanWasteTons: null,
          nonHazardousWasteTons: null,
          hazardousWasteTons: null,
          recycledWasteTons: null,
        },
      ],
      [
        { month: 1, hoursWorked: { toString: () => "12.5" } },
        { month: 2, hoursWorked: { toString: () => "99" } },
      ],
    );

    expect(result[0]?.hoursWorked).toBe(12.5);
    expect(result[1]?.hoursWorked).toBe(0);
  });

  it("maps legacy total energy to electricity from the grid when split values are missing", () => {
    const result = buildMonthlyInputRows(
      [
        {
          month: 1,
          workerCount: null,
          hoursWorked: null,
          standardHours: null,
          spillsNumber: null,
          energyConsumedMwh: { toString: () => "18.4" },
          electricityFromGridMwh: null,
          selfProducedEnergyMwh: null,
          heatingM3: null,
          waterConsumedNetworkM3: null,
          waterConsumedCapturedM3: null,
          compressedAirConsumedM3: null,
          compressedAirConsumedMwh: null,
          ewc150101PaperCardboardPackagingTons: null,
          ewc150102PlasticPackagingTons: null,
          ewc150103WoodTons: null,
          ewc160117FerrousMetalsTons: null,
          ewc160118NonFerrousMetalsCopperTons: null,
          ewc170117ConstructionWasteTons: null,
          ewc200111Tons: null,
          ewc200136ElectricalElectronicEquipmentTons: null,
          ewc200139PlasticTons: null,
          ewc200301UnsortedUrbanWasteTons: null,
          nonHazardousWasteTons: null,
          hazardousWasteTons: null,
          recycledWasteTons: null,
        },
      ],
      [],
    );

    expect(result[0]?.electricityFromGridMwh).toBe(18.4);
    expect(result[0]?.selfProducedEnergyMwh).toBeNull();
  });

  it("maps legacy total non-hazardous waste to the first split row when detailed values are missing", () => {
    const result = buildMonthlyInputRows(
      [
        {
          month: 1,
          workerCount: null,
          hoursWorked: null,
          standardHours: null,
          spillsNumber: null,
          energyConsumedMwh: null,
          electricityFromGridMwh: null,
          selfProducedEnergyMwh: null,
          heatingM3: null,
          waterConsumedNetworkM3: null,
          waterConsumedCapturedM3: null,
          compressedAirConsumedM3: null,
          compressedAirConsumedMwh: null,
          ewc150101PaperCardboardPackagingTons: null,
          ewc150102PlasticPackagingTons: null,
          ewc150103WoodTons: null,
          ewc160117FerrousMetalsTons: null,
          ewc160118NonFerrousMetalsCopperTons: null,
          ewc170117ConstructionWasteTons: null,
          ewc200111Tons: null,
          ewc200136ElectricalElectronicEquipmentTons: null,
          ewc200139PlasticTons: null,
          ewc200301UnsortedUrbanWasteTons: null,
          nonHazardousWasteTons: { toString: () => "18.4" },
          hazardousWasteTons: null,
          recycledWasteTons: null,
        },
      ],
      [],
    );

    expect(result[0]?.ewc150101PaperCardboardPackagingTons).toBe(18.4);
    expect(result[0]?.ewc150102PlasticPackagingTons).toBeNull();
  });
});
