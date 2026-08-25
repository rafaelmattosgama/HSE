import {
  FireChecklistFrequency,
  type FireChecklistItemResponseType,
  FireChecklistItemValue,
  FireChecklistResult,
  FireComplianceCellState,
  type FireEquipmentCategory,
  FireEquipmentStatus,
  type Prisma,
} from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFireEquipmentAnnualWarningDays, getFireEquipmentQuarterlyWarningDays } from "@/lib/services/parameter-service";
import {
  type ComputedFireCompliancePeriodicity,
  calculateFireChecklistOverallResult,
  computeFireCompliancePeriodicity,
} from "@/lib/services/fire-equipment-state-service";
import { FireEquipmentAlertService } from "@/lib/services/fire-equipment-alert-service";
import { type FireEquipmentTagView, toTagView } from "@/lib/services/fire-equipment-tag-service";
import type { CreateFireChecklistExecutionInput, CreateFireEquipmentInput } from "@/lib/validation/dtos";

type TransactionClient = Prisma.TransactionClient;

export type FireEquipmentTypeOption = {
  id: string;
  name: string;
  category: FireEquipmentCategory;
};

export type FireComplianceCellView = {
  state: FireComplianceCellState;
  dueDate: Date | null;
};

export type FireEquipmentListRow = {
  id: string;
  internalCode: string;
  fireEquipmentTypeId: string;
  fireEquipmentTypeName: string;
  areaId: string | null;
  areaName: string | null;
  workstationId: string | null;
  workstationName: string | null;
  locationDescription: string | null;
  status: FireEquipmentStatus;
  quarterly: FireComplianceCellView;
  annual: FireComplianceCellView;
  hasOpenNonConformity: boolean;
  tag: FireEquipmentTagView | null;
};

export type FireEquipmentTypeCoverage = {
  fireEquipmentTypeId: string;
  fireEquipmentTypeName: string;
  totalActive: number;
  compliantPercent: number | null;
};

/** §7.1's six KPI cards, computed from the same rows list() already builds. */
export type FireEquipmentKpis = {
  quarterlyOverdueCount: number;
  annualOverdueCount: number;
  dueSoonCount: number;
  openNonConformityCount: number;
  noTagAssignedCount: number;
  coverageByType: FireEquipmentTypeCoverage[];
};

/**
 * Fase 6: the safety dashboard's KPI group and the corporate multi-plant
 * board both need one plant-level summary — "compliant" mirrors
 * list()'s own coverageByType definition (both periodicities VALID),
 * "problemCount" folds an overdue periodicity (either one) or an open
 * non-conformity into a single count, matching the 2-card shape
 * Competences already uses (coveragePercent + expiredCount).
 */
export type FireEquipmentPlantComplianceCoverage = {
  totalActive: number;
  compliantCount: number;
  coveragePercent: number | null;
  problemCount: number;
};

export type FireEquipmentListView = {
  types: FireEquipmentTypeOption[];
  equipment: FireEquipmentListRow[];
  kpis: FireEquipmentKpis;
};

export type FireEquipmentChecklistItemOption = {
  id: string;
  code: string;
  label: string;
  helpText: string | null;
  responseType: FireChecklistItemResponseType;
  isCritical: boolean;
};

export type FireEquipmentExecutionHistoryRow = {
  id: string;
  frequency: FireChecklistFrequency;
  performedAt: Date;
  performedByName: string;
  performedViaTag: boolean;
  externalProviderName: string | null;
  externalCertificateFileKey: string | null;
  overallResult: FireChecklistResult;
  observations: string | null;
  attachments: Array<{ id: string; fileKey: string; fileName: string }>;
  itemResponses: Array<{
    itemId: string;
    itemLabel: string;
    isCritical: boolean;
    value: FireChecklistItemValue;
    numericValue: number | null;
    textValue: string | null;
    notes: string | null;
  }>;
};

