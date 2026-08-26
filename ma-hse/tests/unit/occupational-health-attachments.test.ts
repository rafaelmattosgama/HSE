import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  occupationalHealthWorkerAttachment: {
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  workstation: {
    findFirst: vi.fn(),
  },
  // Not enrolled in Competências by default — these tests exercise the
  // attachments flow only, see occupational-health-competence-sync.test.ts
  // for the CompetenceWorker.roleName propagation behavior itself.
  employeeDirectory: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { OccupationalHealthService } from "@/lib/services/occupational-health-service";

const WORKER_ROW = {
  id: "worker-1",
  plantId: "plant-1",
  employeeNo: "1001",
  name: "Maria Silva",
  birthDate: new Date("1970-01-01T00:00:00.000Z"),
  workstationId: null,
  workstationName: null,
  gender: "FEMALE",
  hireDate: new Date("2020-01-01T00:00:00.000Z"),
  roleStartDate: new Date("2021-01-01T00:00:00.000Z"),
  roleName: "Operadora",
  nationality: "Portugal",
  examDate: new Date("2026-04-01T00:00:00.000Z"),
  validUntil: new Date("2027-04-01T00:00:00.000Z"),
  status: "VALID",
  observation: null,
  isActive: true,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
};

function baseInput() {
  return {
    employeeNo: "1001",
    name: "Maria Silva",
    birthDate: new Date("1970-01-01"),
    workstationId: null,
    gender: "FEMALE" as const,
    hireDate: new Date("2020-01-01"),
    roleStartDate: new Date("2021-01-01"),
    roleName: undefined,
    nationality: "Portugal",
    examDate: new Date("2026-04-01"),
    validUntil: undefined,
    status: "VALID" as const,
    observation: undefined,
    isActive: true,
  };
}

describe("OccupationalHealthService.upsert — attachments are additive only", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates new attachment rows with the actor as uploader, and returns the full merged list", async () => {
    prismaMock.$queryRaw.mockResolvedValue([WORKER_ROW]);
    prismaMock.occupationalHealthWorkerAttachment.createMany.mockResolvedValue({ count: 1 });
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([
      { id: "att-old", fileName: "old.pdf", contentType: "application/pdf", createdAt: new Date("2026-01-01") },
      { id: "att-new", fileName: "new.pdf", contentType: "application/pdf", createdAt: new Date("2026-04-01") },
    ]);

    const worker = await OccupationalHealthService.upsert(
      "plant-1",
      { ...baseInput(), newAttachments: [{ fileKey: "occupational-health/plant-1/new.pdf", fileName: "new.pdf", contentType: "application/pdf" }] },
      "worker-1",
      "user-1",
    );

    expect(prismaMock.occupationalHealthWorkerAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          occupationalHealthWorkerId: "worker-1",
          fileKey: "occupational-health/plant-1/new.pdf",
          fileName: "new.pdf",
          contentType: "application/pdf",
          uploadedById: "user-1",
        },
      ],
    });
    expect(worker.attachments.map((a) => a.id)).toEqual(["att-old", "att-new"]);
  });

  it("never deletes existing attachments — no newAttachments means no attachment write at all", async () => {
    prismaMock.$queryRaw.mockResolvedValue([WORKER_ROW]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([
      { id: "att-old", fileName: "old.pdf", contentType: "application/pdf", createdAt: new Date("2026-01-01") },
    ]);

    const worker = await OccupationalHealthService.upsert("plant-1", baseInput(), "worker-1", "user-1");

    expect(prismaMock.occupationalHealthWorkerAttachment.createMany).not.toHaveBeenCalled();
    expect(worker.attachments).toHaveLength(1);
  });
});

describe("OccupationalHealthService.list — groups attachments per worker", () => {
  afterEach(() => vi.clearAllMocks());

  it("attaches each worker's own documents, and an empty array when it has none", async () => {
    prismaMock.$queryRaw.mockResolvedValue([WORKER_ROW, { ...WORKER_ROW, id: "worker-2", employeeNo: "1002" }]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([
      { id: "att-1", occupationalHealthWorkerId: "worker-1", fileName: "exam.pdf", contentType: "application/pdf", createdAt: new Date("2026-01-01") },
    ]);

    const workers = await OccupationalHealthService.list("plant-1");

    const worker1 = workers.find((w) => w.id === "worker-1");
    const worker2 = workers.find((w) => w.id === "worker-2");
    expect(worker1?.attachments).toEqual([{ id: "att-1", fileName: "exam.pdf", contentType: "application/pdf", createdAt: "2026-01-01T00:00:00.000Z" }]);
    expect(worker2?.attachments).toEqual([]);
  });
});
