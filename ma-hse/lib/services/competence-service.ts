import {
  type ActionPriority,
  type ActionStatus,
  AuthorizationStatus,
  CompetenceAssessmentMethod,
  CompetenceAssessmentResult,
  CompetenceCellState,
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
  type ComputedCompetenceCellState,
} from "@/lib/services/competence-state-service";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import type {
  EnrollCompetenceWorkersInput,
  GrantAuthorizationInput,
  RegisterAssessmentInput,
  RegisterTrainingInput,
  SetCompetenceWorkerRequirementInput,
  UpdateCompetenceWorkerRoleInput,
  UpsertCompetenceTypeInput,
} from "@/lib/validation/dtos";

type TransactionClient = Prisma.TransactionClient;

export class CompetenceValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "CompetenceValidationError";
  }
}

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

export type CompetencePlantAuthorizationCoverage = {
  requiredTotal: number;
  validCount: number;
  coveragePercent: number | null;
  expiredCount: number;
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
  requirementSetAt: Date | null;
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
  actionLinks: CompetenceLinkedActionView[];
};

/**
 * §8: an Action created from a gap, via CompetenceActionLink (never a direct
 * FK on Action — see CompetenceActionLink's own comment in schema.prisma).
 * Closing this action never changes WorkerCompetenceState; the detail panel
 * just shows it here as resolved.
 */
