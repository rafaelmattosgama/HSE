import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), plant: vi.fn(), create: vi.fn(), list: vi.fn(), topic: vi.fn() }));
vi.mock("@/lib/rbac/guards", () => ({ requirePlantAccess: mocks.guard }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: mocks.plant }));
vi.mock("@/lib/services/plant-training-service", () => ({ PlantTrainingService: { create: mocks.create, list: mocks.list, saveTopic: mocks.topic }, PlantTrainingError: class extends Error {} }));
import { GET, POST } from "@/app/api/plants/[plantCode]/competences/training-records/route";
import { POST as saveTopic } from "@/app/api/plants/[plantCode]/admin/training-topics/route";
import { TRAINING_REGISTER_ROLES, TRAINING_VIEW_ROLES } from "@/lib/rbac/plant-training";

const context = { params: Promise.resolve({ plantCode: "pt01" }) };
const id = "11111111-1111-4111-8111-111111111111";
const payload = { occurredOn: "2026-10-06", topicId: id, category: "SAFETY_CULTURE", duration: "02:30", traineeName: "Visitor", trainerIds: [id] };
const request = (body: unknown) => new Request("http://localhost/api/training", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ role: RoleCode.N3_SAFETY, session: { user: { id: "user-1" } } });
  mocks.plant.mockResolvedValue({ id: "plant-1" });
  mocks.create.mockResolvedValue({ id: "record-1" }); mocks.topic.mockResolvedValue({ id });
});

describe("training API authorization and validation", () => {
  it("uses the existing training registration roles and passes the authenticated actor", async () => {
    const response = await POST(request(payload), context);
    expect(response?.status).toBe(201);
    expect(mocks.guard).toHaveBeenCalledWith("pt01", TRAINING_REGISTER_ROLES);
    expect(TRAINING_REGISTER_ROLES).not.toContain(RoleCode.N5_OPERATOR);
    expect(TRAINING_REGISTER_ROLES).not.toContain(RoleCode.N2_PLANT_MANAGER);
    expect(mocks.create).toHaveBeenCalledWith("plant-1", payload, "user-1");
  });
  it("rejects bad durations before reaching persistence", async () => {
    const response = await POST(request({ ...payload, duration: "03:99" }), context);
    expect(response?.status).toBe(422); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes N5 identity to the service read scope", async () => {
    mocks.guard.mockResolvedValue({ role: RoleCode.N5_OPERATOR, session: { user: { id: "operator" } } });
    mocks.list.mockResolvedValue({ records: [] });
    expect((await GET(request({}), context))?.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith("pt01", TRAINING_VIEW_ROLES);
    expect(mocks.list).toHaveBeenCalledWith("plant-1", { role: RoleCode.N5_OPERATOR, userId: "operator" });
  });
  it("propagates access rejection without reading or writing data", async () => {
    mocks.guard.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await GET(request({}), context))?.status).toBe(403);
    expect((await POST(request(payload), context))?.status).toBe(403);
    expect((await saveTopic(request({ name: "Topic" }), context))?.status).toBe(403);
    expect(mocks.plant).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps N0 catalog support read-only and lets N3 define themes", async () => {
    mocks.guard.mockResolvedValue({ role: RoleCode.N0_ADMIN, session: { user: { id: "admin" } } });
    expect((await saveTopic(request({ name: "First aid" }), context))?.status).toBe(403);
    expect(mocks.topic).not.toHaveBeenCalled();
    mocks.guard.mockResolvedValue({ role: RoleCode.N3_SAFETY, session: { user: { id: "safety" } } });
    expect((await saveTopic(request({ name: "First aid" }), context))?.status).toBe(201);
    expect(mocks.topic).toHaveBeenCalledWith("plant-1", { name: "First aid", isActive: true }, "safety");
  });
});
