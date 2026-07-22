import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const importServiceMock = vi.hoisted(() => ({
  importFromExcel: vi.fn(),
  buildExport: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn((before: unknown, after: unknown) => ({ before, after, fieldsChanged: [] })),
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/master-data-import-service", () => ({ MasterDataImportService: importServiceMock }));
vi.mock("@/lib/audit", () => auditMock);

import { POST as importMasterData } from "@/app/api/plants/[plantCode]/admin/master-data/import/route";
import { GET as exportMasterData } from "@/app/api/plants/[plantCode]/admin/master-data/template/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "pl1" }) };
}

function authenticatedRole(role: RoleCode) {
  return {
    session: {
      user: {
        id: `user-${role}`,
        language: "pt",
        plantRoles: [{ plantId: "plant-1", plantCode: "pl1", role }],
      },
    },
    role,
    plantId: "plant-1",
  };
}

describe("master data Excel routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows N3 to import the Equipment sheet for its authorized plant and audits the import", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(authenticatedRole(RoleCode.N3_SAFETY));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    importServiceMock.importFromExcel.mockResolvedValue({
      departments: 0,
      workstations: 0,
      equipments: 1,
      workers: 0,
    });
    const formData = new FormData();
    formData.append("file", new File(["excel"], "master-data.xlsx"));

    const response = await importMasterData(
      new Request("http://localhost/api/plants/pl1/admin/master-data/import", {
        method: "POST",
        body: formData,
      }),
      routeContext(),
    );

    expect(importServiceMock.importFromExcel).toHaveBeenCalledWith(
      "plant-1",
      expect.any(Uint8Array),
      { includeEquipments: true },
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "MasterDataImport",
      action: "IMPORT",
      actorUserId: `user-${RoleCode.N3_SAFETY}`,
      plantId: "plant-1",
    }));
    expect(response.status).toBe(200);
  });

  it("exports Equipment for N3 but excludes it for N2", async () => {
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    importServiceMock.buildExport.mockResolvedValue(Buffer.from("excel"));
    guardsMock.requirePlantAccess.mockResolvedValueOnce(authenticatedRole(RoleCode.N3_SAFETY));

    const n3Response = await exportMasterData(
      new Request("http://localhost/api/plants/pl1/admin/master-data/template"),
      routeContext(),
    );

    expect(importServiceMock.buildExport).toHaveBeenLastCalledWith("plant-1", { includeEquipments: true, locale: "pt" });
    expect(n3Response.status).toBe(200);

    guardsMock.requirePlantAccess.mockResolvedValueOnce(authenticatedRole(RoleCode.N2_PLANT_MANAGER));
    const n2Response = await exportMasterData(
      new Request("http://localhost/api/plants/pl1/admin/master-data/template"),
      routeContext(),
    );

    expect(importServiceMock.buildExport).toHaveBeenLastCalledWith("plant-1", { includeEquipments: false, locale: "pt" });
    expect(n2Response.status).toBe(200);
  });
});
