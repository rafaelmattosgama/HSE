import { AuthorizationStatus, CompetenceAssessmentResult, CompetenceCategory, CompetenceCellState, CompetenceRequirementScope, RoleCode, TrainingResult } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  competenceWorker: {
    upsert: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  workerCompetenceState: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  competenceType: {
    findUniqueOrThrow: vi.fn(),
  },
  trainingRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  competenceAssessment: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  workerAuthorization: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
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
    },
    workerAuthorization: {
      findFirst: vi.fn(),
    },
    occupationalHealthWorker: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
  // recomputeAndSaveState re-resolves the requirement on every call (phase-3
  // fix — see competence-service.ts); an ALL_WORKERS rule keeps these tests'
  // existing isRequired/requirementSource expectations unchanged.
  prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([
    {
      competenceTypeId: "type-forklift",
      scopeType: CompetenceRequirementScope.ALL_WORKERS,
      scopeRoleName: null,
      scopeAreaId: null,
      scopeWorkstationId: null,
    },
  ]);
  prismaMock.prisma.occupationalHealthWorker.findUnique.mockResolvedValue(null);
}

describe("CompetenceService.enroll", () => {
  beforeEach(() => {
    prismaMock.prisma.occupationalHealthWorker.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks a competence MISSING when an ALL_WORKERS requirement applies, and NOT_APPLICABLE otherwise", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([
      { id: "employee-1", employeeNo: "001", name: "Ana Silva", dept: "Logistics" },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", isActive: true, displayOrder: 0 },
      { id: "type-mewp", code: "MEWP", isActive: true, displayOrder: 1 },
    ]);
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([
      {
        competenceTypeId: "type-forklift",
        scopeType: CompetenceRequirementScope.ALL_WORKERS,
        scopeRoleName: null,
        scopeAreaId: null,
        scopeWorkstationId: null,
      },
    ]);
    transactionMock.competenceWorker.upsert.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: "area-1",
      roleName: null,
    });

    const result = await CompetenceService.enroll(
      "plant-1",
      { workers: [{ employeeDirectoryId: "employee-1", areaId: "area-1" }] },
      "user-1",
    );

    expect(result).toHaveLength(1);
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(2);

    const forkliftCall = transactionMock.workerCompetenceState.upsert.mock.calls.find(
      (call) => call[0].create.competenceTypeId === "type-forklift",
    );
    expect(forkliftCall?.[0].create).toMatchObject({
      isRequired: true,
      requirementSource: "ALL_WORKERS",
      state: CompetenceCellState.MISSING,
    });

    const mewpCall = transactionMock.workerCompetenceState.upsert.mock.calls.find(
      (call) => call[0].create.competenceTypeId === "type-mewp",
    );
    expect(mewpCall?.[0].create).toMatchObject({
      isRequired: false,
      requirementSource: null,
      state: CompetenceCellState.NOT_APPLICABLE,
    });

    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "CompetenceWorker", action: "ENROLLED", plantId: "plant-1" }),
    );
  });

  it("resolves an AREA-scoped requirement only for workers assigned to that area", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([
      { id: "employee-1", employeeNo: "001", name: "Ana Silva", dept: null },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-logistics" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", isActive: true, displayOrder: 0 },
    ]);
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([
      {
        competenceTypeId: "type-forklift",
        scopeType: CompetenceRequirementScope.AREA,
        scopeRoleName: null,
        scopeAreaId: "area-logistics",
        scopeWorkstationId: null,
      },
    ]);
    transactionMock.competenceWorker.upsert.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: "area-logistics",
      roleName: null,
    });

    await CompetenceService.enroll(
      "plant-1",
      { workers: [{ employeeDirectoryId: "employee-1", areaId: "area-logistics" }] },
      "user-1",
    );

    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isRequired: true, requirementSource: "AREA:area-logistics", state: CompetenceCellState.MISSING }),
      }),
    );
  });

  it("resolves a WORKSTATION-scoped requirement from the employee's linked occupational-health record, not from CompetenceWorker itself", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([
      { id: "employee-1", employeeNo: "001", name: "Ana Silva", dept: null },
    ]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([
      { id: "type-forklift", code: "FORKLIFT", isActive: true, displayOrder: 0 },
    ]);
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([
      {
        competenceTypeId: "type-forklift",
        scopeType: CompetenceRequirementScope.WORKSTATION,
        scopeRoleName: null,
        scopeAreaId: null,
        scopeWorkstationId: "workstation-dock-3",
      },
    ]);
    prismaMock.prisma.occupationalHealthWorker.findMany.mockResolvedValue([
      { employeeNo: "001", workstationId: "workstation-dock-3" },
    ]);
    transactionMock.competenceWorker.upsert.mockResolvedValue({
      id: "worker-1",
      plantId: "plant-1",
      employeeDirectoryId: "employee-1",
      areaId: "area-1",
      roleName: null,
    });

    await CompetenceService.enroll(
      "plant-1",
      { workers: [{ employeeDirectoryId: "employee-1", areaId: "area-1" }] },
      "user-1",
    );

    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          isRequired: true,
          requirementSource: "WORKSTATION:workstation-dock-3",
          state: CompetenceCellState.MISSING,
        }),
      }),
    );
  });

  it("rejects employees that do not belong to the plant before opening a transaction", async () => {
    prismaMock.prisma.employeeDirectory.findMany.mockResolvedValue([]);
    prismaMock.prisma.area.findMany.mockResolvedValue([{ id: "area-1" }]);
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);
    prismaMock.prisma.competenceRequirement.findMany.mockResolvedValue([]);

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
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TrainingRecord", action: "REGISTERED" }));
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
});

