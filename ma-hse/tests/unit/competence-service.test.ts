import { AuthorizationStatus, CompetenceAssessmentResult, CompetenceCategory, CompetenceCellState, CompetenceRequirementScope, RoleCode, TrainingResult } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  competenceWorker: {
    upsert: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
  },
  workerCompetenceState: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  competenceType: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  competenceRequirement: {
    create: vi.fn(),
    update: vi.fn(),
  },
  trainingRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  competenceAssessment: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  workerAuthorization: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  occupationalHealthWorker: {
    findUnique: vi.fn(),
  },
  competenceWorkerRequirement: {
    findUnique: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: typeof transactionMock) => Promise<unknown>) => callback(transactionMock)),
    employeeDirectory: {
      findMany: vi.fn(),
    },
    area: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    workstation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    competenceType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    competenceRequirement: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    competenceWorker: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    competenceAssessment: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    workerAuthorization: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    trainingRecord: {
      count: vi.fn(),
    },
    occupationalHealthWorker: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    workerCompetenceState: {
      groupBy: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn((before: unknown, after: unknown) => ({ before, after, fieldsChanged: [] })),
  writeAuditLog: vi.fn(),
}));

const masterDataMock = vi.hoisted(() => ({
  localizeMasterDataRows: vi.fn(async (_entityType: unknown, rows: Array<{ id: string; name: string }>) => rows),
}));

const parameterServiceMock = vi.hoisted(() => ({
  getCompetenceExpiringThresholdDays: vi.fn(async () => 90),
  getAuthorizationSegregationOfDuties: vi.fn(async () => true),
  getMedicalFitnessBlocksAuthorization: vi.fn(async () => false),
}));

const competenceAlertServiceMock = vi.hoisted(() => ({
  CompetenceAlertService: {
    dispatchAuthorizationSuspended: vi.fn(async () => 0),
    dispatchAuthorizationRevoked: vi.fn(async () => 0),
    dispatchRoleWithoutCompetence: vi.fn(async () => 0),
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/master-data-translation-service", () => masterDataMock);
vi.mock("@/lib/services/parameter-service", () => parameterServiceMock);
vi.mock("@/lib/services/competence-alert-service", () => competenceAlertServiceMock);

import { CompetenceService } from "@/lib/services/competence-service";

function stubRecomputeDependencies() {
  transactionMock.$executeRaw.mockResolvedValue(0);
  transactionMock.occupationalHealthWorker.findUnique.mockResolvedValue(null);
  transactionMock.competenceWorker.findMany.mockResolvedValue([]);
  transactionMock.competenceType.findUniqueOrThrow.mockResolvedValue({ id: "type-forklift", requiresAssessment: true });
  transactionMock.competenceWorker.findUniqueOrThrow.mockResolvedValue({
    id: "worker-1",
    areaId: "area-1",
    roleName: null,
    employee: { employeeNo: "001" },
  });
  transactionMock.workerAuthorization.findMany.mockResolvedValue([]);
  transactionMock.trainingRecord.findMany.mockResolvedValue([]);
  transactionMock.competenceAssessment.findMany.mockResolvedValue([]);
  transactionMock.workerCompetenceState.upsert.mockResolvedValue({});
  // §3.2 (revised): isRequired now comes from a direct per-(worker,type) row,
  // not a resolved rule set. Individual tests override this per-call when
  // they need a specific pair to be required or not.
  transactionMock.competenceWorkerRequirement.findUnique.mockResolvedValue({
    isRequired: true,
    setBy: { name: "N3 Safety" },
  });
  prismaMock.prisma.occupationalHealthWorker.findUnique.mockResolvedValue(null);
}

describe("CompetenceService.enroll", () => {
  beforeEach(() => {
    prismaMock.prisma.occupationalHealthWorker.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enrolls a worker with every competence type NOT_APPLICABLE — no CompetenceWorkerRequirement row exists yet at enrollment time", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([
      { id: "employee-1", employeeNo: "001", name: "Ana Silva", dept: "Logistics" },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", isActive: true, displayOrder: 0 },
    ]);
    transactionMock.competenceWorker.upsert.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: "area-1",
      roleName: null,
    });
    transactionMock.competenceType.findUniqueOrThrow.mockResolvedValue({ id: "type-forklift", requiresAssessment: true });
    transactionMock.competenceWorker.findUniqueOrThrow.mockResolvedValue({
      id: "worker-1",
      areaId: "area-1",
      roleName: null,
      employee: { employeeNo: "001" },
    });
    transactionMock.workerAuthorization.findMany.mockResolvedValue([]);
    transactionMock.trainingRecord.findMany.mockResolvedValue([]);
    transactionMock.competenceAssessment.findMany.mockResolvedValue([]);
    transactionMock.competenceWorkerRequirement.findUnique.mockResolvedValue(null);
    transactionMock.occupationalHealthWorker.findUnique.mockResolvedValue(null);
    transactionMock.workerCompetenceState.upsert.mockResolvedValue({});

    const result = await CompetenceService.enroll(
      "plant-1",
      { workers: [{ employeeDirectoryId: "employee-1", areaId: "area-1" }] },
      "user-1",
    );

    expect(result).toHaveLength(1);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(1);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isRequired: false, state: CompetenceCellState.NOT_APPLICABLE }),
      }),
    );
  });

  it("rejects employees that do not belong to the plant before opening a transaction", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);

    await expect(
      CompetenceService.enroll("plant-1", { workers: [{ employeeDirectoryId: "employee-x", areaId: "area-1" }] }, "user-1"),
    ).rejects.toThrow(/Employee not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("CompetenceService.list", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shapes the matrix with one cell per active competence type per worker", async () => {
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", name: "Empilhador", category: CompetenceCategory.EQUIPMENT_OPERATION, displayOrder: 0 },
    ]);
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([
      {
        id: "worker-1",
        employeeDirectoryId: "employee-1",
        areaId: "area-1",
        roleName: null,
        employee: { employeeNo: "001", name: "Ana Silva", dept: "Logistics" },
        area: { id: "area-1", name: "Logistics" },
        states: [
          { competenceTypeId: "type-forklift", state: CompetenceCellState.MISSING, isRequired: true, requirementSource: "ALL_WORKERS" },
        ],
      },
    ]);

    const matrix = await CompetenceService.list("plant-1", "en");

    expect(matrix.competenceTypes).toEqual([
      { id: "type-forklift", code: "FORKLIFT", name: "Empilhador", category: CompetenceCategory.EQUIPMENT_OPERATION, displayOrder: 0 },
    ]);
    expect(matrix.workers).toEqual([
      {
        id: "worker-1",
        employeeDirectoryId: "employee-1",
        employeeNo: "001",
        name: "Ana Silva",
        deptFallback: "Logistics",
        areaId: "area-1",
        areaName: "Logistics",
        roleName: null,
        cells: [
          {
            competenceTypeId: "type-forklift",
            state: CompetenceCellState.MISSING,
            isRequired: true,
            requirementSource: "ALL_WORKERS",
            validUntil: null,
            daysToExpiry: null,
            blockedReason: null,
          },
        ],
      },
    ]);
  });
});

