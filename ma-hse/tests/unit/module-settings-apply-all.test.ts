import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModuleToggles } from "@/lib/modules";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  transaction: vi.fn(),
  plants: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));

import { POST } from "@/app/api/admin/modules/apply-all/route";

const tx = {
  plant: { findMany: mocks.plants },
  systemParameter: { upsert: mocks.upsert },
};

function request(modules: Record<string, unknown> = resolveModuleToggles({ SEWO: false })) {
  return new Request("http://localhost/api/admin/modules/apply-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modules }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "admin", plantRoles: [{ role: RoleCode.N0_ADMIN }] } });
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.plants.mockResolvedValue([{ id: "selected" }, { id: "overridden" }, { id: "inactive" }]);
});

describe("apply modules to all plants", () => {
  it("replaces existing overrides and creates missing configurations for every plant in one audited transaction", async () => {
    const modules = resolveModuleToggles({ SEWO: false, MAPA: false });
    const response = await POST(request(modules));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ ok: true, data: { modules, plantCount: 3 } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.plants).toHaveBeenCalledWith({ select: { id: true } });
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    for (const plantId of ["selected", "overridden", "inactive"]) {
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { plantId_key: { plantId, key: "MODULE_TOGGLES" } },
        update: { valueJson: modules },
        create: { plantId, key: "MODULE_TOGGLES", valueJson: modules },
      });
    }
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "admin",
      action: "APPLY_MODULES_TO_ALL_PLANTS",
      diff: { after: { modules, plantIds: ["selected", "overridden", "inactive"] }, fieldsChanged: ["modules"] },
    }), tx);
  });

  it.each([RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY])("denies %s without starting a transaction", async (role) => {
    mocks.session.mockResolvedValue({ user: { plantRoles: [{ role }] } });
    expect((await POST(request()))?.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request()))?.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { SEWO: false },
    { ...resolveModuleToggles(), SEWO: "false" },
    { ...resolveModuleToggles(), UNKNOWN: true },
  ])("rejects incomplete or invalid selections before writing", async (modules) => {
    expect((await POST(request(modules)))?.status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