describe("CompetenceService.grantAuthorization", () => {
  beforeEach(() => {
    stubRecomputeDependencies();
    prismaMock.prisma.competenceWorker.findFirst.mockResolvedValue({ id: "worker-1" });
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift", validityMonths: 12 });
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
    prismaMock.prisma.competenceAssessment.findUnique.mockResolvedValue({ assessorUserId: "user-1" });

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

    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows granting when AUTHORIZATION_SEGREGATION_OF_DUTIES is off, even for the same actor", async () => {
    parameterServiceMock.getAuthorizationSegregationOfDuties.mockResolvedValueOnce(false);
    prismaMock.prisma.competenceAssessment.findUnique.mockResolvedValue({ assessorUserId: "user-1" });
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
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([{ id: "worker-1" }, { id: "worker-2" }]);

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

    await CompetenceService.updateWorkerRole("plant-1", "worker-1", { roleName: "Operador Logística" }, "user-1");

    expect(transactionMock.competenceWorker.update).toHaveBeenCalledWith({
      where: { id: "worker-1" },
      data: { roleName: "Operador Logística" },
    });
    expect(transactionMock.workerCompetenceState.upsert).toHaveBeenCalledTimes(2);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "ROLE_UPDATED" }));
    // type-forklift is ALL_WORKERS-required (per stubRecomputeDependencies) and has no training/authorization
    // yet, so it computes to MISSING — that is exactly the §7.2 ROLE_WITHOUT_COMPETENCE trigger.
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
    prismaMock.prisma.competenceRequirement.create.mockResolvedValue({ id: "req-1", competenceTypeId: "type-forklift" });
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([]);

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
    expect(prismaMock.prisma.competenceRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plantId: "plant-1", scopeType: CompetenceRequirementScope.ALL_WORKERS }) }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATED" }));
  });

  it("upsertRequirement() clears the other scope fields when scopeType does not match them", async () => {
    prismaMock.prisma.competenceType.findFirst.mockResolvedValue({ id: "type-forklift" });
    prismaMock.prisma.area.findFirst.mockResolvedValue({ id: "area-1" });
    prismaMock.prisma.competenceRequirement.create.mockResolvedValue({ id: "req-1" });
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([]);

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

    expect(prismaMock.prisma.competenceRequirement.create).toHaveBeenCalledWith(
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
    expect(prismaMock.prisma.competenceRequirement.create).not.toHaveBeenCalled();
  });

  it("deactivateRequirement() sets isActive to false and recomputes the affected competence type", async () => {
    prismaMock.prisma.competenceRequirement.findFirst.mockResolvedValue({ id: "req-1", competenceTypeId: "type-forklift" });
    prismaMock.prisma.competenceRequirement.update.mockResolvedValue({ id: "req-1", isActive: false });
    prismaMock.prisma.competenceWorker.findMany.mockResolvedValue([]);

    await CompetenceService.deactivateRequirement("plant-1", "req-1", "user-1");

    expect(prismaMock.prisma.competenceRequirement.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { isActive: false },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "DEACTIVATED" }));
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