describe("CompetenceService.registerTraining / registerAssessment", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", validityMonths: 12 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registerTraining stores the actor as createdById and recomputes the cell", async () => {
    transactionMock.trainingRecord.create.mockResolvedValue({ id: "training-1" });

    await CompetenceService.registerTraining(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        completedAt: new Date("2026-01-01"),
        result: TrainingResult.PASSED,
      },
      "user-1",
    );

    expect(transactionMock.trainingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: "user-1", result: TrainingResult.PASSED }) }),
    );
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalled();
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TrainingRecord", action: "REGISTERED" }), transactionMock);
    // item 6: recomputeAndSaveState must read OccupationalHealthWorker inside the same
    // transaction, not with the global client — otherwise it isn't part of the snapshot.
    expect(transactionMock.occupationalHealthWorker.findUnique).toHaveBeenCalled();
  });

  it("registerAssessment sets assessorUserId to the actor when no external assessor name is given", async () => {
    transactionMock.competenceAssessment.create.mockResolvedValue({ id: "assessment-1" });

    await CompetenceService.registerAssessment(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        assessedAt: new Date("2026-01-02"),
        result: CompetenceAssessmentResult.COMPETENT,
        method: "PRACTICAL_TEST",
      },
      "user-1",
    );

    expect(transactionMock.competenceAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assessorUserId: "user-1", assessorName: null }) }),
    );
  });

  it("registerAssessment leaves assessorUserId null when an external assessor name is given, so it never satisfies segregation-of-duties checks against an internal user", async () => {
    transactionMock.competenceAssessment.create.mockResolvedValue({ id: "assessment-1" });

    await CompetenceService.registerAssessment(
      "plant-1",
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-forklift",
        assessedAt: new Date("2026-01-02"),
        result: CompetenceAssessmentResult.COMPETENT,
        method: "PRACTICAL_TEST",
        assessorName: "Dr. Silva (external)",
      },
      "user-1",
    );

    expect(transactionMock.competenceAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assessorUserId: null, assessorName: "Dr. Silva (external)" }) }),
    );
  });

  it("(item 5, write half) rejects registerAssessment without trainingRecordId when the competence type requires training", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", validityMonths: 12, requiresTraining: true });

    await expect(
      CompetenceService.registerAssessment(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          assessedAt: new Date("2026-01-02"),
          result: CompetenceAssessmentResult.COMPETENT,
          method: "PRACTICAL_TEST",
        },
        "user-1",
      ),
    ).rejects.toThrow(/requires training/);

    expect(transactionMock.competenceAssessment.create).not.toHaveBeenCalled();
  });

  it("(crit 2) rejects registerAssessment when trainingRecordId does not belong to this worker/type", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", validityMonths: 12, requiresTraining: true });
    transactionMock.trainingRecord.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.registerAssessment(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          trainingRecordId: "training-other-worker",
          assessedAt: new Date("2026-01-02"),
          result: CompetenceAssessmentResult.COMPETENT,
          method: "PRACTICAL_TEST",
        },
        "user-1",
      ),
    ).rejects.toThrow(/training record was not found/);

    expect(transactionMock.competenceAssessment.create).not.toHaveBeenCalled();
  });
});