export type FireEquipmentProfileView = {
  equipment: {
    id: string;
    internalCode: string;
    fireEquipmentTypeId: string;
    fireEquipmentTypeName: string;
    areaId: string | null;
    areaName: string | null;
    workstationId: string | null;
    workstationName: string | null;
    locationDescription: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    capacity: string | null;
    installedAt: Date | null;
    manufactureDate: Date | null;
    status: FireEquipmentStatus;
  };
  quarterly: FireComplianceCellView;
  annual: FireComplianceCellView;
  hasOpenNonConformity: boolean;
  tag: FireEquipmentTagView | null;
  checklists: {
    quarterly: FireEquipmentChecklistItemOption[] | null;
    annual: FireEquipmentChecklistItemOption[] | null;
  };
  history: FireEquipmentExecutionHistoryRow[];
};

type ComplianceStateRow = {
  quarterlyState: FireComplianceCellState;
  quarterlyDueDate: Date | null;
  annualState: FireComplianceCellState;
  annualDueDate: Date | null;
  hasOpenNonConformity: boolean;
} | null;

/**
 * §6 step 1 plus the "no row yet" case: equipment created in phase 1 that
 * never had an execution has no FireEquipmentComplianceState row at all —
 * that's read here as NEVER_DONE/NEVER_DONE rather than backfilled. No daily
 * job exists yet (phase 4, mirroring WorkerCompetenceState's own precedent),
 * so a cached row can go stale for date-based transitions between
 * executions — this only fills in the "never computed at all" gap.
 */
function resolveComplianceView(
  equipmentStatus: FireEquipmentStatus,
  complianceState: ComplianceStateRow,
): { quarterly: FireComplianceCellView; annual: FireComplianceCellView; hasOpenNonConformity: boolean } {
  if (equipmentStatus !== FireEquipmentStatus.ACTIVE) {
    return {
      quarterly: { state: FireComplianceCellState.NOT_APPLICABLE, dueDate: null },
      annual: { state: FireComplianceCellState.NOT_APPLICABLE, dueDate: null },
      hasOpenNonConformity: complianceState?.hasOpenNonConformity ?? false,
    };
  }

  if (!complianceState) {
    return {
      quarterly: { state: FireComplianceCellState.NEVER_DONE, dueDate: null },
      annual: { state: FireComplianceCellState.NEVER_DONE, dueDate: null },
      hasOpenNonConformity: false,
    };
  }

  return {
    quarterly: { state: complianceState.quarterlyState, dueDate: complianceState.quarterlyDueDate },
    annual: { state: complianceState.annualState, dueDate: complianceState.annualDueDate },
    hasOpenNonConformity: complianceState.hasOpenNonConformity,
  };
}

function toChecklistItemOption(item: {
  id: string;
  code: string;
  label: string;
  helpText: string | null;
  responseType: FireChecklistItemResponseType;
  isCritical: boolean;
}): FireEquipmentChecklistItemOption {
  return {
    id: item.id,
    code: item.code,
    label: item.label,
    helpText: item.helpText,
    responseType: item.responseType,
    isCritical: item.isCritical,
  };
}

/**
 * Recomputes and persists FireEquipmentComplianceState for one equipment.
 * Must run inside the same $transaction as the FireChecklistExecution write
 * that triggered it (§3.6).
 */
