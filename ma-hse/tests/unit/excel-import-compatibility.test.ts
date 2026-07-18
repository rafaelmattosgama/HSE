import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  area: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  equipment: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  employeeDirectory: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  workstation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { MasterDataImportService } from "@/lib/services/master-data-import-service";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";

const occupationalWorkerRow = {
  id: "worker-1",
  plantId: "plant-1",
  employeeNo: "1001",
  name: "Maria Silva",
  birthDate: new Date("1970-01-01T00:00:00.000Z"),
  workstationId: "ws-1",
  workstationName: "Linha 1",
  gender: "FEMALE",
  hireDate: new Date("2020-01-01T00:00:00.000Z"),
  roleStartDate: new Date("2021-01-01T00:00:00.000Z"),
  roleName: "Operadora",
  nationality: "Portugal",
  examDate: new Date("2026-04-01T00:00:00.000Z"),
  validUntil: new Date("2027-04-01T00:00:00.000Z"),
  status: "VALID",
  observation: "Sem restricoes",
  isActive: true,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
};

async function loadWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(new Uint8Array(buffer));
  return workbook;
}

async function workbookBuffer(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

describe("importable Excel compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.area.findMany.mockResolvedValue([{ code: "DEP1", name: "Producao" }]);
    prismaMock.area.upsert.mockResolvedValue({});
    prismaMock.equipment.findMany.mockResolvedValue([{ code: "EQ1", name: "Empilhador 1" }]);
    prismaMock.equipment.upsert.mockResolvedValue({});
    prismaMock.employeeDirectory.findMany.mockResolvedValue([{ employeeNo: "1001", name: "Maria Silva", dept: "Producao" }]);
    prismaMock.employeeDirectory.upsert.mockResolvedValue({});
    prismaMock.workstation.findFirst.mockResolvedValue({ id: "ws-1" });
    prismaMock.workstation.findMany.mockResolvedValue([{ code: "WS1", name: "Linha 1" }]);
    prismaMock.workstation.upsert.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation((operations: unknown[]) => Promise.all(operations as Promise<unknown>[]));
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.$queryRaw.mockResolvedValue([occupationalWorkerRow]);
  });

  it("imports data filled into the downloaded master data template", async () => {
    const template = await MasterDataImportService.buildTemplate();
    const workbook = await loadWorkbook(template);

    workbook.getWorksheet("Departments")!.getRow(4).values = ["DEP1", "Producao"];
    workbook.getWorksheet("Workstations")!.getRow(4).values = ["WS1", "Linha 1"];
    workbook.getWorksheet("Equipment")!.getRow(4).values = ["EQ1", "Empilhador 1"];
    workbook.getWorksheet("Workers")!.getRow(4).values = ["1001", "Maria Silva", "Producao"];

    const summary = await MasterDataImportService.importFromExcel("plant-1", new Uint8Array(await workbookBuffer(workbook)));

    expect(summary).toEqual({
      departments: 1,
      workstations: 1,
      equipments: 1,
      workers: 1,
    });
    expect(prismaMock.area.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.workstation.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.equipment.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.employeeDirectory.upsert).toHaveBeenCalledTimes(1);
  });

  it("exports master data with the equipment sheet populated", async () => {
    const exported = await MasterDataImportService.buildExport("plant-1");
    const workbook = await loadWorkbook(exported);

    expect(workbook.getWorksheet("Departments")!.getRow(4).values).toEqual([, "DEP1", "Producao"]);
    expect(workbook.getWorksheet("Workstations")!.getRow(4).values).toEqual([, "WS1", "Linha 1"]);
    expect(workbook.getWorksheet("Equipment")!.getRow(4).values).toEqual([, "EQ1", "Empilhador 1"]);
    expect(workbook.getWorksheet("Workers")!.getRow(4).values).toEqual([, "1001", "Maria Silva", "Producao"]);
  });

  it("includes equipment in N3-compatible imports and can exclude it for roles without permission", async () => {
    const template = await MasterDataImportService.buildTemplate();
    const workbook = await loadWorkbook(template);

    workbook.getWorksheet("Departments")!.getRow(4).values = ["DEP1", "Producao"];
    workbook.getWorksheet("Equipment")!.getRow(4).values = ["EQ1", "Empilhador 1"];

    const summary = await MasterDataImportService.importFromExcel(
      "plant-1",
      new Uint8Array(await workbookBuffer(workbook)),
      { includeEquipments: false },
    );

    expect(summary).toEqual({
      departments: 1,
      workstations: 0,
      equipments: 0,
      workers: 0,
    });
    expect(prismaMock.equipment.upsert).not.toHaveBeenCalled();
  });

  it("does not expose equipment in exports for roles without equipment permission", async () => {
    prismaMock.equipment.findMany.mockResolvedValueOnce([]);

    const exported = await MasterDataImportService.buildExport("plant-1", { includeEquipments: false });
    const workbook = await loadWorkbook(exported);

    expect(prismaMock.equipment.findMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1", isActive: true, id: { in: [] } },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: { code: true, name: true },
    });
    expect(workbook.getWorksheet("Equipment")!.getRow(4).values).toEqual([, "", ""]);
  });

  it("imports data filled into the downloaded occupational health template", async () => {
    const template = await OccupationalHealthService.buildImportTemplate("plant-1", "pl01");
    const workbook = await loadWorkbook(template);
    const sheet = workbook.getWorksheet("Medicina do Trabalho")!;

    sheet.getRow(7).values = [
      "1001",
      "Maria Silva",
      "1970-01-01",
      "",
      "Operadora",
      "Operadora",
      "Linha 1",
      "Feminino",
      "Portugal",
      "2020-01-01",
      "2021-01-01",
      "2026-04-01",
      "",
      "VALID",
      "Sem restricoes",
    ];

    const summary = await OccupationalHealthService.importFromExcel("plant-1", new Uint8Array(await workbookBuffer(workbook)));

    expect(summary).toEqual({ imported: 1, skipped: 0 });
    expect(prismaMock.workstation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ equals: "Linha 1" }),
        }),
      }),
    );
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("imports the occupational health Excel export back into the importer", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([occupationalWorkerRow]).mockResolvedValueOnce([occupationalWorkerRow]);

    const exported = await OccupationalHealthService.buildExport("plant-1", "pl01");
    const summary = await OccupationalHealthService.importFromExcel("plant-1", new Uint8Array(exported.xlsx));

    expect(summary).toEqual({ imported: 1, skipped: 0 });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