describe("CompetenceService.grantAuthorization", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({
      id: "type-forklift",
      name: "Forklift",
      validityMonths: 12,
      requiresAuthorization: true,
      requiresTraining: false,
      requiresAssessment: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("computes validUntil from validFrom + CompetenceType.validityMonths and assigns sequenceNumber as max+1", async () => {
    transactionMock.workerAuthorization.findFirst
      .mockResolvedValueOnce(null) // no current ACTIVE/SUSPENDED authorization to supersede
      .mockResolvedValueOnce({ sequenceNumber: 5 }); // latest sequence in the plant
    transactionMock.workerAuthorization.create.mockResolvedValue({ id: "auth-1" });

    await CompetenceService.grantAuthorization(
      "plant-1",
      { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01T00:00:00.000Z") },
      "user-1",
    );

    expect(transactionMock.workerAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sequenceNumber: 6,
          grantedByUserId: "user-1",
          validUntil: new Date("2027-01-01T00:00:00.000Z"),
        }),
      }),
    );
    expect(transactionMock.workerAuthorization.update).not.toHaveBeenCalled();
  });

  it("marks the previous ACTIVE authorization SUPERSEDED on renewal, never extending it (§2.5)", async () => {
    transactionMock.workerAuthorization.findFirst
      .mockResolvedValueOnce({ id: "auth-old" })
      .mockResolvedValueOnce({ sequenceNumber: 1 });
    transactionMock.workerAuthorization.create.mockResolvedValue({ id: "auth-new" });

    await CompetenceService.grantAuthorization(
      "plant-1",
      { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
      "user-1",
    );

    expect(transactionMock.workerAuthorization.update).toHaveBeenCalledWith({
      where: { id: "auth-old" },
      data: { status: AuthorizationStatus.SUPERSEDED, supersededById: "auth-new" },
    });
  });

  it("blocks granting when the actor also performed the linked practical assessment (segregation of duties, checked in the service)", async () => {
    transactionMock.competenceAssessment.findFirst.mockResolvedValue({ assessorUserId: "user-1" });

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          assessmentId: "assessment-1",
          validFrom: new Date("2026-01-01"),
        },
        "user-1",
      ),
    ).rejects.toThrow(/Segregation of duties/);
  });

  it("allows granting when AUTHORIZATION_SEGREGATION_OF_DUTIES is off, even for the same actor", async () => {
    parameterServiceMock.getAuthorizationSegregationOfDuties.mockResolvedValueOnce(false);
    transactionMock.competenceAssessment.findFirst.mockResolvedValue({ assessorUserId: "user-1" });
    transactionMock.workerAuthorization.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    transactionMock.workerAuthorization.create.mockResolvedValue({ id: "auth-1" });

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          assessmentId: "assessment-1",
          validFrom: new Date("2026-01-01"),
        },
        "user-1",
      ),
    ).resolves.toBeDefined();
  });

  it("(crit 1) blocks granting when the actor performed a competent assessment for this worker/type, even if assessmentId is omitted", async () => {
    transactionMock.competenceAssessment.findFirst.mockResolvedValue({ assessorUserId: "user-1" });

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
        "user-1",
      ),
    ).rejects.toThrow(/Segregation of duties/);

    expect(transactionMock.competenceAssessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          result: CompetenceAssessmentResult.COMPETENT,
          assessorUserId: "user-1",
        }),
      }),
    );
    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(crit 2) rejects an assessmentId that does not belong to this plant/worker/type", async () => {
    parameterServiceMock.getAuthorizationSegregationOfDuties.mockResolvedValueOnce(false);
    transactionMock.competenceAssessment.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          assessmentId: "assessment-other-plant",
          validFrom: new Date("2026-01-01"),
        },
        "user-1",
      ),
    ).rejects.toThrow(/assessment was not found/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(crit 2) rejects a trainingRecordId that does not belong to this worker/type", async () => {
    transactionMock.trainingRecord.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        {
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-forklift",
          trainingRecordId: "training-other-worker",
          validFrom: new Date("2026-01-01"),
        },
        "user-1",
      ),
    ).rejects.toThrow(/training record was not found/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(item 6) rejects granting when requiresTraining is true and no PASSED training record exists for this worker/type", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({
      id: "type-forklift",
      name: "Forklift",
      validityMonths: 12,
      requiresAuthorization: true,
      requiresTraining: true,
      requiresAssessment: false,
    });
    transactionMock.trainingRecord.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
        "user-1",
      ),
    ).rejects.toThrow(/requires a passed training record/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(item 6) rejects granting when requiresAssessment is true and no COMPETENT assessment exists for this worker/type", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({
      id: "type-forklift",
      name: "Forklift",
      validityMonths: 12,
      requiresAuthorization: true,
      requiresTraining: false,
      requiresAssessment: true,
    });
    transactionMock.competenceAssessment.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
        "user-1",
      ),
    ).rejects.toThrow(/requires a competent practical assessment/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(item 6) rejects granting outright when the competence type does not require a formal authorization", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({
      id: "type-forklift",
      name: "Forklift",
      validityMonths: 12,
      requiresAuthorization: false,
      requiresTraining: false,
      requiresAssessment: false,
    });

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
        "user-1",
      ),
    ).rejects.toThrow(/does not require a formal authorization/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(item 9) acquires a plant-scoped advisory lock before reading the max sequenceNumber", async () => {
    transactionMock.workerAuthorization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sequenceNumber: 3 });
    transactionMock.workerAuthorization.create.mockResolvedValue({ id: "auth-1" });

    await CompetenceService.grantAuthorization(
      "plant-1",
      { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
      "user-1",
    );

    expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("(item 10) rejects a renewal while the worker's current authorization for this competence is SUSPENDED, naming the reason", async () => {
    transactionMock.workerAuthorization.findFirst.mockResolvedValueOnce({
      id: "auth-old",
      status: AuthorizationStatus.SUSPENDED,
      suspensionReason: "Unsafe handling reported",
    });

    await expect(
      CompetenceService.grantAuthorization(
        "plant-1",
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
        "user-1",
      ),
    ).rejects.toThrow(/SUSPENDED authorization.*Unsafe handling reported/);

    expect(transactionMock.workerAuthorization.create).not.toHaveBeenCalled();
  });

  it("(item 10) queries the current ACTIVE/SUSPENDED authorization ordered by grantedAt desc, to supersede deterministically", async () => {
    transactionMock.workerAuthorization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sequenceNumber: 1 });
    transactionMock.workerAuthorization.create.mockResolvedValue({ id: "auth-1" });

    await CompetenceService.grantAuthorization(
      "plant-1",
      { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift", validFrom: new Date("2026-01-01") },
      "user-1",
    );

    expect(transactionMock.workerAuthorization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { grantedAt: "desc" } }),
    );
  });
});

