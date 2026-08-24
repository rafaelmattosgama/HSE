import {
  AuthorizationStatus,
  CompetenceAssessmentMethod,
  CompetenceAssessmentResult,
  CompetenceCellState,
  CompetenceRequirementScope,
  MasterDataEntityType,
  type Prisma,
  RoleCode,
  TrainingResult,
} from "@prisma/client";
import { addMonths, differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationSegregationOfDuties,
  getCompetenceExpiringThresholdDays,
  getMedicalFitnessBlocksAuthorization,
} from "@/lib/services/parameter-service";
import { CompetenceAlertService } from "@/lib/services/competence-alert-service";
import {
  COMPETENCE_TIMEZONE,
  computeCompetenceCellState,
  resolveCompetenceRequirement,
  type ComputedCompetenceCellState,
  type RequirementRuleForResolution,
} from "@/lib/services/competence-state-service";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import type {
  EnrollCompetenceWorkersInput,
  GrantAuthorizationInput,
  RegisterAssessmentInput,
  RegisterTrainingInput,
  UpdateCompetenceWorkerRoleInput,
  UpsertCompetenceRequirementInput,
} from "@/lib/validation/dtos";

type TransactionClient = Prisma.TransactionClient;

export type CompetenceMatrixCellView = {
  competenceTypeId: string;
  state: CompetenceCellState;
  isRequired: boolean;
  requirementSource: string | null;
  validUntil: Date | null;
  daysToExpiry: number | null;
  blockedReason: string | null;
};

export type CompetenceMatrixWorkerView = {
  id: string;
  employeeDirectoryId: string;
  employeeNo: string;
  name: string;
  deptFallback: string | null;
  areaId: string | null;
  areaName: string | null;
  roleName: string | null;
  cells: CompetenceMatrixCellView[];
};

export type CompetenceMatrixTypeView = {
  id: string;
  code: string;
  name: string;
  category: string;
  displayOrder: number;
};

export type CompetenceMatrixView = {
  competenceTypes: CompetenceMatrixTypeView[];
  workers: CompetenceMatrixWorkerView[];
};