async function recomputeAndSaveComplianceState(
  tx: TransactionClient,
  input: {
    plantId: string;
    fireEquipmentId: string;
    equipmentStatus: FireEquipmentStatus;
    now: Date;
    quarterlyWarningDays: number;
    annualWarningDays: number;
  },
) {
  const [lastQuarterly, lastAnnual, lastOverall] = await Promise.all([
    tx.fireChecklistExecution.findFirst({
      where: { fireEquipmentId: input.fireEquipmentId, frequency: FireChecklistFrequency.QUARTERLY },
      orderBy: { performedAt: "desc" },
      select: { id: true, performedAt: true },
    }),
    tx.fireChecklistExecution.findFirst({
      where: { fireEquipmentId: input.fireEquipmentId, frequency: FireChecklistFrequency.ANNUAL },
      orderBy: { performedAt: "desc" },
      select: { id: true, performedAt: true },
    }),
    tx.fireChecklistExecution.findFirst({
      where: { fireEquipmentId: input.fireEquipmentId },
      orderBy: { performedAt: "desc" },
      select: { overallResult: true },
    }),
  ]);

  const quarterly = computeFireCompliancePeriodicity({
    now: input.now,
    equipmentStatus: input.equipmentStatus,
    frequency: FireChecklistFrequency.QUARTERLY,
    lastExecutionAt: lastQuarterly?.performedAt ?? null,
    lastExecutionId: lastQuarterly?.id ?? null,
    warningWindowDays: input.quarterlyWarningDays,
  });
  const annual = computeFireCompliancePeriodicity({
    now: input.now,
    equipmentStatus: input.equipmentStatus,
    frequency: FireChecklistFrequency.ANNUAL,
    lastExecutionAt: lastAnnual?.performedAt ?? null,
    lastExecutionId: lastAnnual?.id ?? null,
    warningWindowDays: input.annualWarningDays,
  });

  // §9 (Action linkage) is phase 5 — until an Action can be linked back to a
  // non-conformity, "no closed corrective action" reduces to "the most
  // recent execution overall (either periodicity) was FAILED".
  const hasOpenNonConformity =
    input.equipmentStatus === FireEquipmentStatus.ACTIVE && lastOverall?.overallResult === FireChecklistResult.FAILED;

  await tx.fireEquipmentComplianceState.upsert({
    where: { fireEquipmentId: input.fireEquipmentId },
    update: {
      quarterlyState: quarterly.state,
      quarterlyDueDate: quarterly.dueDate,
      quarterlyLastExecutionId: quarterly.lastExecutionId,
      annualState: annual.state,
      annualDueDate: annual.dueDate,
      annualLastExecutionId: annual.lastExecutionId,
      hasOpenNonConformity,
      computedAt: input.now,
    },
    create: {
      plantId: input.plantId,
      fireEquipmentId: input.fireEquipmentId,
      quarterlyState: quarterly.state,
      quarterlyDueDate: quarterly.dueDate,
      quarterlyLastExecutionId: quarterly.lastExecutionId,
      annualState: annual.state,
      annualDueDate: annual.dueDate,
      annualLastExecutionId: annual.lastExecutionId,
      hasOpenNonConformity,
      computedAt: input.now,
    },
  });

  return { quarterly, annual, hasOpenNonConformity };
}