describe("CompetenceService.suspendAuthorization / reactivateAuthorization / revokeAuthorization", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("suspends an ACTIVE authorization with the free-text reason and the actor", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({
      id: "auth-1",
      status: AuthorizationStatus.ACTIVE,
      competenceWorkerId: "worker-1",
      competenceTypeId: "type-forklift",
    });
    transactionMock.workerAuthorization.update.mockResolvedValue({ status: AuthorizationStatus.SUSPENDED });

    await CompetenceService.suspendAuthorization("plant-1", "auth-1", "Unsafe handling reported", "user-2");

    expect(transactionMock.workerAuthorization.update).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      data: expect.objectContaining({
        status: AuthorizationStatus.SUSPENDED,
        suspendedByUserId: "user-2",
        suspensionReason: "Unsafe handling reported",
      }),
    });
    expect(competenceAlertServiceMock.CompetenceAlertService.dispatchAuthorizationSuspended).toHaveBeenCalledWith("auth-1");
  });

  it("rejects suspending an authorization that is not ACTIVE", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({ id: "auth-1", status: AuthorizationStatus.REVOKED });

    await expect(CompetenceService.suspendAuthorization("plant-1", "auth-1", "reason", "user-2")).rejects.toThrow(/ACTIVE/);
  });

  it("(item 7) rejects suspending an EXPIRED authorization with a dedicated message, not the generic ACTIVE-only one", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({ id: "auth-1", status: AuthorizationStatus.EXPIRED });

    await expect(CompetenceService.suspendAuthorization("plant-1", "auth-1", "reason", "user-2")).rejects.toThrow(/already expired/);
  });

  it("reactivates a SUSPENDED authorization back to ACTIVE, keeping the suspension fields for history", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({
      id: "auth-1",
      status: AuthorizationStatus.SUSPENDED,
      competenceWorkerId: "worker-1",
      competenceTypeId: "type-forklift",
    });
    transactionMock.workerAuthorization.update.mockResolvedValue({ status: AuthorizationStatus.ACTIVE });

    await CompetenceService.reactivateAuthorization("plant-1", "auth-1", "user-3");

    expect(transactionMock.workerAuthorization.update).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      data: expect.objectContaining({ status: AuthorizationStatus.ACTIVE, reactivatedByUserId: "user-3" }),
    });
  });

  it("rejects reactivating an authorization that is not SUSPENDED", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({ id: "auth-1", status: AuthorizationStatus.ACTIVE });

    await expect(CompetenceService.reactivateAuthorization("plant-1", "auth-1", "user-3")).rejects.toThrow(/SUSPENDED/);
  });

  it("(item 7) rejects reactivating an EXPIRED authorization with a dedicated message, not the generic SUSPENDED-only one", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValue({ id: "auth-1", status: AuthorizationStatus.EXPIRED });

    await expect(CompetenceService.reactivateAuthorization("plant-1", "auth-1", "user-3")).rejects.toThrow(/already expired/);
  });

  it("revokes from either ACTIVE or SUSPENDED, and rejects from REVOKED", async () => {
    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValueOnce({
      id: "auth-1",
      status: AuthorizationStatus.SUSPENDED,
      competenceWorkerId: "worker-1",
      competenceTypeId: "type-forklift",
    });
    transactionMock.workerAuthorization.update.mockResolvedValue({ status: AuthorizationStatus.REVOKED });

    await CompetenceService.revokeAuthorization("plant-1", "auth-1", "Serious incident", "user-4");

    expect(transactionMock.workerAuthorization.update).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      data: expect.objectContaining({ status: AuthorizationStatus.REVOKED, revokedByUserId: "user-4", revocationReason: "Serious incident" }),
    });
    expect(competenceAlertServiceMock.CompetenceAlertService.dispatchAuthorizationRevoked).toHaveBeenCalledWith("auth-1");

    prismaMock.prisma.workerAuthorization.findFirst.mockResolvedValueOnce({ id: "auth-2", status: AuthorizationStatus.REVOKED });
    await expect(CompetenceService.revokeAuthorization("plant-1", "auth-2", "reason", "user-4")).rejects.toThrow(/ACTIVE or SUSPENDED/);
  });
});

