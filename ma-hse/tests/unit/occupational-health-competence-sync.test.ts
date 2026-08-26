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
  employeeDirectory: {
    findUnique: vi.fn(),
  },
  competenceWorker: {
    findUnique: vi.fn(),
  },
}));

const competenceServiceMock = vi.hoisted(() => ({
  CompetenceService: {
    updateWorkerRole: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/competence-service", () => competenceServiceMock);

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
    roleName: undefined as string | undefined,
    nationality: "Portugal",
    examDate: new Date("2026-04-01"),
    validUntil: undefined,
    status: "VALID" as const,
    observation: undefined,
    isActive: true,
  };
}

describe("OccupationalHealthService.upsert — propagates roleName to the linked CompetenceWorker", () => {
  afterEach(() => vi.clearAllMocks());

  it("propagates a changed role to the CompetenceWorker enrolled for the same employee", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ ...WORKER_ROW, roleName: "Técnico de Manutenção" }]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findUnique.mockResolvedValue({ id: "employee-1" });
    prismaMock.competenceWorker.findUnique.mockResolvedValue({ id: "competence-worker-1", roleName: null });

    await OccupationalHealthService.upsert(
      "plant-1",
      { ...baseInput(), roleName: "Técnico de Manutenção" },
      "worker-1",
      "user-1",
    );

    expect(prismaMock.employeeDirectory.findUnique).toHaveBeenCalledWith({
      where: { plantId_employeeNo: { plantId: "plant-1", employeeNo: "1001" } },
      select: { id: true },
    });
    expect(prismaMock.competenceWorker.findUnique).toHaveBeenCalledWith({
      where: { plantId_employeeDirectoryId: { plantId: "plant-1", employeeDirectoryId: "employee-1" } },
      select: { id: true, roleName: true },
    });
    expect(competenceServiceMock.CompetenceService.updateWorkerRole).toHaveBeenCalledWith(
      "plant-1",
      "competence-worker-1",
      { roleName: "Técnico de Manutenção" },
      "user-1",
    );
  });

  it("does not call CompetenceService when the worker isn't enrolled in Competências", async () => {
    prismaMock.$queryRaw.mockResolvedValue([WORKER_ROW]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findUnique.mockResolvedValue(null);

    await OccupationalHealthService.upsert("plant-1", { ...baseInput(), roleName: "Operadora" }, "worker-1", "user-1");

    expect(prismaMock.competenceWorker.findUnique).not.toHaveBeenCalled();
    expect(competenceServiceMock.CompetenceService.updateWorkerRole).not.toHaveBeenCalled();
  });

  it("skips the sync when the CompetenceWorker role already matches — avoids redundant recompute/audit noise", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ ...WORKER_ROW, roleName: "Operadora" }]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findUnique.mockResolvedValue({ id: "employee-1" });
    prismaMock.competenceWorker.findUnique.mockResolvedValue({ id: "competence-worker-1", roleName: "Operadora" });

    await OccupationalHealthService.upsert("plant-1", { ...baseInput(), roleName: "Operadora" }, "worker-1", "user-1");

    expect(competenceServiceMock.CompetenceService.updateWorkerRole).not.toHaveBeenCalled();
  });

  it("normalizes a cleared role to null before syncing, matching the CompetenceWorker schema constraint", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ ...WORKER_ROW, roleName: null }]);
    prismaMock.occupationalHealthWorkerAttachment.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findUnique.mockResolvedValue({ id: "employee-1" });
    prismaMock.competenceWorker.findUnique.mockResolvedValue({ id: "competence-worker-1", roleName: "Operadora" });

    await OccupationalHealthService.upsert("plant-1", { ...baseInput(), roleName: "" }, "worker-1", "user-1");

    expect(competenceServiceMock.CompetenceService.updateWorkerRole).toHaveBeenCalledWith(
      "plant-1",
      "competence-worker-1",
      { roleName: null },
      "user-1",
    );
  });
});