export const FireEquipmentService = {
  /**
   * Fase 4 / §8: recomputes FireEquipmentComplianceState for every active
   * (isActive) equipment in the plant — including OUT_OF_SERVICE/
   * DECOMMISSIONED rows, which computeFireCompliancePeriodicity already
   * resolves to NOT_APPLICABLE on its own (step 1) rather than erroring.
   * Mirrors CompetenceService.recomputeAllStates: one $transaction per
   * equipment, called by jobs/handlers/fire-equipment-due-dates.ts before
   * dispatching §8's alert triggers off the freshly computed rows.
   */
  async recomputeAllComplianceStates(plantId: string): Promise<
    Array<{ fireEquipmentId: string; quarterly: ComputedFireCompliancePeriodicity; annual: ComputedFireCompliancePeriodicity }>
  > {
    const now = new Date();
    const [equipmentRows, quarterlyWarningDays, annualWarningDays] = await Promise.all([
      prisma.fireEquipment.findMany({ where: { plantId, isActive: true }, select: { id: true, status: true } }),
      getFireEquipmentQuarterlyWarningDays(plantId),
      getFireEquipmentAnnualWarningDays(plantId),
    ]);

    const results: Array<{ fireEquipmentId: string; quarterly: ComputedFireCompliancePeriodicity; annual: ComputedFireCompliancePeriodicity }> = [];
    for (const equipment of equipmentRows) {
      const { quarterly, annual } = await prisma.$transaction((tx) =>
        recomputeAndSaveComplianceState(tx, {
          plantId,
          fireEquipmentId: equipment.id,
          equipmentStatus: equipment.status,
          now,
          quarterlyWarningDays,
          annualWarningDays,
        }),
      );
      results.push({ fireEquipmentId: equipment.id, quarterly, annual });
    }

    return results;
  },

  /**
   * §7.1/§7.2: list + KPI cards, both derived from the same equipment rows
   * so the cards and the table can never disagree with each other.
   */
  async list(plantId: string): Promise<FireEquipmentListView> {
    const [types, equipmentRows] = await Promise.all([
      prisma.fireEquipmentType.findMany({
        where: { plantId, isActive: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true },
      }),
      prisma.fireEquipment.findMany({
        where: { plantId, isActive: true },
        orderBy: { internalCode: "asc" },
        include: {
          fireEquipmentType: { select: { name: true } },
          area: { select: { id: true, name: true } },
          workstation: { select: { id: true, name: true } },
          complianceState: true,
          tagAssignments: { where: { isActive: true }, select: { id: true, tagCode: true, tagType: true, assignedAt: true } },
        },
      }),
    ]);

    const equipment: FireEquipmentListRow[] = equipmentRows.map((row) => {
      const compliance = resolveComplianceView(row.status, row.complianceState);
      const activeTag = row.tagAssignments[0];
      return {
        id: row.id,
        internalCode: row.internalCode,
        fireEquipmentTypeId: row.fireEquipmentTypeId,
        fireEquipmentTypeName: row.fireEquipmentType.name,
        areaId: row.area?.id ?? null,
        areaName: row.area?.name ?? null,
        workstationId: row.workstation?.id ?? null,
        workstationName: row.workstation?.name ?? null,
        locationDescription: row.locationDescription,
        status: row.status,
        quarterly: compliance.quarterly,
        annual: compliance.annual,
        hasOpenNonConformity: compliance.hasOpenNonConformity,
        tag: activeTag ? toTagView(activeTag) : null,
      };
    });

    const coverageByType: FireEquipmentTypeCoverage[] = types.map((type) => {
      const typeEquipment = equipment.filter((row) => row.fireEquipmentTypeId === type.id && row.status === FireEquipmentStatus.ACTIVE);
      const compliantCount = typeEquipment.filter(
        (row) => row.quarterly.state === FireComplianceCellState.VALID && row.annual.state === FireComplianceCellState.VALID,
      ).length;
      return {
        fireEquipmentTypeId: type.id,
        fireEquipmentTypeName: type.name,
        totalActive: typeEquipment.length,
        compliantPercent: typeEquipment.length > 0 ? Math.round((compliantCount / typeEquipment.length) * 100) : null,
      };
    });

    const kpis: FireEquipmentKpis = {
      quarterlyOverdueCount: equipment.filter((row) => row.quarterly.state === FireComplianceCellState.OVERDUE).length,
      annualOverdueCount: equipment.filter((row) => row.annual.state === FireComplianceCellState.OVERDUE).length,
      dueSoonCount: equipment.filter(
        (row) => row.quarterly.state === FireComplianceCellState.DUE_SOON || row.annual.state === FireComplianceCellState.DUE_SOON,
      ).length,
      openNonConformityCount: equipment.filter((row) => row.hasOpenNonConformity).length,
      noTagAssignedCount: equipment.filter((row) => !row.tag).length,
      coverageByType,
    };

    return { types, equipment, kpis };
  },

  /** §7.3: equipment profile — identification, current state, checklist item catalog, and execution history. */
  async getProfile(plantId: string, fireEquipmentId: string): Promise<FireEquipmentProfileView | null> {
    const equipment = await prisma.fireEquipment.findFirst({
      where: { id: fireEquipmentId, plantId },
      include: {
        fireEquipmentType: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
        workstation: { select: { id: true, name: true } },
        complianceState: true,
        tagAssignments: { where: { isActive: true }, select: { id: true, tagCode: true, tagType: true, assignedAt: true } },
      },
    });
    if (!equipment) return null;

    const [quarterlyTemplate, annualTemplate, executions] = await Promise.all([
      prisma.fireChecklistTemplate.findFirst({
        where: { plantId, fireEquipmentTypeId: equipment.fireEquipmentTypeId, frequency: FireChecklistFrequency.QUARTERLY, isActive: true },
        include: { items: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
      }),
      prisma.fireChecklistTemplate.findFirst({
        where: { plantId, fireEquipmentTypeId: equipment.fireEquipmentTypeId, frequency: FireChecklistFrequency.ANNUAL, isActive: true },
        include: { items: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
      }),
      prisma.fireChecklistExecution.findMany({
        where: { fireEquipmentId },
        orderBy: { performedAt: "desc" },
        include: {
          performedBy: { select: { name: true } },
          attachments: true,
          itemResponses: { include: { item: { select: { id: true, label: true, isCritical: true } } } },
        },
      }),
    ]);

    const compliance = resolveComplianceView(equipment.status, equipment.complianceState);

    return {
      equipment: {
        id: equipment.id,
        internalCode: equipment.internalCode,
        fireEquipmentTypeId: equipment.fireEquipmentTypeId,
        fireEquipmentTypeName: equipment.fireEquipmentType.name,
        areaId: equipment.area?.id ?? null,
        areaName: equipment.area?.name ?? null,
        workstationId: equipment.workstation?.id ?? null,
        workstationName: equipment.workstation?.name ?? null,
        locationDescription: equipment.locationDescription,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        serialNumber: equipment.serialNumber,
        capacity: equipment.capacity,
        installedAt: equipment.installedAt,
        manufactureDate: equipment.manufactureDate,
        status: equipment.status,
      },
      quarterly: compliance.quarterly,
      annual: compliance.annual,
      hasOpenNonConformity: compliance.hasOpenNonConformity,
      tag: equipment.tagAssignments[0] ? toTagView(equipment.tagAssignments[0]) : null,
      checklists: {
        quarterly: quarterlyTemplate?.items.map(toChecklistItemOption) ?? null,
        annual: annualTemplate?.items.map(toChecklistItemOption) ?? null,
      },
      history: executions.map((execution) => ({
        id: execution.id,
        frequency: execution.frequency,
        performedAt: execution.performedAt,
        performedByName: execution.performedBy.name,
        performedViaTag: execution.performedViaTag,
        externalProviderName: execution.externalProviderName,
        externalCertificateFileKey: execution.externalCertificateFileKey,
        overallResult: execution.overallResult,
        observations: execution.observations,
        attachments: execution.attachments.map((attachment) => ({
          id: attachment.id,
          fileKey: attachment.fileKey,
          fileName: attachment.fileName,
        })),
        itemResponses: execution.itemResponses.map((response) => ({
          itemId: response.itemId,
          itemLabel: response.item.label,
          isCritical: response.item.isCritical,
          value: response.value,
          numericValue: response.numericValue !== null ? Number(response.numericValue) : null,
          textValue: response.textValue,
          notes: response.notes,
        })),
      })),
    };
  },

  /**
   * Fase 0 item 4: RecordCodeService is closed to COMMUNICATION/SEWO/REPORT,
   * and copying WorkerAuthorization.sequenceNumber's own max+1 verbatim would
   * copy a known race too (that counter has no advisory lock and is scoped to
   * plantId only). internalCode is scoped to (plantId, fireEquipmentTypeId)
   * and the read-then-create below is serialized by an advisory lock on that
   * same pair, mirroring action-service.ts's lockCommunicationActionCreation.
   * internalCode is computed once here and is never edited after creation.
   */
  async create(plant: { id: string; code: string }, input: CreateFireEquipmentInput, actorUserId: string | null) {
    const fireEquipmentType = await prisma.fireEquipmentType.findFirst({
      where: { id: input.fireEquipmentTypeId, plantId: plant.id, isActive: true },
      select: { id: true, codePrefix: true },
    });
    if (!fireEquipmentType) {
      throw new Error("Fire equipment type not found for plant scope");
    }

    if (input.areaId) {
      const area = await prisma.area.findFirst({ where: { id: input.areaId, plantId: plant.id }, select: { id: true } });
      if (!area) throw new Error("Area not found for plant scope");
    }

    if (input.workstationId) {
      const workstation = await prisma.workstation.findFirst({
        where: { id: input.workstationId, plantId: plant.id },
        select: { id: true },
      });
      if (!workstation) throw new Error("Workstation not found for plant scope");
    }

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fireEquipment:seq:${plant.id}:${fireEquipmentType.id}`}))`;

      const latest = await tx.fireEquipment.findFirst({
        where: { plantId: plant.id, fireEquipmentTypeId: fireEquipmentType.id },
        orderBy: { sequenceNumber: "desc" },
        select: { sequenceNumber: true },
      });
      const sequenceNumber = (latest?.sequenceNumber ?? 0) + 1;
      const internalCode = `${fireEquipmentType.codePrefix}-${plant.code.toUpperCase()}-${String(sequenceNumber).padStart(4, "0")}`;

      const equipment = await tx.fireEquipment.create({
        data: {
          plantId: plant.id,
          fireEquipmentTypeId: fireEquipmentType.id,
          sequenceNumber,
          internalCode,
          areaId: input.areaId ?? null,
          workstationId: input.workstationId ?? null,
          locationDescription: input.locationDescription ?? null,
          manufacturer: input.manufacturer ?? null,
          model: input.model ?? null,
          serialNumber: input.serialNumber ?? null,
          capacity: input.capacity ?? null,
          installedAt: input.installedAt ?? null,
          manufactureDate: input.manufactureDate ?? null,
          createdById: actorUserId,
        },
      });

      await writeAuditLog(
        {
          entityType: "FireEquipment",
          entityId: equipment.id,
          action: "CREATED",
          actorUserId,
          plantId: plant.id,
          diff: buildDiff(null, {
            fireEquipmentTypeId: fireEquipmentType.id,
            internalCode,
            areaId: input.areaId ?? null,
            workstationId: input.workstationId ?? null,
          }),
        },
        tx,
      );

      return equipment;
    });
  },

  /**
   * §3.5/§7.4: registers one checklist execution. overallResult is always
   * computed here from itemResponses (never a free field from the client),
   * and FireEquipmentComplianceState is recomputed in the same transaction.
   */
  async recordExecution(plant: { id: string }, input: CreateFireChecklistExecutionInput, actorUserId: string) {
    const equipment = await prisma.fireEquipment.findFirst({
      where: { id: input.fireEquipmentId, plantId: plant.id },
      select: { id: true, fireEquipmentTypeId: true, status: true },
    });
    if (!equipment) {
      throw new Error("Fire equipment not found for plant scope");
    }

    const template = await prisma.fireChecklistTemplate.findFirst({
      where: { plantId: plant.id, fireEquipmentTypeId: equipment.fireEquipmentTypeId, frequency: input.frequency, isActive: true },
      include: { items: { where: { isActive: true } } },
    });
    if (!template) {
      throw new Error("No active checklist template found for this equipment type and frequency");
    }

    const itemById = new Map(template.items.map((item) => [item.id, item]));
    for (const item of template.items) {
      if (!input.itemResponses.some((response) => response.itemId === item.id)) {
        throw new Error(`Missing response for checklist item "${item.label}"`);
      }
    }
    for (const response of input.itemResponses) {
      if (!itemById.has(response.itemId)) {
        throw new Error("A checklist item response references an item outside the active template");
      }
    }

    const overallResult = calculateFireChecklistOverallResult(
      input.itemResponses.map((response) => ({
        isCritical: itemById.get(response.itemId)!.isCritical,
        value: response.value,
      })),
    );

    const [quarterlyWarningDays, annualWarningDays] = await Promise.all([
      getFireEquipmentQuarterlyWarningDays(plant.id),
      getFireEquipmentAnnualWarningDays(plant.id),
    ]);

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const execution = await tx.fireChecklistExecution.create({
        data: {
          plantId: plant.id,
          fireEquipmentId: equipment.id,
          templateId: template.id,
          frequency: input.frequency,
          performedAt: input.performedAt ?? now,
          performedByUserId: actorUserId,
          // §5/§7.5 (NFC/QR) is phase 3 — every execution in this phase comes
          // from the plain screen flow.
          performedViaTag: false,
          externalProviderName: input.externalProviderName ?? null,
          externalCertificateFileKey: input.externalCertificateFileKey ?? null,
          overallResult,
          observations: input.observations ?? null,
          itemResponses: {
            create: input.itemResponses.map((response) => ({
              itemId: response.itemId,
              value: response.value,
              numericValue: response.numericValue ?? null,
              textValue: response.textValue ?? null,
              notes: response.notes ?? null,
            })),
          },
          attachments: input.attachments?.length
            ? { create: input.attachments.map((attachment) => ({ fileKey: attachment.fileKey, fileName: attachment.fileName })) }
            : undefined,
        },
      });

      await writeAuditLog(
        {
          entityType: "FireChecklistExecution",
          entityId: execution.id,
          action: "RECORDED",
          actorUserId,
          plantId: plant.id,
          diff: buildDiff(null, {
            fireEquipmentId: equipment.id,
            frequency: input.frequency,
            overallResult,
          }),
        },
        tx,
      );

      const compliance = await recomputeAndSaveComplianceState(tx, {
        plantId: plant.id,
        fireEquipmentId: equipment.id,
        equipmentStatus: equipment.status,
        now,
        quarterlyWarningDays,
        annualWarningDays,
      });

      return { execution, compliance };
    });

    // §8, urgent channel: dispatched after the transaction above has
    // committed, in its own try/catch — mirrors competence-service.ts calling
    // CompetenceAlertService.dispatchAuthorizationSuspended/Revoked post-commit,
    // so a dispatch failure (e.g. email provider down) never rolls back or
    // masks the checklist execution itself.
    try {
      await FireEquipmentAlertService.dispatchNonConformityFound(result.execution.id);
    } catch (error) {
      logger.error({ error, executionId: result.execution.id }, "failed_to_dispatch_fire_equipment_non_conformity_alert");
    }

    return result;
  },

  /**
   * Fase 6: mirrors CompetenceService.getAuthorizationCoverageByPlant —
   * one query plus a JS aggregation pass, not one query per plant. Equipment
   * with no FireEquipmentComplianceState row yet (never executed) is read as
   * NEVER_DONE for both periodicities, matching resolveComplianceView's own
   * "no row yet" fallback used by list()/getProfile().
   */
  async getComplianceCoverageByPlant(plantIds: string[]): Promise<Map<string, FireEquipmentPlantComplianceCoverage>> {
    const byPlant = new Map<string, FireEquipmentPlantComplianceCoverage>();
    if (plantIds.length === 0) {
      return byPlant;
    }

    const equipmentRows = await prisma.fireEquipment.findMany({
      where: { plantId: { in: plantIds }, isActive: true, status: FireEquipmentStatus.ACTIVE },
      select: {
        plantId: true,
        complianceState: { select: { quarterlyState: true, annualState: true, hasOpenNonConformity: true } },
      },
    });

    const totals = new Map<string, FireEquipmentPlantComplianceCoverage>(
      plantIds.map((plantId) => [plantId, { totalActive: 0, compliantCount: 0, coveragePercent: null, problemCount: 0 }]),
    );

    for (const row of equipmentRows) {
      const summary = totals.get(row.plantId);
      if (!summary) continue;

      const quarterlyState = row.complianceState?.quarterlyState ?? FireComplianceCellState.NEVER_DONE;
      const annualState = row.complianceState?.annualState ?? FireComplianceCellState.NEVER_DONE;
      const hasOpenNonConformity = row.complianceState?.hasOpenNonConformity ?? false;

      summary.totalActive += 1;
      if (quarterlyState === FireComplianceCellState.VALID && annualState === FireComplianceCellState.VALID) {
        summary.compliantCount += 1;
      }
      if (
        quarterlyState === FireComplianceCellState.OVERDUE
        || annualState === FireComplianceCellState.OVERDUE
        || hasOpenNonConformity
      ) {
        summary.problemCount += 1;
      }
    }

    for (const [plantId, summary] of totals) {
      summary.coveragePercent = summary.totalActive > 0 ? (summary.compliantCount / summary.totalActive) * 100 : null;
      byPlant.set(plantId, summary);
    }

    return byPlant;
  },

  async getPlantComplianceCoverage(plantId: string): Promise<FireEquipmentPlantComplianceCoverage> {
    const byPlant = await FireEquipmentService.getComplianceCoverageByPlant([plantId]);
    return byPlant.get(plantId) ?? { totalActive: 0, compliantCount: 0, coveragePercent: null, problemCount: 0 };
  },
};
