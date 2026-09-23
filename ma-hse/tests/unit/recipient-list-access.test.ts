import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  plant: vi.fn(),
  db: {
    reportRecipientList: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    reportRecipient: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mocks.session }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: mocks.plant }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { GET, POST } from "@/app/api/plants/[plantCode]/admin/recipients/route";
import { GET as sewoGet, POST as sewoPost, DELETE as sewoDelete } from "@/app/api/plants/[plantCode]/admin/sewo-report-recipients/route";

const context = { params: Promise.resolve({ plantCode: "maap" }) };
const listId = "11111111-1111-4111-8111-111111111111";
function setRole(role: RoleCode) {
  mocks.session.mockResolvedValue({ user: { id: "admin", plantRoles: [{ plantId: "plant-1", plantCode: "maap", role }] } });
}
function request(body: unknown = {}) {
  return new Request("http://localhost/api/plants/maap/admin/recipients", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  setRole(RoleCode.N0_ADMIN);
  mocks.plant.mockResolvedValue({ id: "plant-1" });
  mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
});

describe("recipient list access and plant isolation", () => {
  it.each([RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("denies %s access to both recipient APIs", async role => {
    setRole(role);
    for (const handler of [GET, POST, sewoGet, sewoPost, sewoDelete]) {
      const response = await handler(request(), context);
      expect(response?.status).toBe(403);
    }
    expect(mocks.plant).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("lists only the selected plant's lists for N0", async () => {
    mocks.db.reportRecipientList.findMany.mockResolvedValue([]);
    expect((await GET(request(), context))?.status).toBe(200);
    expect(mocks.db.reportRecipientList.findMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1", scope: "PLANT" }, include: { recipients: true },
    });
  });

  it("creates a plant list with normalized emails and an audit record", async () => {
    mocks.db.reportRecipientList.create.mockResolvedValue({ id: listId, plantId: "plant-1" });
    const response = await POST(request({ listName: "External reports", scope: "PLANT", recipients: [{ email: " Person@Example.com " }] }), context);
    expect(response?.status).toBe(200);
    expect(mocks.db.reportRecipientList.create).toHaveBeenCalledWith({
      data: { plantId: "plant-1", scope: "PLANT", name: "External reports", recipients: { createMany: { data: [{ email: "person@example.com", language: "en" }] } } },
      include: { recipients: true },
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plantId: "plant-1", actorUserId: "admin", action: "CREATE" }) }));
  });

  it("does not update a global list or a list belonging to another plant", async () => {
    mocks.db.reportRecipientList.findFirst.mockResolvedValue(null);
    const response = await POST(request({ listId, listName: "Other", scope: "PLANT", recipients: [] }), context);
    expect(response?.status).toBe(404);
    expect(mocks.db.reportRecipientList.findFirst).toHaveBeenCalledWith({ where: { id: listId, plantId: "plant-1", scope: "PLANT" }, include: { recipients: true } });
    expect(mocks.db.reportRecipientList.update).not.toHaveBeenCalled();
    expect(mocks.db.reportRecipientList.create).not.toHaveBeenCalled();
  });

  it.each([
    { scope: "CORPORATE", recipients: [] },
    { scope: "PLANT", recipients: [{ email: "invalid" }] },
    { scope: "PLANT", recipients: [{ email: "person@example.com" }, { email: "PERSON@example.com" }] },
  ])("rejects invalid or non-plant list input: %j", async input => {
    const response = await POST(request({ listName: "Reports", ...input }), context);
    expect(response?.status).toBe(422);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("loads the editable S-EWO list for the selected plant only", async () => {
    mocks.db.reportRecipientList.findFirst.mockResolvedValue({ id: listId });
    mocks.db.reportRecipient.findMany.mockResolvedValue([]);
    expect((await sewoGet(request(), context))?.status).toBe(200);
    expect(mocks.db.reportRecipientList.findFirst).toHaveBeenCalledWith({
      where: { plantId: "plant-1", scope: "PLANT", name: "S-EWO External Reports" }, orderBy: { createdAt: "asc" },
    });
  });

  it("rejects editing an S-EWO recipient from another plant", async () => {
    mocks.db.reportRecipientList.findFirst.mockResolvedValue({ id: listId });
    mocks.db.reportRecipient.findFirst.mockResolvedValue(null);
    const response = await sewoPost(request({ id: listId, name: "Person", email: "person@example.com", language: "pt" }), context);
    expect(response?.status).toBe(404);
    expect(mocks.db.reportRecipient.update).not.toHaveBeenCalled();
  });
});
