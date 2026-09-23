import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_REQUEST_PATH_HEADER, ROLE_MODULE_TOGGLES_PARAMETER_KEY } from "@/lib/role-modules";
import { MODULE_TOGGLES_PARAMETER_KEY } from "@/lib/modules";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), plant: vi.fn(), headers: vi.fn(),
  db: { systemParameter: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mocks.session }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: mocks.plant }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { GET, POST } from "@/app/api/plants/[plantCode]/admin/role-modules/route";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getUserRoleModules, isRoleModuleRequestAllowed } from "@/lib/services/role-module-service";

const context = { params: Promise.resolve({ plantCode: "maap" }) };
function plantRole(role: RoleCode, plantCode = "maap") { return { role, plantCode, plantId: `id-${plantCode}` }; }
function setRole(role: RoleCode, plantCode = "maap") { mocks.session.mockResolvedValue({ user: { id: "user-1", plantRoles: [plantRole(role, plantCode)] } }); }
function request(roles: unknown) { return new Request("http://localhost/api/plants/maap/admin/role-modules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roles }) }); }

beforeEach(() => {
  vi.resetAllMocks();
  setRole(RoleCode.N3_SAFETY);
  mocks.plant.mockResolvedValue({ id: "id-maap" });
  mocks.headers.mockResolvedValue(new Headers({ [MODULE_REQUEST_PATH_HEADER]: "/api/plants/maap/admin/role-modules" }));
  mocks.db.systemParameter.findFirst.mockResolvedValue(null);
  mocks.db.systemParameter.findUnique.mockResolvedValue(null);
  mocks.db.systemParameter.upsert.mockResolvedValue({ id: "setting-1" });
  mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
});

describe("N3 module management", () => {
  it("saves independent profile choices only in N3's factory and audits the change", async () => {
    const response = await POST(request({ N4_SUPERVISOR: { ACTIONS: false }, N5_OPERATOR: { ACTIONS: true }, N6_HR: { SEWO: false } }), context);
    expect(response?.status).toBe(200);
    const body = await response!.json();
    expect(body.data.roles.N4_SUPERVISOR.ACTIONS).toBe(false);
    expect(body.data.roles.N5_OPERATOR.ACTIONS).toBe(true);
    expect(body.data.roles.N6_HR.SEWO).toBe(false);
    expect(mocks.db.systemParameter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId_key: { plantId: "id-maap", key: ROLE_MODULE_TOGGLES_PARAMETER_KEY } },
      create: expect.objectContaining({ plantId: "id-maap", key: ROLE_MODULE_TOGGLES_PARAMETER_KEY }),
    }));
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plantId: "id-maap", actorUserId: "user-1" }) }));
  });

  it.each([RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("rejects management by %s", async role => {
    setRole(role);
    expect((await GET(request({}), context))?.status).toBe(403);
    expect((await POST(request({}), context))?.status).toBe(403);
    expect(mocks.db.systemParameter.upsert).not.toHaveBeenCalled();
  });

  it("denies N3 from another factory", async () => {
    setRole(RoleCode.N3_SAFETY, "other");
    expect((await POST(request({ N4_SUPERVISOR: { ACTIONS: false } }), context))?.status).toBe(403);
    expect(mocks.plant).not.toHaveBeenCalled();
  });

  it("rechecks plant authorization on save and rejects stale or forged activation", async () => {
    mocks.db.systemParameter.findUnique.mockImplementation(async ({ where }) => where.plantId_key.key === MODULE_TOGGLES_PARAMETER_KEY ? { valueJson: { ACTIONS: false } } : null);
    const response = await POST(request({ N4_SUPERVISOR: { ACTIONS: true } }), context);
    expect(response?.status).toBe(403);
    expect(mocks.db.systemParameter.upsert).not.toHaveBeenCalled();
  });

  it("does not grant modules outside the profile's permissions", async () => {
    expect((await POST(request({ N5_OPERATOR: { OCCUPATIONAL_HEALTH: true } }), context))?.status).toBe(403);
    expect(mocks.db.systemParameter.upsert).not.toHaveBeenCalled();
  });

  it("preserves another profile's saved settings on partial updates", async () => {
    mocks.db.systemParameter.findUnique.mockImplementation(async ({ where }) => where.plantId_key.key === ROLE_MODULE_TOGGLES_PARAMETER_KEY ? { valueJson: { N6_HR: { ACTIONS: false } } } : null);
    const response = await POST(request({ N4_SUPERVISOR: { ACTIONS: false } }), context);
    expect((await response!.json()).data.roles.N6_HR.ACTIONS).toBe(false);
  });
});

describe("effective access for users", () => {
  beforeEach(() => {
    mocks.db.systemParameter.findUnique.mockImplementation(async ({ where }) => where.plantId_key.key === ROLE_MODULE_TOGGLES_PARAMETER_KEY && where.plantId_key.plantId === "id-maap"
      ? { valueJson: { N4_SUPERVISOR: { ACTIONS: false } } } : null);
  });

  it("blocks the API and direct page for a disabled module", async () => {
    setRole(RoleCode.N4_SUPERVISOR);
    mocks.headers.mockResolvedValue(new Headers({ [MODULE_REQUEST_PATH_HEADER]: "/api/plants/maap/actions/123/close" }));
    const auth = await requirePlantAccess("maap", [RoleCode.N4_SUPERVISOR]);
    expect("error" in auth && auth.error?.status).toBe(403);
    expect(await isRoleModuleRequestAllowed("/app/maap/actions", [plantRole(RoleCode.N4_SUPERVISOR)])).toBe(false);
  });

  it("keeps other profiles and other factories independent", async () => {
    expect(await isRoleModuleRequestAllowed("/app/maap/actions", [plantRole(RoleCode.N5_OPERATOR)])).toBe(true);
    expect(await isRoleModuleRequestAllowed("/app/other/actions", [plantRole(RoleCode.N4_SUPERVISOR, "other")])).toBe(true);
    expect(await getUserRoleModules("maap", [plantRole(RoleCode.N3_SAFETY)])).toBeNull();
    expect(await getUserRoleModules("maap", [plantRole(RoleCode.N0_ADMIN)])).toBeNull();
  });

  it("does not let the all-factories view bypass a disabled factory", async () => {
    expect(await isRoleModuleRequestAllowed("/app/all/actions", [plantRole(RoleCode.N4_SUPERVISOR), plantRole(RoleCode.N4_SUPERVISOR, "other")])).toBe(false);
  });

  it("a later N0 plant restriction takes precedence over saved N3 activation", async () => {
    mocks.db.systemParameter.findUnique.mockImplementation(async ({ where }) => ({ valueJson: where.plantId_key.key === MODULE_TOGGLES_PARAMETER_KEY ? { ACTIONS: false } : { N5_OPERATOR: { ACTIONS: true } } }));
    expect(await isRoleModuleRequestAllowed("/app/maap/actions", [plantRole(RoleCode.N5_OPERATOR)])).toBe(false);
  });
});