describe("CompetenceService — N5_OPERATOR only sees their own record, enforced in the service (rule §2.3)", () => {
  afterEach(() => vi.clearAllMocks());

  it("list() keeps only the worker linked to the N5 viewer's User.employeeDirectoryId", async () => {
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", name: "Empilhador", category: CompetenceCategory.EQUIPMENT_OPERATION, displayOrder: 0 },
    ]);
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([
      {
        id: "worker-self",
        employeeDirectoryId: "employee-self",
        areaId: null,
        roleName: null,
        employee: { employeeNo: "001", name: "Self", dept: null },
        area: null,
        states: [],
      },
      {
        id: "worker-other",
        employeeDirectoryId: "employee-other",
        areaId: null,
        roleName: null,
        employee: { employeeNo: "002", name: "Other", dept: null },
        area: null,
        states: [],
      },
    ]);
    prismaMock.prisma.user.findUnique.mockResolvedValue({ employeeDirectoryId: "employee-self" });

    const matrix = await CompetenceService.list("plant-1", "en", { role: RoleCode.N5_OPERATOR, userId: "user-n5" });

    expect(matrix.workers).toHaveLength(1);
    expect(matrix.workers[0]?.id).toBe("worker-self");
  });

  it("list() returns no workers for an N5 viewer with no linked employeeDirectoryId", async () => {
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([
      {
        id: "worker-other",
        employeeDirectoryId: "employee-other",
        areaId: null,
        roleName: null,
        employee: { employeeNo: "002", name: "Other", dept: null },
        area: null,
        states: [],
      },
    ]);
    prismaMock.prisma.user.findUnique.mockResolvedValue({ employeeDirectoryId: null });

    const matrix = await CompetenceService.list("plant-1", "en", { role: RoleCode.N5_OPERATOR, userId: "user-n5" });

    expect(matrix.workers).toHaveLength(0);
  });

  it("getWorkerProfile() returns null when an N5 viewer requests a worker other than their own", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({
      id: "worker-other",
      employeeDirectoryId: "employee-other",
      employee: { employeeNo: "002" },
      area: null,
    });
    prismaMock.prisma.user.findUnique.mockResolvedValue({ employeeDirectoryId: "employee-self" });

    const profile = await CompetenceService.getWorkerProfile("plant-1", "worker-other", "en", {
      role: RoleCode.N5_OPERATOR,
      userId: "user-n5",
    });

    expect(profile).toBeNull();
  });
});

