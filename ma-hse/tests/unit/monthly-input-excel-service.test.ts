import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
  plantMonthlyInput: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  safetyKpiMonthlyInput: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  systemParameter: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => loggerMock);

import { MonthlyInputExcelService } from "@/lib/services/monthly-input-excel-service";

function decimal(value: string) {
  return { toString: () => value };
}

async function workbookFromBuffer(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(new Uint8Array(buffer));
  return workbook;
}

async function workbookBuffer(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function resetMonthlyState() {
  prismaMock.plantMonthlyInput.findMany.mockResolvedValue([]);
  prismaMock.safetyKpiMonthlyInput.findMany.mockResolvedValue([]);
  prismaMock.systemParameter.findUnique.mockResolvedValue(null);
  prismaMock.plantMonthlyInput.upsert.mockResolvedValue({});
  prismaMock.safetyKpiMonthlyInput.upsert.mockResolvedValue({});
  prismaMock.systemParameter.upsert.mockResolvedValue({});
}

describe("MonthlyInputExcelService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports one worksheet per monthly input category with month columns and standard-hours formulas", async () => {
    resetMonthlyState();
    prismaMock.plantMonthlyInput.findMany.mockResolvedValue([
      {
        month: 1,
        workerCount: 12,
        hoursWorked: decimal("1600"),
        standardHours: decimal("20"),
        spillsNumber: null,
        energyConsumedMwh: null,
        electricityFromGridMwh: null,
        selfProducedEnergyMwh: null,
        heatingM3: null,
        waterConsumedNetworkM3: null,
        waterConsumedCapturedM3: null,
        compressedAirConsumedM3: null,
        compressedAirConsumedMwh: null,
        nonHazardousWasteTons: null,
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
        hazardousWasteTons: null,
        recycledWasteTons: null,
      },
    ]);
    prismaMock.systemParameter.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valueJson: [
          {
            id: "total-min-car",
            section: "Standard hours",
            subsection: null,
            label: "Total min/car",
            enabled: true,
            months: [30, ...Array(11).fill(null)],
          },
          {
            id: "volumes",
            section: "Standard hours",
            subsection: null,
            label: "Volumes",
            enabled: true,
            months: [40, ...Array(11).fill(null)],
          },
        ],
      });

    const buffer = await MonthlyInputExcelService.buildExport({
      plantId: "plant-1",
      plantCode: "pl1",
      plantName: "Plant 1",
      year: 2026,
    });
    const workbook = await workbookFromBuffer(buffer);

    expect(workbook.getWorksheet("Metadata")?.getCell("B2").value).toBe(2026);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining([
        "Core Inputs",
        "Standard hours",
        "Scope 1",
        "Scope 2",
        "Scope 3",
        "Inbounds",
        "Outbounds",
        "Materials",
      ]),
    );
    const standardHoursSheet = workbook.getWorksheet("Standard hours");
    expect(standardHoursSheet?.getRow(3).values).toEqual(
      expect.arrayContaining(["Janeiro", "Fevereiro", "Dezembro"]),
    );
    const formulaCell = standardHoursSheet?.getRow(6).getCell(17).value;
    expect(formulaCell).toEqual(expect.objectContaining({ formula: "ROUND((Q4*Q5)/60,2)" }));
  });

  it("imports existing indicators by id and creates new indicators from appended rows", async () => {
    resetMonthlyState();
    prismaMock.plantMonthlyInput.findMany.mockResolvedValue([
      {
        month: 1,
        workerCount: 12,
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
        nonHazardousWasteTons: null,
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
        hazardousWasteTons: null,
        recycledWasteTons: null,
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    const metadata = workbook.addWorksheet("Metadata");
    metadata.getCell("A1").value = "Field";
    metadata.getCell("B1").value = "Value";
    metadata.getCell("A2").value = "Year";
    metadata.getCell("B2").value = 2026;
    const core = workbook.addWorksheet("Core Inputs");
    core.getRow(3).values = [
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
      "Janeiro",
      "Fevereiro",
      "Marco",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    core.getRow(4).values = ["workers", "workerCount", "Core Inputs", "", "Workers", "Workers", "Workers", "manual", "", "", "", "", "", "", "Yes", "", 44];

    const inbounds = workbook.addWorksheet("Inbounds");
    inbounds.getRow(3).values = core.getRow(3).values;
    inbounds.getRow(4).values = ["", "", "Inbounds", "", "New supplier", "New supplier", "Kg", "manual", "", "Transport type", "Ship", "", "Kg; Ton", "100", "Yes", "", 250];

    const summary = await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));

    expect(summary.errors).toEqual([]);
    expect(summary.indicatorsCreated).toBe(1);
    expect(summary.monthlyValuesCreated).toBeGreaterThanOrEqual(1);
    expect(summary.monthlyValuesUpdated).toBeGreaterThanOrEqual(1);
    expect(prismaMock.plantMonthlyInput.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          plantId_year_month: {
            plantId: "plant-1",
            year: 2026,
            month: 1,
          },
        },
        update: expect.objectContaining({
          workerCount: 44,
        }),
      }),
    );
    expect(prismaMock.systemParameter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          valueJson: expect.arrayContaining([
            expect.objectContaining({
              section: "Inbounds",
              label: "New supplier",
            }),
          ]),
        }),
      }),
    );
  });

  it("rejects duplicate indicators inside the imported workbook before persisting", async () => {
    resetMonthlyState();
    const workbook = new ExcelJS.Workbook();
    const metadata = workbook.addWorksheet("Metadata");
    metadata.getCell("B2").value = 2026;
    const core = workbook.addWorksheet("Core Inputs");
    core.getRow(3).values = [
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
      "Janeiro",
      "Fevereiro",
      "Marco",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    core.getRow(4).values = ["workers", "workerCount", "Core Inputs", "", "Workers", "Workers", "Workers", "manual", "", "", "", "", "", "", "Yes", "", 44];
    core.getRow(5).values = ["workers", "workerCount", "Core Inputs", "", "Workers", "Workers", "Workers", "manual", "", "", "", "", "", "", "Yes", "", 45];

    const summary = await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));

    expect(summary.errors).toEqual([
      expect.objectContaining({
        sheet: "Core Inputs",
        row: 5,
        column: "Indicator name",
        message: "Duplicate indicator in Excel file.",
      }),
    ]);
    expect(prismaMock.plantMonthlyInput.upsert).not.toHaveBeenCalled();
    expect(prismaMock.systemParameter.upsert).not.toHaveBeenCalled();
  });
});