export type CompetenceLinkedActionView = {
  id: string;
  competenceTypeId: string;
  actionId: string;
  title: string;
  status: ActionStatus;
  priority: ActionPriority;
  dueDate: Date;
  closedAt: Date | null;
  createdAt: Date;
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
  const [competenceType, competenceWorker, authorizations, trainingRecords, assessments, workerRequirement] = await Promise.all([
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
    // §3.2 (revised): direct per-(worker,type) lookup, replacing the old
    // role/area/workstation rule resolution — a rule set no longer exists,
    // only this one row (or its absence, meaning not required).
    tx.competenceWorkerRequirement.findUnique({
      where: {
        competenceWorkerId_competenceTypeId: {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
        },
      },
      include: { setBy: { select: { name: true } } },
    }),
  ]);

  // Read unconditionally: validUntil is still the only occupational-health
  // field ever read for medical fitness (never examDate or status, §2.1).
  const occupationalHealthWorker = await tx.occupationalHealthWorker.findUnique({
    where: { plantId_employeeNo: { plantId: input.plantId, employeeNo: competenceWorker.employee.employeeNo } },
    select: { validUntil: true },
  });

  const isRequired = workerRequirement?.isRequired ?? false;
  const requirementSource = workerRequirement?.setBy?.name ?? null;

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

/**
 * §3.7(b) core, shared by recomputeCompetenceTypeStates and the item-17 fix:
 * recomputes every active worker's cell for one competence type, inside a
 * caller-supplied tx so a write that triggers this (a requirement rule
 * change) and the recompute it causes commit or roll back together.
 */
async function recomputeCompetenceTypeStatesInTx(
  tx: TransactionClient,
  input: {
    plantId: string;
    competenceTypeId: string;
    now: Date;
    expiringThresholdDays: number;
    medicalFitnessBlocksAuthorization: boolean;
  },
): Promise<Array<{ competenceWorkerId: string; competenceTypeId: string }>> {
  const workers = await tx.competenceWorker.findMany({ where: { plantId: input.plantId, isActive: true }, select: { id: true } });
  const gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];

  for (const worker of workers) {
    const computed = await recomputeAndSaveState(tx, {
      plantId: input.plantId,
      competenceWorkerId: worker.id,
      competenceTypeId: input.competenceTypeId,
      now: input.now,
      expiringThresholdDays: input.expiringThresholdDays,
      medicalFitnessBlocksAuthorization: input.medicalFitnessBlocksAuthorization,
    });
    if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
      gaps.push({ competenceWorkerId: worker.id, competenceTypeId: input.competenceTypeId });
    }
  }

  return gaps;
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
   * Enrolls one or more employees into the competence matrix. §3.2 (revised):
   * nothing is required at enrollment time — CompetenceWorkerRequirement
   * rows are set explicitly afterward, per worker, from the profile screen
   * (Task 8). Every cell starts NOT_APPLICABLE, computed through the same
   * recomputeAndSaveState path a later requirement-toggle uses, so enrollment
   * never produces a state a normal recompute couldn't also produce.
   */
  async enroll(plantId: string, input: EnrollCompetenceWorkersInput, actorUserId: string | null) {
    const employeeIds = input.workers.map((worker) => worker.employeeDirectoryId);
    const areaIds = Array.from(new Set(input.workers.map((worker) => worker.areaId)));

    const [employees, areas, competenceTypes, expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      prisma.employeeDirectory.findMany({
        where: { id: { in: employeeIds }, plantId },
        select: { id: true, employeeNo: true, name: true, dept: true },
      }),
      prisma.area.findMany({
        where: { id: { in: areaIds }, plantId },
        select: { id: true },
      }),
      loadActiveCompetenceTypes(plantId),
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const validAreaIds = new Set(areas.map((area) => area.id));

    for (const worker of input.workers) {
      if (!employeeById.has(worker.employeeDirectoryId)) {
        throw new Error(`Employee not found for plant scope: ${worker.employeeDirectoryId}`);
      }
      if (!validAreaIds.has(worker.areaId)) {
        throw new Error(`Area not found for plant scope: ${worker.areaId}`);
      }
    }

    const now = new Date();
    const enrolled = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const workerInput of input.workers) {
        const employee = employeeById.get(workerInput.employeeDirectoryId)!;

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
            roleName: null,
            addedById: actorUserId,
          },
        });

        for (const competenceType of competenceTypes) {
          await recomputeAndSaveState(tx, {
            plantId,
            competenceWorkerId: competenceWorker.id,
            competenceTypeId: competenceType.id,
            now,
            expiringThresholdDays,
            medicalFitnessBlocksAuthorization,
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
        }, tx);

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
      }, tx);

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
    const { competenceType } = await assertWorkerAndTypeInPlant(plantId, input.competenceWorkerId, input.competenceTypeId);
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    return prisma.$transaction(async (tx) => {
      if (competenceType.requiresTraining && !input.trainingRecordId) {
        throw new CompetenceValidationError(
          "TRAINING_LINK_REQUIRED",
          `Competence type "${competenceType.name}" requires training: link the passed training record when registering this assessment.`,
        );
      }

      if (input.trainingRecordId) {
        const trainingRecord = await tx.trainingRecord.findFirst({
          where: {
            id: input.trainingRecordId,
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
          },
          select: { id: true },
        });
        if (!trainingRecord) {
          throw new CompetenceValidationError(
            "TRAINING_NOT_FOUND",
            "The referenced training record was not found for this worker and competence type in this plant.",
          );
        }
      }

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
      }, tx);

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

    const validUntil = addMonths(input.validFrom, competenceType.validityMonths);

    return prisma.$transaction(async (tx) => {
      // item 9: serializes concurrent grants for this plant before either one
      // reads the current max sequenceNumber below — without it, two
      // concurrent READ COMMITTED transactions can read the same max and the
      // second aborts with a raw P2002 instead of a clean validation error.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`authorization:seq:${plantId}`}))`;

      if (!competenceType.requiresAuthorization) {
        throw new CompetenceValidationError(
          "AUTHORIZATION_NOT_REQUIRED",
          `Competence type "${competenceType.name}" does not require a formal authorization.`,
        );
      }

      if (competenceType.requiresTraining) {
        const passedTraining = await tx.trainingRecord.findFirst({
          where: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            result: TrainingResult.PASSED,
          },
          select: { id: true },
        });
        if (!passedTraining) {
          throw new CompetenceValidationError(
            "TRAINING_REQUIRED",
            `Competence type "${competenceType.name}" requires a passed training record before an authorization can be granted.`,
          );
        }
      }

      if (competenceType.requiresAssessment) {
        const competentAssessment = await tx.competenceAssessment.findFirst({
          where: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            result: CompetenceAssessmentResult.COMPETENT,
          },
          select: { id: true },
        });
        if (!competentAssessment) {
          throw new CompetenceValidationError(
            "ASSESSMENT_REQUIRED",
            `Competence type "${competenceType.name}" requires a competent practical assessment before an authorization can be granted.`,
          );
        }
      }

      // Resolved from data, not from input.assessmentId: the field is optional, so the
      // same assessor who evaluated this worker could otherwise omit it and self-grant.
      if (segregationOfDuties) {
        const blocking = await tx.competenceAssessment.findFirst({
          where: {
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
            result: CompetenceAssessmentResult.COMPETENT,
            assessorUserId: actorUserId,
          },
          orderBy: { assessedAt: "desc" },
        });
        if (blocking) {
          throw new CompetenceValidationError(
            "SEGREGATION_OF_DUTIES",
            "Segregation of duties: the user who performed a competent practical assessment for this worker and competence type cannot grant this authorization.",
          );
        }
      }

      // Additive, not a substitute for the data-driven check above: still validates
      // that a client-supplied assessmentId is in scope and, if segregation applies,
      // was not authored by this same actor.
      if (input.assessmentId) {
        const assessmentRecord = await tx.competenceAssessment.findFirst({
          where: {
            id: input.assessmentId,
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
          },
          select: { assessorUserId: true },
        });
        if (!assessmentRecord) {
          throw new CompetenceValidationError(
            "ASSESSMENT_NOT_FOUND",
            "The referenced assessment was not found for this worker and competence type in this plant.",
          );
        }
        if (segregationOfDuties && assessmentRecord.assessorUserId && assessmentRecord.assessorUserId === actorUserId) {
          throw new CompetenceValidationError(
            "SEGREGATION_OF_DUTIES",
            "Segregation of duties: the user who performed the referenced practical assessment cannot grant this authorization.",
          );
        }
      }

      if (input.trainingRecordId) {
        const trainingRecord = await tx.trainingRecord.findFirst({
          where: {
            id: input.trainingRecordId,
            plantId,
            competenceWorkerId: input.competenceWorkerId,
            competenceTypeId: input.competenceTypeId,
          },
          select: { id: true },
        });
        if (!trainingRecord) {
          throw new CompetenceValidationError(
            "TRAINING_NOT_FOUND",
            "The referenced training record was not found for this worker and competence type in this plant.",
          );
        }
      }

      // item 10: a renewal must never silently lift a cautionary suspension.
      // orderBy is required here — without it, more than one ACTIVE/SUSPENDED
      // row (which should not happen, but isn't itself impossible) would be
      // superseded non-deterministically below.
      const previousCurrent = await tx.workerAuthorization.findFirst({
        where: {
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          status: { in: [AuthorizationStatus.ACTIVE, AuthorizationStatus.SUSPENDED] },
        },
        orderBy: { grantedAt: "desc" },
      });

      if (previousCurrent?.status === AuthorizationStatus.SUSPENDED) {
        throw new CompetenceValidationError(
          "SUSPENDED_AUTHORIZATION_REQUIRES_REACTIVATION",
          `This worker has a SUSPENDED authorization for this competence (reason: ${previousCurrent.suspensionReason ?? "not recorded"}). Reactivate it explicitly before granting a new one.`,
        );
      }

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
      }, tx);

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
    if (authorization.status === AuthorizationStatus.EXPIRED) {
      throw new CompetenceValidationError(
        "AUTHORIZATION_EXPIRED",
        "This authorization has already expired and cannot be suspended. Grant a new authorization instead.",
      );
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
      }, tx);

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
    if (authorization.status === AuthorizationStatus.EXPIRED) {
      throw new CompetenceValidationError(
        "AUTHORIZATION_EXPIRED",
        "This authorization has already expired and cannot be reactivated. Grant a new authorization instead.",
      );
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
      }, tx);

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
      }, tx);

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

    const [competenceTypes, states, occupationalHealthWorker, trainingRecords, assessments, authorizations, workstations, actionLinkRows, workerRequirements] =
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
        prisma.competenceActionLink.findMany({
          where: { competenceWorkerId },
          include: { action: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.competenceWorkerRequirement.findMany({ where: { competenceWorkerId }, select: { competenceTypeId: true, setAt: true } }),
      ]);

    const actionLinks: CompetenceLinkedActionView[] = actionLinkRows.map((link) => ({
      id: link.id,
      competenceTypeId: link.competenceTypeId,
      actionId: link.actionId,
      title: link.action.title,
      status: link.action.status,
      priority: link.action.priority,
      dueDate: link.action.dueDate,
      closedAt: link.action.closedAt,
      createdAt: link.createdAt,
    }));

    const areaRows = competenceWorker.area ? [competenceWorker.area] : [];
    const localizedAreas = await localizeMasterDataRows(MasterDataEntityType.AREA, areaRows, locale);
    const areaName = localizedAreas[0]?.name ?? competenceWorker.area?.name ?? null;
    const workstationName = occupationalHealthWorker?.workstationId
      ? workstations.find((w) => w.id === occupationalHealthWorker.workstationId)?.name ?? null
      : null;

    const stateByTypeId = new Map(states.map((state) => [state.competenceTypeId, state]));
    const requirementSetAtByTypeId = new Map(workerRequirements.map((row) => [row.competenceTypeId, row.setAt]));
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
        requirementSetAt: requirementSetAtByTypeId.get(type.id) ?? null,
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
      actionLinks,
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
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const gaps = await prisma.$transaction((tx) =>
      recomputeCompetenceTypeStatesInTx(tx, { plantId, competenceTypeId, now, expiringThresholdDays, medicalFitnessBlocksAuthorization }),
    );

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
  async updateWorkerRole(plantId: string, competenceWorkerId: string, input: UpdateCompetenceWorkerRoleInput, actorUserId: string | null) {
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
      }, tx);

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

  /**
   * §2.7: the catalog belongs to the plant's N3_SAFETY (N1_CORPORATE may also
   * intervene) — see the route for the role gate. Reuses the same
   * (plantId, code) unique constraint as an upsert target so re-creating a
   * type with a previously-deactivated code revives that row instead of
   * colliding with it.
   */
  async upsertCompetenceType(plantId: string, input: UpsertCompetenceTypeInput, actorUserId: string) {
    const code = input.code.trim();
    const name = input.name.trim();

    const existing = input.id
      ? await prisma.competenceType.findFirst({ where: { id: input.id, plantId } })
      : null;
    if (input.id && !existing) {
      throw new Error(`Competence type not found for plant scope: ${input.id}`);
    }

    const data = {
      code,
      name,
      category: input.category,
      requiresTraining: input.requiresTraining,
      requiresAssessment: input.requiresAssessment,
      requiresAuthorization: input.requiresAuthorization,
      validityMonths: input.validityMonths,
      refresherMonths: input.refresherMonths ?? null,
      legalReference: input.legalReference ?? null,
      displayOrder: input.displayOrder,
      isActive: true,
    };

    return prisma.$transaction(async (tx) => {
      const type = existing
        ? await tx.competenceType.update({ where: { id: existing.id }, data })
        : await tx.competenceType.upsert({
            where: { plantId_code: { plantId, code } },
            update: data,
            create: { plantId, ...data },
          });

      await writeAuditLog({
        entityType: "CompetenceType",
        entityId: type.id,
        action: existing ? "UPDATED" : "CREATED",
        actorUserId,
        plantId,
        diff: buildDiff(existing ?? null, data),
      }, tx);

      return type;
    });
  },

  /**
   * §2.7 item 5: a type with WorkerAuthorization, TrainingRecord or
   * CompetenceAssessment history stays blocked from deactivation — those
   * records would become orphaned in a matrix that no longer has the column
   * to show them against. CompetenceRequirement rules are not part of this
   * check; they deactivate independently.
   */
  async deactivateCompetenceType(plantId: string, competenceTypeId: string, actorUserId: string) {
    const existing = await prisma.competenceType.findFirst({ where: { id: competenceTypeId, plantId } });
    if (!existing) {
      throw new Error(`Competence type not found for plant scope: ${competenceTypeId}`);
    }

    const [authorizationCount, trainingCount, assessmentCount] = await Promise.all([
      prisma.workerAuthorization.count({ where: { competenceTypeId } }),
      prisma.trainingRecord.count({ where: { competenceTypeId } }),
      prisma.competenceAssessment.count({ where: { competenceTypeId } }),
    ]);
    const linkedCount = authorizationCount + trainingCount + assessmentCount;
    if (linkedCount > 0) {
      throw new Error(
        `Cannot deactivate: ${linkedCount} linked record(s) exist (${authorizationCount} authorization(s), ${trainingCount} training record(s), ${assessmentCount} assessment(s))`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.competenceType.update({ where: { id: competenceTypeId }, data: { isActive: false } });

      await writeAuditLog({
        entityType: "CompetenceType",
        entityId: competenceTypeId,
        action: "DEACTIVATED",
        actorUserId,
        plantId,
        diff: buildDiff({ isActive: true }, { isActive: false }),
      }, tx);

      return updated;
    });
  },

  /**
   * §2.4: sets or clears whether one competence is required for one enrolled
   * worker — the entire replacement for the old role/area/workstation rule
   * matrix. Always upserts a row (never deletes it) even when isRequired is
   * false, so "who unmarked this and when" stays visible in the worker
   * profile, matching the rest of the module's audit-trail convention.
   */
  async setWorkerCompetenceRequirement(
    plantId: string,
    competenceWorkerId: string,
    competenceTypeId: string,
    input: SetCompetenceWorkerRequirementInput,
    actorUserId: string,
  ) {
    const { competenceWorker, competenceType } = await assertWorkerAndTypeInPlant(plantId, competenceWorkerId, competenceTypeId);
    void competenceWorker;

    const now = new Date();
    const [expiringThresholdDays, medicalFitnessBlocksAuthorization] = await Promise.all([
      getCompetenceExpiringThresholdDays(plantId),
      getMedicalFitnessBlocksAuthorization(plantId),
    ]);

    const gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    const { requirement, computed } = await prisma.$transaction(async (tx) => {
      const requirement = await tx.competenceWorkerRequirement.upsert({
        where: { competenceWorkerId_competenceTypeId: { competenceWorkerId, competenceTypeId } },
        update: { isRequired: input.isRequired, notes: input.notes ?? null, setById: actorUserId, setAt: now },
        create: {
          plantId,
          competenceWorkerId,
          competenceTypeId,
          isRequired: input.isRequired,
          notes: input.notes ?? null,
          setById: actorUserId,
        },
      });

      await writeAuditLog({
        entityType: "CompetenceWorkerRequirement",
        entityId: requirement.id,
        action: "UPDATED",
        actorUserId,
        plantId,
        diff: buildDiff(null, { competenceWorkerId, competenceTypeId, isRequired: input.isRequired }),
      }, tx);

      const computed = await recomputeAndSaveState(tx, {
        plantId,
        competenceWorkerId,
        competenceTypeId,
        now,
        expiringThresholdDays,
        medicalFitnessBlocksAuthorization,
      });

      return { requirement, computed };
    });

    if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
      gaps.push({ competenceWorkerId, competenceTypeId });
    }

    if (gaps.length > 0) {
      try {
        await CompetenceAlertService.dispatchRoleWithoutCompetence(plantId, gaps, now);
      } catch (error) {
        logger.error({ error, plantId, competenceWorkerId, competenceTypeId }, "failed_to_dispatch_role_without_competence_alert");
      }
    }

    void competenceType;
    return requirement;
  },

  /**
   * §10 phase-6 KPI: coverage of mandatory worker x competence combinations
   * (isRequired = true) that are currently VALID, plus how many are EXPIRED.
   * Batched across plants for the corporate view; a single plantId still
   * goes through the same groupBy so both callers share one code path.
   */
  async getAuthorizationCoverageByPlant(plantIds: string[]): Promise<Map<string, CompetencePlantAuthorizationCoverage>> {
    const byPlant = new Map<string, CompetencePlantAuthorizationCoverage>();
    if (plantIds.length === 0) {
      return byPlant;
    }

    const stateCounts = await prisma.workerCompetenceState.groupBy({
      by: ["plantId", "state"],
      where: { plantId: { in: plantIds }, isRequired: true },
      _count: true,
    });

    for (const plantId of plantIds) {
      const rows = stateCounts.filter((row) => row.plantId === plantId);
      const requiredTotal = rows.reduce((sum, row) => sum + row._count, 0);
      const validCount = rows.find((row) => row.state === CompetenceCellState.VALID)?._count ?? 0;
      const expiredCount = rows.find((row) => row.state === CompetenceCellState.EXPIRED)?._count ?? 0;
      byPlant.set(plantId, {
        requiredTotal,
        validCount,
        coveragePercent: requiredTotal > 0 ? (validCount / requiredTotal) * 100 : null,
        expiredCount,
      });
    }

    return byPlant;
  },

  async getPlantAuthorizationCoverage(plantId: string): Promise<CompetencePlantAuthorizationCoverage> {
    const byPlant = await CompetenceService.getAuthorizationCoverageByPlant([plantId]);
    return byPlant.get(plantId) ?? { requiredTotal: 0, validCount: 0, coveragePercent: null, expiredCount: 0 };
  },
};