export type CompetenceRequirementView = {
  id: string;
  competenceTypeId: string;
  competenceTypeName: string;
  scopeType: CompetenceRequirementScope;
  scopeRoleName: string | null;
  scopeAreaId: string | null;
  scopeAreaName: string | null;
  scopeWorkstationId: string | null;
  scopeWorkstationName: string | null;
  isMandatory: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type CompetenceRequirementCoverage = {
  totalRoles: number;
  rolesWithRequirement: number;
  roleNamesWithoutRequirement: string[];
  workersWithoutRoleName: number;
  totalWorkers: number;
};

export type CompetenceHistoryEvent =
  | {
      type: "TRAINING";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      result: TrainingResult;
      provider: string | null;
      trainerName: string | null;
      certificateExpiresAt: Date | null;
    }
  | {
      type: "ASSESSMENT";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      result: CompetenceAssessmentResult;
      method: CompetenceAssessmentMethod;
      assessorName: string | null;
    }
  | {
      type: "AUTHORIZATION_GRANTED";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      validFrom: Date;
      validUntil: Date;
      restrictions: string | null;
      grantedByName: string | null;
    }
  | {
      type: "AUTHORIZATION_SUSPENDED";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      reason: string | null;
      actorName: string | null;
    }
  | {
      type: "AUTHORIZATION_REACTIVATED";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      actorName: string | null;
    }
  | {
      type: "AUTHORIZATION_REVOKED";
      id: string;
      occurredAt: Date;
      competenceTypeId: string;
      reason: string | null;
      actorName: string | null;
    };

export type CompetenceWorkerCompetenceRow = {
  competenceTypeId: string;
  code: string;
  name: string;
  category: string;
  state: CompetenceCellState;
  isRequired: boolean;
  requirementSource: string | null;
  validUntil: Date | null;
  daysToExpiry: number | null;
  blockedReason: string | null;
  currentAuthorizationId: string | null;
};

export type CompetenceWorkerProfileView = {
  worker: {
    id: string;
    employeeDirectoryId: string;
    employeeNo: string;
    name: string;
    dept: string | null;
    areaId: string | null;
    areaName: string | null;
    roleName: string | null;
  };
  occupationalHealth: {
    birthDate: Date;
    gender: string;
    hireDate: Date;
    roleStartDate: Date;
    nationality: string | null;
    workstationName: string | null;
  } | null;
  competences: CompetenceWorkerCompetenceRow[];
  history: CompetenceHistoryEvent[];
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

async function loadActiveCompetenceTypes(plantId: string) {
  return prisma.competenceType.findMany({
    where: { plantId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

async function loadActiveRequirements(plantId: string): Promise<RequirementRuleForResolution[]> {
  return prisma.competenceRequirement.findMany({
    where: { plantId, isActive: true },
    select: {
      competenceTypeId: true,
      scopeType: true,
      scopeRoleName: true,
      scopeAreaId: true,
      scopeWorkstationId: true,
    },
  });
}

async function loadWorkstationIdsByEmployeeNo(plantId: string, employeeNos: string[]): Promise<Map<string, string | null>> {
  if (employeeNos.length === 0) return new Map();
  const rows = await prisma.occupationalHealthWorker.findMany({
    where: { plantId, employeeNo: { in: employeeNos } },
    select: { employeeNo: true, workstationId: true },
  });
  return new Map(rows.map((row) => [row.employeeNo, row.workstationId]));
}

async function assertWorkerAndTypeInPlant(plantId: string, competenceWorkerId: string, competenceTypeId: string) {
  const [competenceWorker, competenceType] = await Promise.all([
    prisma.competenceWorker.findFirst({ where: { id: competenceWorkerId, plantId } }),
    prisma.competenceType.findFirst({ where: { id: competenceTypeId, plantId } }),
  ]);

  if (!competenceWorker) {
    throw new Error(`Competence worker not found for plant scope: ${competenceWorkerId}`);
  }
  if (!competenceType) {
    throw new Error(`Competence type not found for plant scope: ${competenceTypeId}`);
  }

  return { competenceWorker, competenceType };
}

function isBeforeInLisbon(target: Date, now: Date) {
  return differenceInCalendarDays(toZonedTime(target, COMPETENCE_TIMEZONE), toZonedTime(now, COMPETENCE_TIMEZONE)) < 0;
}

/**
 * Recomputes and persists WorkerCompetenceState for one (worker, type) pair.
 * Must run inside the same $transaction as the training/assessment/authorization
 * write that triggered it (§3.7 / rule 7 of the phase-2 brief).
 */
async function recomputeAndSaveState(
  tx: TransactionClient,
  input: {
    plantId: string;
    competenceWorkerId: string;
    competenceTypeId: string;
    now: Date;
    expiringThresholdDays: number;
    medicalFitnessBlocksAuthorization: boolean;
  },
) {
  const [competenceType, competenceWorker, authorizations, trainingRecords, assessments, requirements] = await Promise.all([
    tx.competenceType.findUniqueOrThrow({ where: { id: input.competenceTypeId } }),
    tx.competenceWorker.findUniqueOrThrow({
      where: { id: input.competenceWorkerId },
      include: { employee: { select: { employeeNo: true } } },
    }),
    tx.workerAuthorization.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: {
        id: true,
        status: true,
        validUntil: true,
        suspensionReason: true,
        revocationReason: true,
        trainingRecordId: true,
        grantedAt: true,
      },
    }),
    tx.trainingRecord.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: { id: true, result: true, completedAt: true, certificateExpiresAt: true },
    }),
    tx.competenceAssessment.findMany({
      where: { competenceWorkerId: input.competenceWorkerId, competenceTypeId: input.competenceTypeId },
      select: { id: true, result: true, assessedAt: true, trainingRecordId: true },
    }),
    // Re-resolved on every recompute, never carried forward from the previous
    // WorkerCompetenceState row — a rule can change (or the worker's role can
    // change) between two recomputes, and a stale isRequired would defeat the
    // whole point of the requirement matrix (§3.2, phase-3 brief).
    loadActiveRequirements(input.plantId),
  ]);

  // Read unconditionally: workstationId feeds WORKSTATION-scope resolution
  // regardless of the medical-fitness parameter. validUntil is still the only
  // occupational-health field ever read for medical fitness (never examDate
  // or status, §2.1).
  const occupationalHealthWorker = await prisma.occupationalHealthWorker.findUnique({
    where: { plantId_employeeNo: { plantId: input.plantId, employeeNo: competenceWorker.employee.employeeNo } },
    select: { validUntil: true, workstationId: true },
  });

  const { isRequired, requirementSource } = resolveCompetenceRequirement(
    {
      areaId: competenceWorker.areaId,
      roleName: competenceWorker.roleName,
      workstationId: occupationalHealthWorker?.workstationId ?? null,
    },
    input.competenceTypeId,
    requirements,
  );

  const medicalFitnessExpired = Boolean(
    input.medicalFitnessBlocksAuthorization
      && occupationalHealthWorker?.validUntil
      && isBeforeInLisbon(occupationalHealthWorker.validUntil, input.now),
  );

  const computed = computeCompetenceCellState({
    now: input.now,
    isRequired,
    requirementSource,
    requiresAssessment: competenceType.requiresAssessment,
    authorizations,
    trainingRecords,
    assessments,
    expiringThresholdDays: input.expiringThresholdDays,
    medicalFitnessBlocksAuthorization: input.medicalFitnessBlocksAuthorization,
    medicalFitnessExpired,
  });

  await tx.workerCompetenceState.upsert({
    where: {
      competenceWorkerId_competenceTypeId: {
        competenceWorkerId: input.competenceWorkerId,
        competenceTypeId: input.competenceTypeId,
      },
    },
    update: {
      isRequired: computed.isRequired,
      requirementSource: computed.requirementSource,
      state: computed.state,
      validUntil: computed.validUntil,
      daysToExpiry: computed.daysToExpiry,
      currentAuthorizationId: computed.currentAuthorizationId,
      blockedReason: computed.blockedReason,
      computedAt: input.now,
    },
    create: {
      plantId: input.plantId,
      competenceWorkerId: input.competenceWorkerId,
      competenceTypeId: input.competenceTypeId,
      isRequired: computed.isRequired,
      requirementSource: computed.requirementSource,
      state: computed.state,
      validUntil: computed.validUntil,
      daysToExpiry: computed.daysToExpiry,
      currentAuthorizationId: computed.currentAuthorizationId,
      blockedReason: computed.blockedReason,
      computedAt: input.now,
    },
  });

  return computed;
}

export const CompetenceService = {
  async list(plantId: string, locale: string, viewer?: { role: RoleCode; userId: string }): Promise<CompetenceMatrixView> {
    const [competenceTypes, workers] = await Promise.all([
      loadActiveCompetenceTypes(plantId),
      prisma.competenceWorker.findMany({
        where: { plantId, isActive: true },
        include: {
          employee: true,
          area: true,
          states: true,
        },
        orderBy: { employee: { name: "asc" } },
      }),
    ]);

    let visibleWorkers = workers;
    if (viewer?.role === RoleCode.N5_OPERATOR) {
      const self = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { employeeDirectoryId: true } });
      visibleWorkers = self?.employeeDirectoryId
        ? workers.filter((worker) => worker.employeeDirectoryId === self.employeeDirectoryId)
        : [];
    }

    const areaRows = visibleWorkers
      .map((worker) => worker.area)
      .filter((area): area is NonNullable<typeof area> => Boolean(area));
    const localizedAreas = await localizeMasterDataRows(MasterDataEntityType.AREA, areaRows, locale);
    const areaNameById = new Map(localizedAreas.map((area) => [area.id, area.name]));

    return {
      competenceTypes: competenceTypes.map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        category: type.category,
        displayOrder: type.displayOrder,
      })),
      workers: visibleWorkers.map((worker) => {
        const stateByTypeId = new Map(worker.states.map((state) => [state.competenceTypeId, state]));
        return {
          id: worker.id,
          employeeDirectoryId: worker.employeeDirectoryId,
          employeeNo: worker.employee.employeeNo,
          name: worker.employee.name,
          deptFallback: worker.employee.dept,
          areaId: worker.areaId,
          areaName: worker.areaId ? areaNameById.get(worker.areaId) ?? worker.area?.name ?? null : null,
          roleName: worker.roleName,
          cells: competenceTypes.map((type) => {
            const state = stateByTypeId.get(type.id);
            return {
              competenceTypeId: type.id,
              state: state?.state ?? CompetenceCellState.NOT_APPLICABLE,
              isRequired: state?.isRequired ?? false,
              requirementSource: state?.requirementSource ?? null,
              validUntil: state?.validUntil ?? null,
              daysToExpiry: state?.daysToExpiry ?? null,
              blockedReason: state?.blockedReason ?? null,
            };
          }),
        };
      }),
    };
  },

  /**
   * Enrolls one or more employees into the competence matrix and computes
   * their initial WorkerCompetenceState rows. Phase 1 has no training,
   * assessment or authorization records yet, so every state is either
   * MISSING (the competence is required) or NOT_APPLICABLE.
   */
  async enroll(plantId: string, input: EnrollCompetenceWorkersInput, actorUserId: string | null) {
    const employeeIds = input.workers.map((worker) => worker.employeeDirectoryId);
    const areaIds = Array.from(new Set(input.workers.map((worker) => worker.areaId)));

    const [employees, areas, competenceTypes, requirements] = await Promise.all([
      prisma.employeeDirectory.findMany({
        where: { id: { in: employeeIds }, plantId },
        select: { id: true, employeeNo: true, name: true, dept: true },
      }),
      prisma.area.findMany({
        where: { id: { in: areaIds }, plantId },
        select: { id: true },
      }),
      loadActiveCompetenceTypes(plantId),
      loadActiveRequirements(plantId),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const validAreaIds = new Set(areas.map((area) => area.id));
    const workstationIdByEmployeeNo = await loadWorkstationIdsByEmployeeNo(
      plantId,
      employees.map((employee) => employee.employeeNo),
    );

    for (const worker of input.workers) {
      if (!employeeById.has(worker.employeeDirectoryId)) {
        throw new Error(`Employee not found for plant scope: ${worker.employeeDirectoryId}`);
      }
      if (!validAreaIds.has(worker.areaId)) {
        throw new Error(`Area not found for plant scope: ${worker.areaId}`);
      }
    }

    const enrolled = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const workerInput of input.workers) {
        const employee = employeeById.get(workerInput.employeeDirectoryId)!;
        const roleName = null as string | null;

        const competenceWorker = await tx.competenceWorker.upsert({
          where: {
            plantId_employeeDirectoryId: {
              plantId,
              employeeDirectoryId: workerInput.employeeDirectoryId,
            },
          },
          update: {
            areaId: workerInput.areaId,
            isActive: true,
          },
          create: {
            plantId,
            employeeDirectoryId: workerInput.employeeDirectoryId,
            areaId: workerInput.areaId,
            roleName,
            addedById: actorUserId,
          },
        });

        for (const competenceType of competenceTypes) {
          const { isRequired, requirementSource } = resolveCompetenceRequirement(
            {
              areaId: competenceWorker.areaId,
              roleName: competenceWorker.roleName,
              workstationId: workstationIdByEmployeeNo.get(employee.employeeNo) ?? null,
            },
            competenceType.id,
            requirements,
          );

          await tx.workerCompetenceState.upsert({
            where: {
              competenceWorkerId_competenceTypeId: {
                competenceWorkerId: competenceWorker.id,
                competenceTypeId: competenceType.id,
              },
            },
            update: {
              isRequired,
              requirementSource,
              state: isRequired ? CompetenceCellState.MISSING : CompetenceCellState.NOT_APPLICABLE,
              computedAt: new Date(),
            },
            create: {
              plantId,
              competenceWorkerId: competenceWorker.id,
              competenceTypeId: competenceType.id,
              isRequired,
              requirementSource,
              state: isRequired ? CompetenceCellState.MISSING : CompetenceCellState.NOT_APPLICABLE,
            },
          });
        }

        await writeAuditLog({
          entityType: "CompetenceWorker",
          entityId: competenceWorker.id,
          action: "ENROLLED",
          actorUserId,
          plantId,
          diff: buildDiff(null, {
            employeeDirectoryId: workerInput.employeeDirectoryId,
            employeeNo: employee.employeeNo,
            areaId: workerInput.areaId,
          }),
        });

        results.push(competenceWorker);
      }

      return results;
    });

    return enrolled;
  },

  /** Registers a completed training. N3_SAFETY and N4_SUPERVISOR (plus the N0/N1 bypass). */
  async registerTraining(plantId: string, input: RegisterTrainingInput, actorUserId: string) {
    const now = new Date();
    await assertWorkerAndTypeInPlant(plantId, input.competenceWorkerId, input.competenceTypeId);
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    return prisma.$transaction(async (tx) => {
      const trainingRecord = await tx.trainingRecord.create({
        data: {
          plantId,
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          provider: input.provider ?? null,
          trainerName: input.trainerName ?? null,
          completedAt: input.completedAt,
          durationHours: input.durationHours ?? null,
          certificateNumber: input.certificateNumber ?? null,
          certificateExpiresAt: input.certificateExpiresAt ?? null,
          result: input.result,
          notes: input.notes ?? null,
          createdById: actorUserId,
        },
      });

      await writeAuditLog({
        entityType: "TrainingRecord",
        entityId: trainingRecord.id,
        action: "REGISTERED",
        actorUserId,
        plantId,
        diff: buildDiff(null, {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          result: input.result,
          completedAt: input.completedAt,
        }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: input.competenceWorkerId,
        competenceTypeId: input.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return trainingRecord;
    });
  },

  /**
   * Registers a practical assessment. assessorUserId is always the caller
   * (never client-supplied) unless an external evaluator name is given —
   * AUTHORIZATION_SEGREGATION_OF_DUTIES depends on this field being trustworthy.
   */
  async registerAssessment(plantId: string, input: RegisterAssessmentInput, actorUserId: string) {
    const now = new Date();
    await assertWorkerAndTypeInPlant(plantId, input.competenceWorkerId, input.competenceTypeId);
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    return prisma.$transaction(async (tx) => {
      const assessmentRecord = await tx.competenceAssessment.create({
        data: {
          plantId,
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          trainingRecordId: input.trainingRecordId ?? null,
          assessedAt: input.assessedAt,
          assessorUserId: input.assessorName ? null : actorUserId,
          assessorName: input.assessorName ?? null,
          method: input.method,
          result: input.result,
          score: input.score ?? null,
          observations: input.observations ?? null,
          createdById: actorUserId,
        },
      });

      await writeAuditLog({
        entityType: "CompetenceAssessment",
        entityId: assessmentRecord.id,
        action: "REGISTERED",
        actorUserId,
        plantId,
        diff: buildDiff(null, {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          result: input.result,
          assessedAt: input.assessedAt,
        }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: input.competenceWorkerId,
        competenceTypeId: input.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return assessmentRecord;
    });
  },

  /**
   * Grants (or renews) a formal authorization. Renewal never extends an
   * existing row — it creates a new one and marks the previous ACTIVE/SUSPENDED
   * authorization SUPERSEDED (§2.5, rule 8). validUntil is computed once, from
   * CompetenceType.validityMonths at the moment of granting (rule 9) — later
   * catalog edits never touch authorizations already granted.
   */
  async grantAuthorization(plantId: string, input: GrantAuthorizationInput, actorUserId: string) {
    const now = new Date();
    const { competenceType } = await assertWorkerAndTypeInPlant(plantId, input.competenceWorkerId, input.competenceTypeId);
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization, segregationOfDuties] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
      getAuthorizationSegregationOfDuties(plantId),
    ]);

    if (segregationOfDuties && input.assessmentId) {
      const assessmentRecord = await prisma.competenceAssessment.findUnique({
        where: { id: input.assessmentId },
        select: { assessorUserId: true },
      });
      if (assessmentRecord?.assessorUserId && assessmentRecord.assessorUserId === actorUserId) {
        throw new Error(
          "Segregation of duties: the user who performed the practical assessment cannot grant this authorization",
        );
      }
    }

    const validUntil = addMonths(input.validFrom, competenceType.validityMonths);

    return prisma.$transaction(async (tx) => {
      const previousCurrent = await tx.workerAuthorization.findFirst({
        where: {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          status: { in: [AuthorizationStatus.ACTIVE, AuthorizationStatus.SUSPENDED] },
        },
      });

      const latest = await tx.workerAuthorization.findFirst({
        where: { plantId, sequenceNumber: { not: null } },
        orderBy: { sequenceNumber: "desc" },
        select: { sequenceNumber: true },
      });

      const authorization = await tx.workerAuthorization.create({
        data: {
          plantId,
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          trainingRecordId: input.trainingRecordId ?? null,
          assessmentId: input.assessmentId ?? null,
          sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
          grantedByUserId: actorUserId,
          validFrom: input.validFrom,
          validUntil,
          restrictions: input.restrictions ?? null,
          status: AuthorizationStatus.ACTIVE,
        },
      });

      if (previousCurrent) {
        await tx.workerAuthorization.update({
          where: { id: previousCurrent.id },
          data: { status: AuthorizationStatus.SUPERSEDED, supersededById: authorization.id },
        });
      }

      await writeAuditLog({
        entityType: "WorkerAuthorization",
        entityId: authorization.id,
        action: "GRANTED",
        actorUserId,
        plantId,
        diff: buildDiff(previousCurrent ? { supersededAuthorizationId: previousCurrent.id } : null, {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          validFrom: input.validFrom,
          validUntil,
        }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: input.competenceWorkerId,
        competenceTypeId: input.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return authorization;
    });
  },

  /** Cautionary, immediate. N2_PLANT_MANAGER, N3_SAFETY and N4_SUPERVISOR (plus N0/N1 bypass). */
  async suspendAuthorization(plantId: string, authorizationId: string, reason: string, actorUserId: string) {
    const now = new Date();
    const authorization = await prisma.workerAuthorization.findFirst({ where: { id: authorizationId, plantId } });
    if (!authorization) {
      throw new Error(`Authorization not found for plant scope: ${authorizationId}`);
    }
    if (authorization.status !== AuthorizationStatus.ACTIVE) {
      throw new Error(`Only an ACTIVE authorization can be suspended (current status: ${authorization.status})`);
    }

    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRow = await tx.workerAuthorization.update({
        where: { id: authorizationId },
        data: {
          status: AuthorizationStatus.SUSPENDED,
          suspendedAt: now,
          suspendedByUserId: actorUserId,
          suspensionReason: reason,
        },
      });

      await writeAuditLog({
        entityType: "WorkerAuthorization",
        entityId: authorizationId,
        action: "SUSPENDED",
        actorUserId,
        plantId,
        diff: buildDiff({ status: authorization.status }, { status: updatedRow.status, suspensionReason: reason }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: authorization.competenceWorkerId,
        competenceTypeId: authorization.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return updatedRow;
    });

    // §7.2, immediate on write — best effort, never fails the suspend itself.
    try {
      await CompetenceAlertService.dispatchAuthorizationSuspended(authorizationId);
    } catch (error) {
      logger.error({ error, authorizationId }, "failed_to_dispatch_authorization_suspended_alert");
    }

    return updated;
  },

  /**
   * Lifts a cautionary suspension. Not in §9's route list, but the service
   * method is explicit in the phase-2 brief and the cell detail panel needs a
   * working counterpart to "suspend" — gated the same way (N2/N3/N4 + bypass).
   * suspendedAt/suspensionReason are kept for history; only status flips back.
   */
  async reactivateAuthorization(plantId: string, authorizationId: string, actorUserId: string, note?: string | null) {
    const now = new Date();
    const authorization = await prisma.workerAuthorization.findFirst({ where: { id: authorizationId, plantId } });
    if (!authorization) {
      throw new Error(`Authorization not found for plant scope: ${authorizationId}`);
    }
    if (authorization.status !== AuthorizationStatus.SUSPENDED) {
      throw new Error(`Only a SUSPENDED authorization can be reactivated (current status: ${authorization.status})`);
    }

    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.workerAuthorization.update({
        where: { id: authorizationId },
        data: {
          status: AuthorizationStatus.ACTIVE,
          reactivatedAt: now,
          reactivatedByUserId: actorUserId,
        },
      });

      await writeAuditLog({
        entityType: "WorkerAuthorization",
        entityId: authorizationId,
        action: "REACTIVATED",
        actorUserId,
        plantId,
        diff: buildDiff({ status: authorization.status }, { status: updated.status, note: note ?? null }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: authorization.competenceWorkerId,
        competenceTypeId: authorization.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return updated;
    });
  },

  /** Definitive. N3_SAFETY only (plus N0/N1 bypass) — N2/N4 cannot revoke. */
  async revokeAuthorization(plantId: string, authorizationId: string, reason: string, actorUserId: string) {
    const now = new Date();
    const authorization = await prisma.workerAuthorization.findFirst({ where: { id: authorizationId, plantId } });
    if (!authorization) {
      throw new Error(`Authorization not found for plant scope: ${authorizationId}`);
    }
    if (authorization.status !== AuthorizationStatus.ACTIVE && authorization.status !== AuthorizationStatus.SUSPENDED) {
      throw new Error(`Only an ACTIVE or SUSPENDED authorization can be revoked (current status: ${authorization.status})`);
    }

    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRow = await tx.workerAuthorization.update({
        where: { id: authorizationId },
        data: {
          status: AuthorizationStatus.REVOKED,
          revokedAt: now,
          revokedByUserId: actorUserId,
          revocationReason: reason,
        },
      });

      await writeAuditLog({
        entityType: "WorkerAuthorization",
        entityId: authorizationId,
        action: "REVOKED",
        actorUserId,
        plantId,
        diff: buildDiff({ status: authorization.status }, { status: updatedRow.status, revocationReason: reason }),
      });

      await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId: authorization.competenceWorkerId,
        competenceTypeId: authorization.competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return updatedRow;
    });

    // §7.2, immediate on write — best effort, never fails the revoke itself.
    try {
      await CompetenceAlertService.dispatchAuthorizationRevoked(authorizationId);
    } catch (error) {
      logger.error({ error, authorizationId }, "failed_to_dispatch_authorization_revoked_alert");
    }

    return updated;
  },

  /**
   * §6.3 individual worker profile. When the viewer is N5_OPERATOR, only
   * their own linked worker is resolvable — anyone else's id returns null,
   * enforced here so no future caller can bypass it through the UI alone.
   */
  async getWorkerProfile(
    plantId: string,
    competenceWorkerId: string,
    locale: string,
    viewer: { role: RoleCode; userId: string },
  ): Promise<CompetenceWorkerProfileView | null> {
    const competenceWorker = await prisma.competenceWorker.findFirst({
      where: { id: competenceWorkerId, plantId },
      include: { employee: true, area: true },
    });
    if (!competenceWorker) return null;

    if (viewer.role === RoleCode.N5_OPERATOR) {
      const self = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { employeeDirectoryId: true } });
      if (!self?.employeeDirectoryId || self.employeeDirectoryId !== competenceWorker.employeeDirectoryId) {
        return null;
      }
    }

    const [competenceTypes, states, occupationalHealthWorker, trainingRecords, assessments, authorizations, workstations] =
      await Promise.all([
        loadActiveCompetenceTypes(plantId),
        prisma.workerCompetenceState.findMany({ where: { competenceWorkerId } }),
        prisma.occupationalHealthWorker.findUnique({
          where: { plantId_employeeNo: { plantId, employeeNo: competenceWorker.employee.employeeNo } },
        }),
        prisma.trainingRecord.findMany({ where: { competenceWorkerId }, orderBy: { completedAt: "desc" } }),
        prisma.competenceAssessment.findMany({ where: { competenceWorkerId }, orderBy: { assessedAt: "desc" } }),
        prisma.workerAuthorization.findMany({
          where: { competenceWorkerId },
          orderBy: { grantedAt: "desc" },
          include: { grantedBy: true, suspendedByUser: true, revokedByUser: true, reactivatedByUser: true },
        }),
        prisma.workstation.findMany({ where: { plantId }, select: { id: true, name: true } }),
      ]);

    const areaRows = competenceWorker.area ? [competenceWorker.area] : [];
    const localizedAreas = await localizeMasterDataRows(MasterDataEntityType.AREA, areaRows, locale);
    const areaName = localizedAreas[0]?.name ?? competenceWorker.area?.name ?? null;
    const workstationName = occupationalHealthWorker?.workstationId
      ? workstations.find((w) => w.id === occupationalHealthWorker.workstationId)?.name ?? null
      : null;

    const stateByTypeId = new Map(states.map((state) => [state.competenceTypeId, state]));
    const competences: CompetenceWorkerCompetenceRow[] = competenceTypes.map((type) => {
      const state = stateByTypeId.get(type.id);
      return {
        competenceTypeId: type.id,
        code: type.code,
        name: type.name,
        category: type.category,
        state: state?.state ?? CompetenceCellState.NOT_APPLICABLE,
        isRequired: state?.isRequired ?? false,
        requirementSource: state?.requirementSource ?? null,
        validUntil: state?.validUntil ?? null,
        daysToExpiry: state?.daysToExpiry ?? null,
        blockedReason: state?.blockedReason ?? null,
        currentAuthorizationId: state?.currentAuthorizationId ?? null,
      };
    });

    const history: CompetenceHistoryEvent[] = [];
    for (const record of trainingRecords) {
      history.push({
        type: "TRAINING",
        id: record.id,
        occurredAt: record.completedAt,
        competenceTypeId: record.competenceTypeId,
        result: record.result,
        provider: record.provider,
        trainerName: record.trainerName,
        certificateExpiresAt: record.certificateExpiresAt,
      });
    }
    for (const record of assessments) {
      history.push({
        type: "ASSESSMENT",
        id: record.id,
        occurredAt: record.assessedAt,
        competenceTypeId: record.competenceTypeId,
        result: record.result,
        method: record.method,
        assessorName: record.assessorName,
      });
    }
    for (const record of authorizations) {
      history.push({
        type: "AUTHORIZATION_GRANTED",
        id: record.id,
        occurredAt: record.grantedAt,
        competenceTypeId: record.competenceTypeId,
        validFrom: record.validFrom,
        validUntil: record.validUntil,
        restrictions: record.restrictions,
        grantedByName: record.grantedBy.name,
      });
      if (record.suspendedAt) {
        history.push({
          type: "AUTHORIZATION_SUSPENDED",
          id: `${record.id}-suspended`,
          occurredAt: record.suspendedAt,
          competenceTypeId: record.competenceTypeId,
          reason: record.suspensionReason,
          actorName: record.suspendedByUser?.name ?? null,
        });
      }
      if (record.reactivatedAt) {
        history.push({
          type: "AUTHORIZATION_REACTIVATED",
          id: `${record.id}-reactivated`,
          occurredAt: record.reactivatedAt,
          competenceTypeId: record.competenceTypeId,
          actorName: record.reactivatedByUser?.name ?? null,
        });
      }
      if (record.revokedAt) {
        history.push({
          type: "AUTHORIZATION_REVOKED",
          id: `${record.id}-revoked`,
          occurredAt: record.revokedAt,
          competenceTypeId: record.competenceTypeId,
          reason: record.revocationReason,
          actorName: record.revokedByUser?.name ?? null,
        });
      }
    }
    history.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return {
      worker: {
        id: competenceWorker.id,
        employeeDirectoryId: competenceWorker.employeeDirectoryId,
        employeeNo: competenceWorker.employee.employeeNo,
        name: competenceWorker.employee.name,
        dept: competenceWorker.employee.dept,
        areaId: competenceWorker.areaId,
        areaName,
        roleName: competenceWorker.roleName,
      },
      occupationalHealth: occupationalHealthWorker
        ? {
            birthDate: occupationalHealthWorker.birthDate,
            gender: occupationalHealthWorker.gender,
            hireDate: occupationalHealthWorker.hireDate,
            roleStartDate: occupationalHealthWorker.roleStartDate,
            nationality: occupationalHealthWorker.nationality,
            workstationName,
          }
        : null,
      competences,
      history,
    };
  },

  /**
   * §3.7(b): bulk recompute triggered when a CompetenceRequirement rule for
   * this competence type changes. Recomputes every active worker's cell for
   * that one type — resolution is re-read fresh inside recomputeAndSaveState,
   * so this is always correct even though it does not try to guess which
   * workers the scope change actually touches.
   */
  async recomputeCompetenceTypeStates(plantId: string, competenceTypeId: string) {
    const now = new Date();
    const [workers, expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      prisma.competenceWorker.findMany({ where: { plantId, isActive: true }, select: { id: true } }),
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    await prisma.$transaction(async (tx) => {
      for (const worker of workers) {
        const computed = await recomputeAndSaveState(tx, {
          plantId,
          competenceWorkerId: worker.id,
          competenceTypeId,
          now,
          expiringThresholdDays,
          medicalFitnessBlocksAuthorization,
        });
        if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
          gaps.push({ competenceWorkerId: worker.id, competenceTypeId });
        }
      }
    });

    if (gaps.length > 0) {
      try {
        await CompetenceAlertService.dispatchRoleWithoutCompetence(plantId, gaps, now);
      } catch (error) {
        logger.error({ error, plantId, competenceTypeId }, "failed_to_dispatch_role_without_competence_alert");
      }
    }
  },

  /**
   * §3.7(c): the daily job's own recompute pass, to capture the passage of
   * time — writes only update states on their own trigger, so an
   * authorization simply approaching its expiry date needs this to ever
   * transition from VALID to EXPIRING/EXPIRED. Each (worker, type) pair gets
   * its own transaction, matching the per-worker-loop pattern already used
   * above rather than one giant plant-wide transaction.
   */
  async recomputeAllStates(plantId: string) {
    const now = new Date();
    const [workers, competenceTypes, expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      prisma.competenceWorker.findMany({ where: { plantId, isActive: true }, select: { id: true } }),
      loadActiveCompetenceTypes(plantId),
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const results: Array<{ competenceWorkerId: string; competenceTypeId: string; computed: ComputedCompetenceCellState }> = [];
    for (const worker of workers) {
      for (const competenceType of competenceTypes) {
        const computed = await prisma.$transaction((tx) =>
          recomputeAndSaveState(tx, {
            plantId,
            competenceWorkerId: worker.id,
            competenceTypeId: competenceType.id,
            now,
            expiringThresholdDays,
            medicalFitnessBlocksAuthorization,
          }),
        );
        results.push({ competenceWorkerId: worker.id, competenceTypeId: competenceType.id, computed });
      }
    }

    return results;
  },

  /**
   * §3.2 note: CompetenceWorker.roleName is the ROLE-scope key. Changing it
   * can add or remove requirements across every competence type at once, so
   * every active type is recomputed here — not just the ones currently
   * shown as required.
   */
  async updateWorkerRole(plantId: string, competenceWorkerId: string, input: UpdateCompetenceWorkerRoleInput, actorUserId: string) {
    const now = new Date();
    const worker = await prisma.competenceWorker.findFirst({ where: { id: competenceWorkerId, plantId } });
    if (!worker) {
      throw new Error(`Competence worker not found for plant scope: ${competenceWorkerId}`);
    }

    const [competenceTypes, expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      loadActiveCompetenceTypes(plantId),
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    const updated = await prisma.$transaction(async (tx) => {
      const updatedRow = await tx.competenceWorker.update({
        where: { id: competenceWorkerId },
        data: { roleName: input.roleName },
      });

      await writeAuditLog({
        entityType: "CompetenceWorker",
        entityId: competenceWorkerId,
        action: "ROLE_UPDATED",
        actorUserId,
        plantId,
        diff: buildDiff({ roleName: worker.roleName }, { roleName: input.roleName }),
      });

      for (const competenceType of competenceTypes) {
        const computed = await recomputeAndSaveState(tx, {
          plantId,
          competenceWorkerId,
          competenceTypeId: competenceType.id,
          now,
          expiringThresholdDays,
          medicalFitnessBlocksAuthorization,
        });
        if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
          gaps.push({ competenceWorkerId, competenceTypeId: competenceType.id });
        }
      }

      return updatedRow;
    });

    if (gaps.length > 0) {
      try {
        await CompetenceAlertService.dispatchRoleWithoutCompetence(plantId, gaps, now);
      } catch (error) {
        logger.error({ error, plantId, competenceWorkerId }, "failed_to_dispatch_role_without_competence_alert");
      }
    }

    return updated;
  },

  /** §3.2 admin screen: every requirement rule, active or not, with localized area/workstation names. */
  async listRequirements(plantId: string, locale: string): Promise<CompetenceRequirementView[]> {
    const [requirements, areas, workstations] = await Promise.all([
      prisma.competenceRequirement.findMany({
        where: { plantId },
        include: { competenceType: { select: { name: true } } },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      }),
      prisma.area.findMany({ where: { plantId }, select: { id: true, name: true, sourceLanguage: true } }),
      prisma.workstation.findMany({ where: { plantId }, select: { id: true, name: true, sourceLanguage: true } }),
    ]);

    const [localizedAreas, localizedWorkstations] = await Promise.all([
      localizeMasterDataRows(MasterDataEntityType.AREA, areas, locale),
      localizeMasterDataRows(MasterDataEntityType.WORKSTATION, workstations, locale),
    ]);
    const areaNameById = new Map(localizedAreas.map((area) => [area.id, area.name]));
    const workstationNameById = new Map(localizedWorkstations.map((workstation) => [workstation.id, workstation.name]));

    return requirements.map((requirement) => ({
      id: requirement.id,
      competenceTypeId: requirement.competenceTypeId,
      competenceTypeName: requirement.competenceType.name,
      scopeType: requirement.scopeType,
      scopeRoleName: requirement.scopeRoleName,
      scopeAreaId: requirement.scopeAreaId,
      scopeAreaName: requirement.scopeAreaId ? areaNameById.get(requirement.scopeAreaId) ?? null : null,
      scopeWorkstationId: requirement.scopeWorkstationId,
      scopeWorkstationName: requirement.scopeWorkstationId ? workstationNameById.get(requirement.scopeWorkstationId) ?? null : null,
      isMandatory: requirement.isMandatory,
      notes: requirement.notes,
      isActive: requirement.isActive,
      createdAt: requirement.createdAt,
    }));
  },

  /**
   * Creates or updates a requirement rule and triggers the bulk recompute for
   * its competence type in the same call (§3.7(b)). Only the scope value that
   * matches scopeType is ever persisted — switching scopeType clears the
   * other two, so a rule can never carry a stale AREA id after being edited
   * into a ROLE rule.
   */
  async upsertRequirement(plantId: string, input: UpsertCompetenceRequirementInput, actorUserId: string) {
    const competenceType = await prisma.competenceType.findFirst({ where: { id: input.competenceTypeId, plantId } });
    if (!competenceType) {
      throw new Error(`Competence type not found for plant scope: ${input.competenceTypeId}`);
    }
    if (input.scopeType === CompetenceRequirementScope.AREA && input.scopeAreaId) {
      const area = await prisma.area.findFirst({ where: { id: input.scopeAreaId, plantId } });
      if (!area) throw new Error(`Area not found for plant scope: ${input.scopeAreaId}`);
    }
    if (input.scopeType === CompetenceRequirementScope.WORKSTATION && input.scopeWorkstationId) {
      const workstation = await prisma.workstation.findFirst({ where: { id: input.scopeWorkstationId, plantId } });
      if (!workstation) throw new Error(`Workstation not found for plant scope: ${input.scopeWorkstationId}`);
    }

    const existing = input.id ? await prisma.competenceRequirement.findFirst({ where: { id: input.id, plantId } }) : null;
    if (input.id && !existing) {
      throw new Error(`Competence requirement not found for plant scope: ${input.id}`);
    }

    const data = {
      competenceTypeId: input.competenceTypeId,
      scopeType: input.scopeType,
      scopeRoleName: input.scopeType === CompetenceRequirementScope.ROLE ? input.scopeRoleName ?? null : null,
      scopeAreaId: input.scopeType === CompetenceRequirementScope.AREA ? input.scopeAreaId ?? null : null,
      scopeWorkstationId: input.scopeType === CompetenceRequirementScope.WORKSTATION ? input.scopeWorkstationId ?? null : null,
      isMandatory: input.isMandatory,
      notes: input.notes ?? null,
      isActive: true,
    };

    const requirement = existing
      ? await prisma.competenceRequirement.update({ where: { id: existing.id }, data })
      : await prisma.competenceRequirement.create({ data: { plantId, ...data, createdById: actorUserId } });

    await writeAuditLog({
      entityType: "CompetenceRequirement",
      entityId: requirement.id,
      action: existing ? "UPDATED" : "CREATED",
      actorUserId,
      plantId,
      diff: buildDiff(existing ?? null, data),
    });

    await CompetenceService.recomputeCompetenceTypeStates(plantId, input.competenceTypeId);

    return requirement;
  },

  /** Logical delete — kept for audit history, matching the CompetenceType catalog convention. */
  async deactivateRequirement(plantId: string, requirementId: string, actorUserId: string) {
    const existing = await prisma.competenceRequirement.findFirst({ where: { id: requirementId, plantId } });
    if (!existing) {
      throw new Error(`Competence requirement not found for plant scope: ${requirementId}`);
    }

    const updated = await prisma.competenceRequirement.update({
      where: { id: requirementId },
      data: { isActive: false },
    });

    await writeAuditLog({
      entityType: "CompetenceRequirement",
      entityId: requirementId,
      action: "DEACTIVATED",
      actorUserId,
      plantId,
      diff: buildDiff({ isActive: true }, { isActive: false }),
    });

    await CompetenceService.recomputeCompetenceTypeStates(plantId, existing.competenceTypeId);

    return updated;
  },

  /**
   * §6.1-style KPI, but for the requirement matrix itself (§10 phase-3 ask):
   * of the roleName values actually present among enrolled workers, how many
   * already have at least one active ROLE-scope rule covering them.
   */
  async getRequirementCoverage(plantId: string): Promise<CompetenceRequirementCoverage> {
    const [workers, roleRules] = await Promise.all([
      prisma.competenceWorker.findMany({ where: { plantId, isActive: true }, select: { roleName: true } }),
      prisma.competenceRequirement.findMany({
        where: { plantId, isActive: true, scopeType: CompetenceRequirementScope.ROLE },
        select: { scopeRoleName: true },
      }),
    ]);

    const distinctRoleNames = Array.from(
      new Set(
        workers
          .map((worker) => worker.roleName)
          .filter((roleName): roleName is string => Boolean(roleName && roleName.trim())),
      ),
    );
    const normalizedRuleRoleNames = new Set(
      roleRules
        .map((rule) => rule.scopeRoleName)
        .filter((roleName): roleName is string => Boolean(roleName))
        .map((roleName) => normalizeText(roleName)),
    );
    const roleNamesWithoutRequirement = distinctRoleNames.filter(
      (roleName) => !normalizedRuleRoleNames.has(normalizeText(roleName)),
    );

    return {
      totalRoles: distinctRoleNames.length,
      rolesWithRequirement: distinctRoleNames.length - roleNamesWithoutRequirement.length,
      roleNamesWithoutRequirement,
      workersWithoutRoleName: workers.filter((worker) => !worker.roleName || !worker.roleName.trim()).length,
      totalWorkers: workers.length,
    };
  },
};
