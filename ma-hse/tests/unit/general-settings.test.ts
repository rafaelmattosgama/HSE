import { RoleCode, type Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), audit: vi.fn(),
  db: {
    $transaction: vi.fn(), $executeRaw: vi.fn(),
    systemParameter: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    plant: { findMany: vi.fn(), count: vi.fn() },
    unsafeActType: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    unsafeConditionType: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    nearMissType: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    injuryType: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    riskTheme: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    reportRecipient: { findMany: vi.fn() }, reportRecipientList: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    userPlantRole: { create: vi.fn(), deleteMany: vi.fn() }, role: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("bcryptjs", () => ({ hash: async () => "hashed-password" }));

import { POST as saveCatalog, DELETE as deleteCatalog } from "@/app/api/admin/master-data/route";
import { POST as saveRecipient, DELETE as deleteRecipient } from "@/app/api/admin/sewo-report-recipients/route";
import { POST as saveUser } from "@/app/api/admin/users/route";
import { PATCH as updateUser } from "@/app/api/admin/users/[userId]/route";
import { applyGeneralCatalogsToNewPlant, generalCatalogKey } from "@/lib/services/general-settings-service";
import { listSewoReportRecipients } from "@/lib/services/sewo-recipient-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";

const plantA = "11111111-1111-4111-8111-111111111111";
const plantB = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";
const catalog = [{ id: "UA1", code: "UA1", name: "Old name", category: "Behaviour", isActive: true }];
let parameters: Map<string, unknown>;
const request = (body: unknown, method = "POST") => new Request("http://localhost/api/admin/config", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  parameters = new Map([[generalCatalogKey("unsafeActType"), catalog]]);
  mocks.session.mockResolvedValue({ user: { id: "admin", plantRoles: [{ role: RoleCode.N0_ADMIN }] } });
  mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
  mocks.db.systemParameter.findFirst.mockImplementation(async ({ where }) => parameters.has(where.key) ? { id: where.key, valueJson: parameters.get(where.key) } : null);
  mocks.db.systemParameter.update.mockImplementation(async ({ where, data }) => { parameters.set(where.id, data.valueJson); });
  mocks.db.systemParameter.create.mockImplementation(async ({ data }) => { parameters.set(data.key, data.valueJson); });
  mocks.db.plant.findMany.mockResolvedValue([{ id: plantA }, { id: plantB }]);
  mocks.db.plant.count.mockResolvedValue(2);
  mocks.db.reportRecipient.findMany.mockResolvedValue([]);
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.create.mockImplementation(async ({ data }) => ({ ...data, id: "new-user" }));
  mocks.db.role.findUnique.mockResolvedValue({ id: "role-id" });
});

describe("common N0 settings", () => {
  it.each([saveCatalog, saveRecipient, saveUser])("denies non-N0 writes before accessing configuration", async handler => {
    mocks.session.mockResolvedValue({ user: { plantRoles: [{ role: RoleCode.N1_CORPORATE }] } });
    expect((await handler(request({})))?.status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("applies a renamed common item to both plants while preserving their referenced row IDs", async () => {
    const response = await saveCatalog(request({ type: "unsafeActType", id: "UA1", code: "UA2", name: "New name", category: "Behaviour" }));
    expect(response?.status).toBe(200);
    expect(mocks.db.unsafeActType.updateMany).toHaveBeenCalledWith({ where: { code: "UA1" }, data: { code: "UA2" } });
    expect(mocks.db.unsafeActType.updateMany).toHaveBeenCalledWith({
      where: { plantId: { in: [plantA, plantB] }, code: "UA2" },
      data: { code: "UA2", name: "New name", category: "Behaviour", isActive: true },
    });
    expect(mocks.db.unsafeActType.createMany).toHaveBeenCalledWith({
      skipDuplicates: true, data: [plantA, plantB].map(plantId => ({ plantId, code: "UA2", name: "New name", category: "Behaviour", isActive: true })),
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "admin", action: "APPLY_TO_ALL_PLANTS" }), mocks.db);
  });

  it("retains disabled common entries for new plants and does not reactivate them through default seeding", async () => {
    expect((await deleteCatalog(request({ type: "unsafeActType", id: "UA1" }, "DELETE")))?.status).toBe(200);
    mocks.db.unsafeActType.createMany.mockClear();
    await applyGeneralCatalogsToNewPlant(mocks.db as unknown as Prisma.TransactionClient, "new-plant");
    expect(mocks.db.unsafeActType.createMany).toHaveBeenCalledWith({
      skipDuplicates: true, data: [{ plantId: "new-plant", code: "UA1", name: "Old name", category: "Behaviour", isActive: false }],
    });
    mocks.db.$transaction.mockClear();
    await ensureDefaultUnsafeActTypes("new-plant");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects plant-only catalogue types and duplicate codes without applying changes", async () => {
    expect((await saveCatalog(request({ type: "area", code: "A1", name: "Department" })))?.status).toBe(422);
    expect((await saveCatalog(request({ type: "unsafeActType", code: "UA1", name: "Duplicate" })))?.status).toBe(409);
    expect(mocks.db.unsafeActType.updateMany).not.toHaveBeenCalled();
  });

  it("uses a common S-EWO list for every plant and keeps an explicitly emptied list empty", async () => {
    parameters.set("GENERAL_SEWO_RECIPIENTS", [{ id: recipientId, email: "report@example.com", name: "Report", language: "pt" }]);
    const response = await saveRecipient(request({ id: recipientId, email: "REPORT@example.com", name: "Updated", language: "en" }));
    expect(response?.status).toBe(200);
    expect(await listSewoReportRecipients(plantA)).toEqual(await listSewoReportRecipients(plantB));
    expect((await listSewoReportRecipients(plantB))[0]).toMatchObject({ name: "Updated", email: "report@example.com", language: "en" });
    expect((await deleteRecipient(request({ id: recipientId }, "DELETE")))?.status).toBe(200);
    expect(await listSewoReportRecipients("future-plant")).toEqual([]);
    expect(mocks.db.reportRecipientList.findFirst).not.toHaveBeenCalled();
  });

  it("assigns N3 only to the chosen plants", async () => {
    const response = await saveUser(request({ email: "safety@example.com", name: "Safety", password: "initial-password", role: RoleCode.N3_SAFETY, plantIds: [plantA, plantB] }));
    expect(response?.status).toBe(200);
    expect(mocks.db.userPlantRole.create).toHaveBeenCalledTimes(2);
    for (const plantId of [plantA, plantB]) expect(mocks.db.userPlantRole.create).toHaveBeenCalledWith({ data: { userId: "new-user", roleId: "role-id", plantId } });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("initial-password");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("hashed-password");
  });

  it.each([RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE])("keeps %s independent of a plant", async role => {
    expect((await saveUser(request({ email: "global@example.com", name: "Global", password: "initial-password", role, plantIds: [plantA] })))?.status).toBe(200);
    expect(mocks.db.userPlantRole.create).toHaveBeenCalledExactlyOnceWith({ data: { userId: "new-user", roleId: "role-id", plantId: null } });
  });

  it("rejects N3 without plants and protects the current administrator from losing access", async () => {
    expect((await saveUser(request({ email: "safety@example.com", name: "Safety", password: "initial-password", role: RoleCode.N3_SAFETY })))?.status).toBe(422);
    const response = await updateUser(request({ email: "admin@example.com", name: "Admin", role: RoleCode.N1_CORPORATE }, "PATCH"), { params: Promise.resolve({ userId: "admin" }) });
    expect(response?.status).toBe(422);
    expect(mocks.db.userPlantRole.deleteMany).not.toHaveBeenCalled();
  });
});
