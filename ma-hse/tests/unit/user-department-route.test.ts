import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), plant: vi.fn(), audit: vi.fn(),
  area: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  role: { findUnique: vi.fn() },
  userPlantRole: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("@/lib/rbac/guards", () => ({ requirePlantAccess: mocks.auth }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: mocks.plant }));
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit, buildDiff: (before: unknown, after: unknown) => ({ before, after }) }));
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("hash") }));
vi.mock("@/lib/services/email-service", () => ({ EmailService: { sendTemporaryPassword: vi.fn() } }));
vi.mock("@/lib/server-ui-language", () => ({ getServerUiLocale: vi.fn().mockResolvedValue("pt") }));
vi.mock("@/lib/services/master-data-translation-service", () => ({ localizeMasterDataRows: vi.fn((_type, rows) => rows) }));

import { POST as postRoute, GET as usersRoute } from "@/app/api/plants/[plantCode]/admin/users/route";
import { PATCH as patchRoute } from "@/app/api/plants/[plantCode]/admin/users/[userId]/route";
import { GET as departmentsRoute } from "@/app/api/plants/[plantCode]/admin/users/departments/route";

function checkedRoute<Args extends unknown[]>(route: (...args: Args) => Promise<Response | undefined>) {
  return async (...args: Args) => {
    const response = await route(...args);
    if (!response) throw new Error("Route did not return a response");
    return response;
  };
}
const POST = checkedRoute(postRoute);
const PATCH = checkedRoute(patchRoute);
const listUsers = checkedRoute(usersRoute);
const listDepartments = checkedRoute(departmentsRoute);

const departmentId = "11111111-1111-4111-8111-111111111111";
const user = { id: "user-1", email: "user@example.com", name: "Test User", language: "pt", isActive: true, forcePasswordChange: false, createdAt: new Date(), updatedAt: new Date() };
const context = () => ({ params: Promise.resolve({ plantCode: "pl01", userId: user.id }) });
const payload = (role: RoleCode = RoleCode.N2_PLANT_MANAGER) => ({ email: user.email, name: user.name, role, departmentId, password: "Custom123!" });
const request = (body: unknown, method = "POST") => new Request("http://localhost/api/plants/pl01/admin/users", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ role: RoleCode.N0_ADMIN, session: { user: { id: "admin" } } });
  mocks.plant.mockResolvedValue({ id: "plant-1" });
  mocks.area.findFirst.mockResolvedValue({ id: departmentId });
  mocks.role.findUnique.mockResolvedValue({ id: "role-1" });
  mocks.user.findUnique.mockResolvedValue(null);
  mocks.user.findFirst.mockResolvedValue(null);
  mocks.user.create.mockResolvedValue(user);
  mocks.user.update.mockResolvedValue(user);
  mocks.userPlantRole.findFirst.mockResolvedValue(null);
  mocks.userPlantRole.create.mockImplementation(async ({ data }) => ({ ...data, role: { code: RoleCode.N2_PLANT_MANAGER } }));
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
});

describe("user department assignment", () => {
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("rejects %s without a department before writing", async (role) => {
    const response = await POST(request({ ...payload(role), departmentId: undefined }), context());
    expect(response.status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive or other-plant departments", async () => {
    mocks.area.findFirst.mockResolvedValue(null);
    const response = await POST(request(payload()), context());
    expect(response.status).toBe(422);
    expect(mocks.area.findFirst).toHaveBeenCalledWith({ where: { id: departmentId, plantId: "plant-1", isActive: true }, select: { id: true } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("saves the selected department for %s", async (role) => {
    const response = await POST(request(payload(role)), context());
    expect(response.status).toBe(201);
    expect(mocks.userPlantRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: { userId: user.id, plantId: "plant-1", roleId: "role-1", departmentId } }));
    expect((await response.json()).data.user.departmentId).toBe(departmentId);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "UserPlantRole", diff: expect.objectContaining({ after: expect.objectContaining({ departmentId }) }) }));
  });

  it("does not attach a department to other roles", async () => {
    expect((await POST(request(payload(RoleCode.N5_OPERATOR)), context())).status).toBe(201);
    expect(mocks.area.findFirst).not.toHaveBeenCalled();
    expect(mocks.userPlantRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) }));
  });

  it("preserves the department in user listings", async () => {
    mocks.userPlantRole.findMany.mockResolvedValue([{ user, role: { code: RoleCode.N2_PLANT_MANAGER }, departmentId }]);
    const response = await listUsers(new Request("http://localhost"), context());
    expect((await response.json()).data.users[0].departmentId).toBe(departmentId);
  });

  it("updates the department when editing a user", async () => {
    mocks.userPlantRole.findFirst.mockResolvedValueOnce({ user: { ...user, plantRoles: [] }, role: { code: RoleCode.N2_PLANT_MANAGER }, departmentId: null });
    const response = await PATCH(request(payload(), "PATCH"), context());
    expect(response.status).toBe(200);
    expect((await response.json()).data.user.departmentId).toBe(departmentId);
  });

  it("rejects invalid department changes before updating", async () => {
    mocks.userPlantRole.findFirst.mockResolvedValueOnce({ user: { ...user, plantRoles: [] }, role: { code: RoleCode.N2_PLANT_MANAGER } });
    mocks.area.findFirst.mockResolvedValue(null);
    expect((await PATCH(request(payload(), "PATCH"), context())).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("loads dropdown options from active departments in the selected plant", async () => {
    mocks.area.findMany.mockResolvedValue([{ id: departmentId, code: "D1", name: "Production", sourceLanguage: "en" }]);
    const response = await listDepartments(new Request("http://localhost"), context());
    expect(response.status).toBe(200);
    expect(mocks.area.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { plantId: "plant-1", isActive: true } }));
    expect((await response.json()).data.departments).toEqual([{ id: departmentId, code: "D1", name: "Production" }]);
  });

  it("does not expose departments without permission", async () => {
    mocks.auth.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await listDepartments(new Request("http://localhost"), context())).status).toBe(403);
    expect(mocks.area.findMany).not.toHaveBeenCalled();
  });
});
