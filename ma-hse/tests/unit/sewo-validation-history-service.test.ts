import { RoleCode, SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  userPlantRole: { findMany: vi.fn() },
  plant: { findMany: vi.fn() },
  sEWO: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/master-data-translation-service", () => ({
  localizeMasterDataRows: vi.fn(),
}));

import { getSewoValidationHistoryRows } from "@/lib/services/sewo-validation-service";

describe("S-EWO validation history service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns only Corporate decisions with creation and decision dates for N1", async () => {
    prismaMock.userPlantRole.findMany.mockResolvedValue([
      { role: { code: RoleCode.N1_CORPORATE } },
    ]);
    prismaMock.plant.findMany.mockResolvedValue([{ id: "plant-1" }]);
    prismaMock.sEWO.findMany.mockResolvedValue([
      {
        id: "sewo-1",
        codigoSewo: "sewo_PL01NM202601",
        createdAt: new Date("2026-08-15T09:00:00.000Z"),
        approvedAt: new Date("2026-08-16T10:00:00.000Z"),
        status: SEWOStatus.APPROVED,
        plant: { code: "pl01", name: "Plant 01" },
      },
    ]);

    const rows = await getSewoValidationHistoryRows({ userId: "n1-user", plantCode: "pl01" });

    expect(prismaMock.sEWO.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: { in: ["plant-1"] },
        status: { in: [SEWOStatus.APPROVED, SEWOStatus.REJECTED] },
      }),
    }));
    expect(rows).toEqual([{
      id: "sewo-1",
      code: "sewo_PL01NM202601",
      plantCode: "pl01",
      plantName: "Plant 01",
      createdAt: "2026-08-15T09:00:00.000Z",
      decisionAt: "2026-08-16T10:00:00.000Z",
      status: "APPROVED",
    }]);
  });

  it("does not expose the history to a user without N1", async () => {
    prismaMock.userPlantRole.findMany.mockResolvedValue([
      { role: { code: RoleCode.N3_SAFETY } },
    ]);

    await expect(getSewoValidationHistoryRows({ userId: "n3-user" })).resolves.toEqual([]);
    expect(prismaMock.plant.findMany).not.toHaveBeenCalled();
    expect(prismaMock.sEWO.findMany).not.toHaveBeenCalled();
  });
});
