import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ plant: { findMany: vi.fn() }, communication: { findMany: vi.fn() }, systemParameter: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { getGroupSafetyDashboard, groupSafetyPlantWhere } from "@/lib/services/group-safety-dashboard-service";

describe("group safety authorized data scope", () => {
  beforeEach(() => { vi.clearAllMocks(); for (const model of Object.values(db)) model.findMany.mockResolvedValue([]); });
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR])("%s has identical indicators within the assigned scope in every query", async role => {
    const roles = [{ plantId: "a-id", plantCode: "a", role }];
    const where = { code: { in: ["a"] } };
    expect(groupSafetyPlantWhere(roles)).toEqual(where);
    await getGroupSafetyDashboard(roles, { from: new Date("2026-01-01"), to: new Date("2026-01-31") });
    expect(db.plant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(db.communication.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ plant: where }) }));
    expect(db.systemParameter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ plant: where }) }));
  });
  it.each([RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE])("%s retains global scope", role => {
    expect(groupSafetyPlantWhere([{ plantId: null, plantCode: null, role }])).toEqual({});
  });
  it("supports multi-plant roles and grants no plants to an empty role list", () => {
    expect(groupSafetyPlantWhere([])).toEqual({ code: { in: [] } });
    expect(groupSafetyPlantWhere([{ plantId: "a", plantCode: "a", role: RoleCode.N3_SAFETY }, { plantId: "b", plantCode: "b", role: RoleCode.N3_SAFETY }])).toEqual({ code: { in: ["a", "b"] } });
  });
  it("returns an empty dataset without creating or updating any record", async () => {
    const result = await getGroupSafetyDashboard([], { from: new Date("2026-01-01"), to: new Date("2026-01-31") }, new Date("2026-02-01"));
    expect(result).toEqual({ plants: [], loadedAt: "2026-02-01T00:00:00.000Z" });
    expect(db.plant.findMany).toHaveBeenCalledTimes(1);
  });
});