describe("CompetenceService.recomputeCompetenceTypeStates — bulk recompute when a rule changes (§3.7(b))", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
  });

  afterEach(() => vi.clearAllMocks());

  it("recomputes every active worker's state for the affected competence type", async () => {
    transactionMock.competenceWorker.findMany.mockResolvedValue([{ id: "worker-1" }, { id: "worker-2" }]);

    await CompetenceService.recomputeCompetenceTypeStates("plant-1", "type-forklift");

    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(2);
    // Both workers compute to MISSING for an ALL_WORKERS-required type with no
    // training/authorization yet (per stubRecomputeDependencies) — §7.2's
    // "na alteração ... da matriz" trigger for ROLE_WITHOUT_COMPETENCE.
    expect(competenceAlertServiceMock.CompetenceAlertService.dispatchRoleWithoutCompetence).toHaveBeenCalledWith(
      "plant-1",
      [
        { competenceWorkerId: "worker-1", competenceTypeId: "type-forklift" },
        { competenceWorkerId: "worker-2", competenceTypeId: "type-forklift" },
      ],
      expect.any(Date),
    );
  });
});

describe("CompetenceService.recomputeAllStates — §3.7(c) daily job recompute, captures the passage of time", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
  });

  afterEach(() => vi.clearAllMocks());

  it("recomputes every (worker, type) pair in the plant and returns the computed state for each", async () => {
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([{ id: "worker-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", isActive: true, displayOrder: 0 },
      { id: "type-mewp", isActive: true, displayOrder: 1 },
    ]);

    const results = await CompetenceService.recomputeAllStates("plant-1");

    expect(results).toHaveLength(2);
    expect(results.map((row) => row.competenceTypeId).sort()).toEqual(["type-forklift", "type-mewp"]);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("CompetenceService.updateWorkerRole — §3.2 note: changing roleName recomputes every competence type", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
  });

  afterEach(() => vi.clearAllMocks());

  it("updates roleName and recomputes state for every active competence type, not just the ones already required", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1", roleName: null });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", isActive: true, displayOrder: 0 },
      { id: "type-mewp", isActive: true, displayOrder: 1 },
    ]);
    transactionMock.competenceWorker.update.mockResolvedValue({ id: "worker-1", roleName: "Operador Logística" });
    // Override the default uniform stub: only type-forklift has a
    // CompetenceWorkerRequirement row (isRequired: true) — type-mewp has
    // none, so it resolves to not-required.
    transactionMock.competenceWorkerRequirement.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.competenceWorkerId_competenceTypeId.competenceTypeId === "type-forklift"
          ? { isRequired: true, setBy: { name: "N3 Safety" } }
          : null,
      ),
    );

    await CompetenceService.updateWorkerRole("plant-1", "worker-1", { roleName: "Operador Logística" }, "user-1");

    expect(transactionMock.competenceWorker.update).toHaveBeenCalledWith({
      where: { id: "worker-1" },
      data: { roleName: "Operador Logística" },
    });
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(2);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "ROLE_UPDATED" }), transactionMock);
    // type-forklift has an active CompetenceWorkerRequirement row and no
    // training/authorization yet, so it computes to MISSING — that is
    // exactly the §7.2 ROLE_WITHOUT_COMPETENCE trigger.
    expect(competenceAlertServiceMock.CompetenceAlertService.dispatchRoleWithoutCompetence).toHaveBeenCalledWith(
      "plant-1",
      [{ competenceWorkerId: "worker-1", competenceTypeId: "type-forklift" }],
      expect.any(Date),
    );
  });

  it("rejects a worker outside the plant scope before opening a transaction", async () => {
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.updateWorkerRole("plant-1", "worker-x", { roleName: "Operador" }, "user-1"),
    ).rejects.toThrow(/not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("CompetenceService — competence type catalog CRUD (§2.7 admin screen)", () => {
  afterEach(() => vi.clearAllMocks());

  it("upsertCompetenceType() creates a new type and audits it inside the same transaction", async () => {
    transactionMock.competenceType.upsert.mockResolvedValue({ id: "type-1", code: "FORKLIFT" });

    const type = await CompetenceService.upsertCompetenceType(
      "plant-1",
      {
        code: "FORKLIFT",
        name: "Empilhador",
        category: CompetenceCategory.EQUIPMENT_OPERATION,
        requiresTraining: true,
        requiresAssessment: true,
        requiresAuthorization: true,
        validityMonths: 12,
        refresherMonths: null,
        legalReference: null,
        displayOrder: 0,
      },
      "user-1",
    );

    expect(type).toEqual({ id: "type-1", code: "FORKLIFT" });
    expect(transactionMock.competenceType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plantId_code: { plantId: "plant-1", code: "FORKLIFT" } },
        create: expect.objectContaining({ plantId: "plant-1", code: "FORKLIFT", validityMonths: 12 }),
      }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATED", entityType: "CompetenceType" }), transactionMock);
  });

  it("upsertCompetenceType() updates an existing type by id", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-1", code: "FORKLIFT" });
    transactionMock.competenceType.update.mockResolvedValue({ id: "type-1", code: "FORKLIFT", name: "Empilhador retráctil" });

    const type = await CompetenceService.upsertCompetenceType(
      "plant-1",
      {
        id: "type-1",
        code: "FORKLIFT",
        name: "Empilhador retráctil",
        category: CompetenceCategory.EQUIPMENT_OPERATION,
        requiresTraining: true,
        requiresAssessment: true,
        requiresAuthorization: true,
        validityMonths: 12,
        refresherMonths: null,
        legalReference: null,
        displayOrder: 0,
      },
      "user-1",
    );

    expect(type).toEqual({ id: "type-1", code: "FORKLIFT", name: "Empilhador retráctil" });
    expect(transactionMock.competenceType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "type-1" } }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATED" }), transactionMock);
  });

  it("upsertCompetenceType() rejects an id outside the plant scope before writing anything", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.upsertCompetenceType(
        "plant-1",
        {
          id: "type-x",
          code: "FORKLIFT",
          name: "Empilhador",
          category: CompetenceCategory.EQUIPMENT_OPERATION,
          requiresTraining: true,
          requiresAssessment: true,
          requiresAuthorization: true,
          validityMonths: 12,
          refresherMonths: null,
          legalReference: null,
          displayOrder: 0,
        },
        "user-1",
      ),
    ).rejects.toThrow(/not found/);
    expect(transactionMock.competenceType.update).not.toHaveBeenCalled();
    expect(transactionMock.competenceType.upsert).not.toHaveBeenCalled();
  });

  it("deactivateCompetenceType() sets isActive to false when no records reference it", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-1" });
    prismaMock.prisma.workerAuthorization.count.mockResolvedValue(0);
    prismaMock.prisma.trainingRecord.count.mockResolvedValue(0);
    prismaMock.prisma.competenceAssessment.count.mockResolvedValue(0);
    transactionMock.competenceType.update.mockResolvedValue({ id: "type-1", isActive: false });

    await CompetenceService.deactivateCompetenceType("plant-1", "type-1", "user-1");

    expect(transactionMock.competenceType.update).toHaveBeenCalledWith({
      where: { id: "type-1" },
      data: { isActive: false },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "DEACTIVATED" }), transactionMock);
  });

  it("deactivateCompetenceType() is blocked when WorkerAuthorization, TrainingRecord or CompetenceAssessment rows reference it", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-1" });
    prismaMock.prisma.workerAuthorization.count.mockResolvedValue(2);
    prismaMock.prisma.trainingRecord.count.mockResolvedValue(1);
    prismaMock.prisma.competenceAssessment.count.mockResolvedValue(0);

    await expect(CompetenceService.deactivateCompetenceType("plant-1", "type-1", "user-1")).rejects.toThrow(/3 linked record/);
    expect(transactionMock.competenceType.update).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it("deactivateCompetenceType() rejects an id outside the plant scope", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue(null);

    await expect(CompetenceService.deactivateCompetenceType("plant-1", "type-x", "user-1")).rejects.toThrow(/not found/);
    expect(prismaMock.prisma.workerAuthorization.count).not.toHaveBeenCalled();
  });
});

