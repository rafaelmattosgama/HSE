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

function monthlyHeaders() {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

function addHseFixtureWorkbook() {
  const workbook = new ExcelJS.Workbook();

  const sustainability = workbook.addWorksheet("Sustainability data entry ");
  sustainability.getCell("A1").value = "MAAP - Sustainability Data Input 2026";
  sustainability.getRow(3).values = ["Indicator", "Unit", "Treatment", ...monthlyHeaders()];
  sustainability.getRow(4).values = ["Core Inputs"];
  sustainability.getRow(5).values = ["Headcount total", "Workers", "", 536, 534, 534];
  sustainability.getRow(6).values = ["Spills number", "Number", "", 1, 0, 2];
  sustainability.getRow(7).values = ["Scope 1"];
  sustainability.getRow(8).values = ["Electricity self-produced", "MWh", "", 140.1175, 187.743, 331.9456, 376.27161];
  sustainability.getRow(9).values = ["Heating Natural gas", "m3", "", 339063, 244320, 100837, 55213];
  sustainability.getRow(10).values = ["Scope 2"];
  sustainability.getRow(11).values = ["Electricity from the grid", "MWh", "", 1376.63328, 1276.396, 1329.58296, 1088.03832];
  sustainability.getRow(12).values = ["Compressed air from third-party", "m3", "", 2259549, 2093259, 2470584, 2762154];
  sustainability.getRow(13).values = ["Scope 3 - Water"];
  sustainability.getRow(14).values = ["Civil water", "m3", "", 689, 666.32, 746.63, 872];
  sustainability.getRow(15).values = ["Ground water", "m3", "", 12, 13, 14, 15];
  sustainability.getRow(16).values = ["Industrial water", "m3", "", 10, 20, 30];
  sustainability.getRow(17).values = ["Scope 3 - Waste"];
  sustainability.getRow(18).values = ["Non Hazardous waste"];
  sustainability.getRow(19).values = ["EWC 150101 - Paper and cardboard packaging", "Kg", "Recovery", 1000, 2000, 3000];
  sustainability.getRow(20).values = ["LER 080409 - Adhesives and sealants", "Ton", "Disposal", 4, 5, 6];
  sustainability.getRow(21).values = ["Hazard waste"];
  sustainability.getRow(22).values = ["150110 - Contaminated packaging", "Kg", "Recovery", 500, 250, 125];

  const standardHours = workbook.addWorksheet("Standard hours");
  standardHours.getCell("A1").value = "Standard hours 2026";
  standardHours.getRow(3).values = [
    "Model",
    ...monthlyHeaders().flatMap((month) => [`${month} Volumes`, `${month} Standard Hours`]),
  ];
  standardHours.getRow(4).values = [
    "TOTAL",
    1000,
    44622.8645,
    1000,
    40002.7482,
    1000,
    49899.1462,
    1000,
    52496.0852,
  ];

  const log = workbook.addWorksheet("Log-Mat-Sold");
  log.getCell("A1").value = "Log-Mat-Sold 2026";
  log.getRow(2).values = ["INBOUND LOGISTIC"];
  log.getRow(3).values = ["Supplier", "Transport type", "Unit", "Distance KM", ...monthlyHeaders()];
  log.getRow(4).values = ["Supplier outside fixture", "Rail", "Kg", "120", 100, 200, 300];
  log.getRow(6).values = ["MATERIALS"];
  log.getRow(7).values = ["Material", "Classification", "Unit", ...monthlyHeaders()];
  log.getRow(8).values = ["Material outside fixture", "Indirect", "Ton", 9, 8, 7];
  log.getRow(10).values = ["SOLD PRODUCTS"];
  log.getRow(11).values = ["Product", "Unit", ...monthlyHeaders()];
  log.getRow(12).values = ["Sold product outside fixture", "Units", 11, 12, 13];

  const output = workbook.addWorksheet("Env data output");
  output.getCell("A1").value = "Calculated only";

  const hidden = workbook.addWorksheet("Counters");
  hidden.state = "hidden";
  hidden.getCell("A1").value = "Sustainability Data Input 2026";
  hidden.getRow(3).values = ["Indicator", "Unit", "Jan"];
  hidden.getRow(4).values = ["Headcount total", "Workers", -999];

  return workbook;
}

function getUpsertPayloads() {
  const calls = prismaMock.systemParameter.upsert.mock.calls.map((call) => call[0]);
  const layout = calls.find((call) => call?.create?.key === "MONTHLY_INPUTS_LAYOUT")?.update?.valueJson;
  const customRows = calls.find((call) => String(call?.create?.key ?? "").includes("_ROWS"))?.update?.valueJson;
  return { layout, customRows };
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

  it("detects HSE-compatible workbooks, ignores hidden/output sheets, and imports visible environmental inputs", async () => {
    resetMonthlyState();
    const workbook = addHseFixtureWorkbook();

    const summary = await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));

    expect(summary.errors).toEqual([]);
    expect(summary.year).toBe(2026);
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: "Env data output",
          message: "Env data output ignored because it is a calculated output sheet.",
        }),
      ]),
    );
    expect(prismaMock.plantMonthlyInput.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId_year_month: { plantId: "plant-1", year: 2026, month: 1 },
        }),
        update: expect.objectContaining({
          workerCount: 536,
          spillsNumber: 1,
          standardHours: expect.objectContaining({ toString: expect.any(Function) }),
          selfProducedEnergyMwh: expect.objectContaining({ toString: expect.any(Function) }),
          heatingM3: expect.objectContaining({ toString: expect.any(Function) }),
          electricityFromGridMwh: expect.objectContaining({ toString: expect.any(Function) }),
          compressedAirConsumedM3: expect.objectContaining({ toString: expect.any(Function) }),
          waterConsumedNetworkM3: expect.objectContaining({ toString: expect.any(Function) }),
          ewc150101PaperCardboardPackagingTons: expect.objectContaining({ toString: expect.any(Function) }),
          recycledWasteTons: expect.objectContaining({ toString: expect.any(Function) }),
        }),
      }),
    );
    const firstMonthUpsert = prismaMock.plantMonthlyInput.upsert.mock.calls[0]?.[0];
    expect(firstMonthUpsert.update.standardHours.toString()).toBe("44622.8645");
    expect(firstMonthUpsert.update.selfProducedEnergyMwh.toString()).toBe("140.1175");
    expect(firstMonthUpsert.update.heatingM3.toString()).toBe("339063");
    expect(firstMonthUpsert.update.electricityFromGridMwh.toString()).toBe("1376.63328");
    expect(firstMonthUpsert.update.compressedAirConsumedM3.toString()).toBe("2259549");
    expect(firstMonthUpsert.update.waterConsumedNetworkM3.toString()).toBe("689");
    expect(firstMonthUpsert.update.ewc150101PaperCardboardPackagingTons.toString()).toBe("1");
    expect(firstMonthUpsert.update.recycledWasteTons.toString()).toBe("1.5");

    const { customRows } = getUpsertPayloads();
    expect(customRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Scope 3",
          label: expect.stringContaining("080409"),
          col2Value: "Disposal",
        }),
        expect.objectContaining({
          section: "Inbounds",
          label: "Supplier outside fixture",
          col2Value: "Rail",
          distanceKm: "120",
        }),
        expect.objectContaining({
          section: "Materials",
          label: "Material outside fixture",
          subsection: "Indirect",
        }),
      ]),
    );
    expect(JSON.stringify(customRows)).not.toContain("-999");
  });

  it("reimports HSE-compatible custom rows without duplicating deterministic rows", async () => {
    resetMonthlyState();
    const workbook = addHseFixtureWorkbook();
    await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));
    const firstPayload = getUpsertPayloads();
    const firstCustomIds = new Set((firstPayload.customRows as Array<{ id: string }>).map((row) => row.id));

    vi.clearAllMocks();
    resetMonthlyState();
    prismaMock.systemParameter.findUnique
      .mockResolvedValueOnce({ valueJson: firstPayload.layout })
      .mockResolvedValueOnce({ valueJson: firstPayload.customRows });

    const summary = await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));
    const secondPayload = getUpsertPayloads();
    const secondCustomIds = new Set((secondPayload.customRows as Array<{ id: string }>).map((row) => row.id));

    expect(summary.errors).toEqual([]);
    expect(summary.indicatorsCreated).toBe(0);
    expect(secondCustomIds).toEqual(firstCustomIds);
    expect((secondPayload.customRows as Array<unknown>).length).toBe((firstPayload.customRows as Array<unknown>).length);
  });

  it("returns a clear error for unrecognized Excel formats", async () => {
    resetMonthlyState();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Random sheet");
    sheet.getCell("A1").value = "No supported format";

    const summary = await MonthlyInputExcelService.importFromExcel("plant-1", await workbookBuffer(workbook));

    expect(summary.errors).toEqual([
      expect.objectContaining({
        sheet: "Workbook",
        column: "Format",
        message: expect.stringContaining("Workbook format was not recognized"),
      }),
    ]);
    expect(prismaMock.plantMonthlyInput.upsert).not.toHaveBeenCalled();
  });

  it("exports an HSE-compatible template without invalid 44 placeholders", async () => {
    resetMonthlyState();

    const buffer = await MonthlyInputExcelService.buildExport({
      plantId: "plant-1",
      plantCode: "pl1",
      plantName: "Plant 1",
      year: 2026,
      templateOnly: true,
    });
    const workbook = await workbookFromBuffer(buffer);
    const sheetNames = workbook.worksheets.filter((sheet) => sheet.state !== "hidden" && sheet.state !== "veryHidden").map((sheet) => sheet.name);

    expect(sheetNames).toEqual(expect.arrayContaining(["Sustainability data entry", "Standard hours", "Log-Mat-Sold"]));
    expect(workbook.getWorksheet("Sustainability data entry")?.getColumn(1).hidden).toBe(true);
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          expect(cell.value).not.toBe(44);
          expect(cell.value).not.toBe("44");
        });
      });
    }
  });
});
