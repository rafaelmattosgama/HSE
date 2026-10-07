import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ topic: vi.fn(), workers: vi.fn(), create: vi.fn(), saveTopic: vi.fn(), createTopic: vi.fn(), records: vi.fn(), topics: vi.fn(), count: vi.fn(), user: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  plantTrainingRecord: { findMany: mocks.records },
  plantTrainingTopic: { findMany: mocks.topics },
  employeeDirectory: { count: mocks.count }, user: { findUnique: mocks.user },
} }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit, buildDiff: (before: unknown, after: unknown) => ({ before, after }) }));
import { PlantTrainingService } from "@/lib/services/plant-training-service";

const input = { occurredOn: "2026-10-06", topicId: "topic-1", category: "LEGAL_REQUIREMENT" as const, duration: "01:30", traineeId: "worker-1", trainerIds: ["worker-2", "worker-3"] };
const tx = { plantTrainingTopic: { findFirst: mocks.topic, update: mocks.saveTopic, create: mocks.createTopic }, employeeDirectory: { findMany: mocks.workers }, plantTrainingRecord: { create: mocks.create } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(callback => callback(tx));
  mocks.topic.mockResolvedValue({ id: "topic-1", plantId: "plant-1", name: "First aid", isActive: true });
  mocks.workers.mockResolvedValue([{ id: "worker-1", name: "Ana" }, { id: "worker-2", name: "Bruno" }, { id: "worker-3", name: "Carla" }]);
  mocks.create.mockResolvedValue({ id: "record-1" });
  mocks.records.mockResolvedValue([]); mocks.topics.mockResolvedValue([]); mocks.count.mockResolvedValue(10);
});

describe("plant training persistence", () => {
  it("validates the topic and every worker in the same plant before saving and auditing atomically", async () => {
    await PlantTrainingService.create("plant-1", input, "user-1");
    expect(mocks.topic).toHaveBeenCalledWith({ where: { id: "topic-1", plantId: "plant-1", isActive: true } });
    expect(mocks.workers).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["worker-2", "worker-3", "worker-1"] }, plantId: "plant-1", isActive: true } }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ plantId: "plant-1", durationMinutes: 90, traineeId: "worker-1", traineeName: "Ana", trainers: { create: [{ employeeId: "worker-2", name: "Bruno" }, { employeeId: "worker-3", name: "Carla" }] } }) });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "record-1", actorUserId: "user-1", plantId: "plant-1" }), tx);
  });
  it("stores a manual trainee separately without enrolling them into Competences", async () => {
    mocks.workers.mockResolvedValue([{ id: "worker-2", name: "Bruno" }, { id: "worker-3", name: "Carla" }]);
    await PlantTrainingService.create("plant-1", { ...input, traineeId: null, traineeName: "Visitor Name" }, "user-1");
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ traineeId: null, traineeName: "Visitor Name" }) });
  });
  it("rejects inactive or foreign-plant topics", async () => {
    mocks.topic.mockResolvedValue(null);
    await expect(PlantTrainingService.create("plant-1", input, "user-1")).rejects.toThrow("TRAINING_TOPIC_UNAVAILABLE");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects any missing, inactive or foreign-plant worker", async () => {
    mocks.workers.mockResolvedValue([{ id: "worker-1", name: "Ana" }]);
    await expect(PlantTrainingService.create("plant-1", input, "user-1")).rejects.toThrow("TRAINING_WORKER_UNAVAILABLE");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("cannot edit a topic from another plant", async () => {
    mocks.topic.mockResolvedValue(null);
    await expect(PlantTrainingService.saveTopic("plant-1", { id: "foreign", name: "New name", isActive: true }, "user-1")).rejects.toThrow("TRAINING_TOPIC_UNAVAILABLE");
    expect(mocks.saveTopic).not.toHaveBeenCalled();
    expect(mocks.createTopic).not.toHaveBeenCalled();
  });
  it("deactivates catalog entries without deleting training history", async () => {
    mocks.saveTopic.mockResolvedValue({ id: "topic-1", isActive: false });
    await PlantTrainingService.saveTopic("plant-1", { id: "topic-1", name: "First aid", isActive: false }, "user-1");
    expect(mocks.saveTopic).toHaveBeenCalledWith({ where: { id: "topic-1" }, data: { name: "First aid", isActive: false } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE" }), tx);
  });
  it.each(["worker-1", null])("N5 sees only their linked worker (%s), while indicators use anonymous plant totals", async employeeDirectoryId => {
    mocks.user.mockResolvedValue({ employeeDirectoryId });
    await PlantTrainingService.list("plant-1", { role: RoleCode.N5_OPERATOR, userId: "user-1" });
    expect(mocks.records).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { plantId: "plant-1", traineeId: employeeDirectoryId ?? "" } }));
    expect(mocks.records).toHaveBeenNthCalledWith(2, { where: { plantId: "plant-1" }, select: { occurredOn: true, category: true, durationMinutes: true } });
    expect(mocks.count).toHaveBeenCalledWith({ where: { plantId: "plant-1", isActive: true } });
  });
});