describe("CompetenceService — requirement matrix CRUD (§3.2 admin screen)", () => {
  afterEach(() => vi.clearAllMocks());

  it("listRequirements() joins localized area and workstation names onto each rule", async () => {
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([
      {
        id: "req-1",
        competenceTypeId: "type-forklift",
        competenceType: { name: "Forklift" },
        scopeType: CompetenceRequirementScope.AREA,
        scopeRoleName: null,
        scopeAreaId: "area-1",
        scopeWorkstationId: null,
        isMandatory: true,
        notes: null,
        isActive: true,
        createdAt: new Date("2026-01-01"),
      },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1", name: "Logistics", sourceLanguage: null }]);
    prismaMock.prisma.workstation.findMany.mockResolvedValue([]);

    const requirements = await CompetenceService.listRequirements("plant-1", "en");

    expect(requirements).toEqual([
      expect.objectContaining({ id: "req-1", competenceTypeName: "Forklift", scopeAreaName: "Logistics" }),
    ]);
  });

  it("upsertRequirement() creates a new rule and recomputes the affected competence type's states", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift" });
    transactionMock.competenceRequirement.create.mockResolvedValue({ id: "req-1", competenceTypeId: "type-forklift" });
    transactionMock.competenceWorker.findMany.mockResolvedValue([]);

    const requirement = await CompetenceService.upsertRequirement(
      "plant-1",
      {
        competenceTypeId: "type-forklift",
        scopeType: CompetenceRequirementScope.ALL_WORKERS,
        scopeRoleName: null,
        scopeAreaId: null,
        scopeWorkstationId: null,
        isMandatory: true,
        notes: null,
      },
      "user-1",
    );

    expect(requirement).toEqual({ id: "req-1", competenceTypeId: "type-forklift" });
    expect(transactionMock.competenceRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plantId: "plant-1", scopeType: CompetenceRequirementScope.ALL_WORKERS }) }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATED" }), transactionMock);
  });

  it("upsertRequirement() clears the other scope fields when scopeType does not match them", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift" });
    prismaMock.prisma.area.findFirst.mockResolvedValue({ id: "area-1" });
    transactionMock.competenceRequirement.create.mockResolvedValue({ id: "req-1" });
    transactionMock.competenceWorker.findMany.mockResolvedValue([]);

    await CompetenceService.upsertRequirement(
      "plant-1",
      {
        competenceTypeId: "type-forklift",
        scopeType: CompetenceRequirementScope.AREA,
        scopeRoleName: "Should be dropped",
        scopeAreaId: "area-1",
        scopeWorkstationId: "should-be-dropped-too",
        isMandatory: true,
        notes: null,
      },
      "user-1",
    );

    expect(transactionMock.competenceRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scopeType: CompetenceRequirementScope.AREA, scopeRoleName: null, scopeAreaId: "area-1", scopeWorkstationId: null }),
      }),
    );
  });

  it("upsertRequirement() rejects a competence type outside the plant scope before writing anything", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue(null);

    await expect(
      CompetenceService.upsertRequirement(
        "plant-1",
        {
          competenceTypeId: "type-x",
          scopeType: CompetenceRequirementScope.ALL_WORKERS,
          scopeRoleName: null,
          scopeAreaId: null,
          scopeWorkstationId: null,
          isMandatory: true,
          notes: null,
        },
        "user-1",
      ),
    ).rejects.toThrow(/not found/);
    expect(transactionMock.competenceRequirement.create).not.toHaveBeenCalled();
  });

  it("deactivateRequirement() sets isActive to false and recomputes the affected competence type", async () => {
    prismaMock.prisma.competenceRequirement.findFirst.mockResolvedValue({ id: "req-1", competenceTypeId: "type-forklift" });
    transactionMock.competenceRequirement.update.mockResolvedValue({ id: "req-1", isActive: false });
    transactionMock.competenceWorker.findMany.mockResolvedValue([]);

    await CompetenceService.deactivateRequirement("plant-1", "req-1", "user-1");

    expect(transactionMock.competenceRequirement.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { isActive: false },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "DEACTIVATED" }), transactionMock);
  });

  it("getRequirementCoverage() counts distinct roleNames covered by an active ROLE rule, and flags workers without a role", async () => {
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([
      { roleName: "Operador Logística" },
      { roleName: "Motorista" },
      { roleName: null },
      { roleName: "  " },
    ]);
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([{ scopeRoleName: "operador logistica" }]);

    const coverage = await CompetenceService.getRequirementCoverage("plant-1");

    expect(coverage).toEqual({
      totalRoles: 2,
      rolesWithRequirement: 1,
      roleNamesWithoutRequirement: ["Motorista"],
      workersWithoutRoleName: 2,
      totalWorkers: 4,
    });
  });
});

describe("CompetenceService.getAuthorizationCoverageByPlant / getPlantAuthorizationCoverage (§10 phase-6 KPI)", () => {
  afterEach(() => vi.clearAllMocks());

  it("computes coverage percent and expired count per plant from a single batched groupBy", async () => {
    prismaMock.prisma.workerCompetenceState.groupBy.mockResolvedValue([
      { plantId: "plant-1", state: CompetenceCellState.VALID, _count: 8 },
      { plantId: "plant-1", state: CompetenceCellState.EXPIRED, _count: 2 },
      { plantId: "plant-2", state: CompetenceCellState.VALID, _count: 5 },
    ]);

    const byPlant = await CompetenceService.getAuthorizationCoverageByPlant(["plant-1", "plant-2"]);

    expect(prismaMock.prisma.workerCompetenceState.groupBy).toHaveBeenCalledWith({
      by: ["plantId", "state"],
      where: { plantId: { in: ["plant-1", "plant-2"] }, isRequired: true },
      _count: true,
    });
    expect(byPlant.get("plant-1")).toEqual({
      requiredTotal: 10,
      validCount: 8,
      coveragePercent: 80,
      expiredCount: 2,
    });
    expect(byPlant.get("plant-2")).toEqual({
      requiredTotal: 5,
      validCount: 5,
      coveragePercent: 100,
      expiredCount: 0,
    });
  });

  it("reports coveragePercent = null (not 0) when a plant has no mandatory combination at all", async () => {
    prismaMock.prisma.workerCompetenceState.groupBy.mockResolvedValue([]);

    const coverage = await CompetenceService.getPlantAuthorizationCoverage("plant-empty");

    expect(coverage).toEqual({ requiredTotal: 0, validCount: 0, coveragePercent: null, expiredCount: 0 });
  });

  it("returns an empty map without querying when no plantIds are given", async () => {
    const byPlant = await CompetenceService.getAuthorizationCoverageByPlant([]);

    expect(byPlant.size).toBe(0);
    expect(prismaMock.prisma.workerCompetenceState.groupBy).not.toHaveBeenCalled();
  });
});
