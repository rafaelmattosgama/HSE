import { ActionPriority, CommunicationSource, CommunicationStatus, CommunicationType, Prisma } from "@prisma/client";
import { addDays } from "date-fns";
import { writeAuditLog, buildDiff } from "@/lib/audit";
import type { CreateCommunicationInput, ManualCloseCommunicationInput, ReopenActionInput, ValidateCommunicationInput } from "@/lib/validation/dtos";
import { prisma } from "@/lib/prisma";
import { calculateLeaveFields, nextStatusAfterValidation } from "@/lib/services/workflow";

export const CommunicationService = {
  async create(input: {
    plantId: string;
    payload: CreateCommunicationInput;
    reporterUserId?: string;
    source?: CommunicationSource;
  }) {
    const leave = calculateLeaveFields({
      eventDatetime: input.payload.eventDatetime,
      hasLeave: input.payload.hasLeave,
      returnDate: input.payload.returnDate,
    });

    const communication = await prisma.communication.create({
      data: {
        plantId: input.plantId,
        type: input.payload.type,
        status: CommunicationStatus.SUBMITTED,
        source: input.source ?? CommunicationSource.BACKOFFICE,
        eventDatetime: input.payload.eventDatetime,
        reporterName: input.payload.reporterName,
        reporterEmployeeNo: input.payload.reporterEmployeeNo,
        reporterUserId: input.reporterUserId,
        targetText: input.payload.targetText,
        targetEmployeeNo: input.payload.targetEmployeeNo,
        targetEmployeeId: input.payload.targetEmployeeId,
        areaId: input.payload.areaId,
        lineId: input.payload.lineId,
        workstationId: input.payload.workstationId,
        equipmentId: input.payload.equipmentId,
        riskThemeId: input.payload.riskThemeId,
        unsafeActTypeId: input.payload.unsafeActTypeId,
        unsafeConditionTypeId: input.payload.unsafeConditionTypeId,
        nearMissTypeId: input.payload.nearMissTypeId,
        description: input.payload.description,
        severityPotential: input.payload.severityPotential,
        isContractor: input.payload.isContractor,
        bodyPartId: input.payload.bodyPartId,
        injuryTypeId: input.payload.injuryTypeId,
        hasLeave: input.payload.hasLeave,
        returnDate: input.payload.returnDate,
        lostDays: leave.lostDays,
        classification: leave.classification,
        attachments: input.payload.attachments?.length
          ? {
              createMany: {
                data: input.payload.attachments,
              },
            }
          : undefined,
      },
      include: {
        attachments: true,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: communication.id,
      action: "CREATE",
      actorUserId: input.reporterUserId,
      plantId: input.plantId,
      diff: {
        before: null,
        after: communication as unknown as Record<string, unknown>,
        fieldsChanged: Object.keys(communication),
      },
    });

    return communication;
  },

  async moveToPendingValidation(communicationId: string, actorUserId: string) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: communicationId } });
    const updated = await prisma.communication.update({
      where: { id: communicationId },
      data: {
        status: CommunicationStatus.PENDING_VALIDATION,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: communicationId,
      action: "MOVE_TO_PENDING_VALIDATION",
      actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    return updated;
  },

  async validate(input: {
    communicationId: string;
    actorUserId: string;
    payload: ValidateCommunicationInput;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } });

    const nextStatus = nextStatusAfterValidation({
      isValid: input.payload.isValid,
      preferredStatus: input.payload.status,
    });

    const updated = await prisma.communication.update({
      where: { id: input.communicationId },
      data: {
        status: nextStatus,
        validatedAt: new Date(),
        validatedBy: input.actorUserId,
        validationNotes: input.payload.notes,
        invalidationReason: input.payload.isValid ? null : input.payload.notes,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: input.communicationId,
      action: "VALIDATE",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    return updated;
  },

  async manualClose(input: {
    communicationId: string;
    actorUserId: string;
    payload: ManualCloseCommunicationInput;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } });

    const updated = await prisma.communication.update({
      where: { id: input.communicationId },
      data: {
        status: CommunicationStatus.CLOSED,
        manuallyClosedBy: input.actorUserId,
        manuallyClosedAt: new Date(),
        manualCloseReason: input.payload.reason,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: input.communicationId,
      action: "MANUAL_CLOSE",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    return updated;
  },

  async reopen(input: {
    communicationId: string;
    actorUserId: string;
    payload: ReopenActionInput;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } });

    const updated = await prisma.communication.update({
      where: { id: input.communicationId },
      data: {
        status: CommunicationStatus.VALID_OPEN,
        manualCloseReason: null,
        manuallyClosedBy: null,
        manuallyClosedAt: null,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: input.communicationId,
      action: "REOPEN",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: {
        ...buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
        after: {
          ...updated,
          reopenReason: input.payload.reason,
        } as unknown as Record<string, unknown>,
      },
    });

    return updated;
  },

  async syncStatusWithActions(communicationId: string) {
    const communication = await prisma.communication.findUniqueOrThrow({ where: { id: communicationId } });
    const blockedStatuses: CommunicationStatus[] = [
      CommunicationStatus.REJECTED,
      CommunicationStatus.INVALID,
      CommunicationStatus.SUBMITTED,
      CommunicationStatus.PENDING_VALIDATION,
    ];

    if (blockedStatuses.includes(communication.status)) {
      return communication;
    }

    const openActions = await prisma.action.count({
      where: {
        communicationId,
        status: {
          in: ["OPEN", "ONGOING"],
        },
      },
    });

    const nextStatus = openActions > 0 ? CommunicationStatus.ONGOING : CommunicationStatus.CLOSED;

    if (communication.status !== nextStatus) {
      return prisma.communication.update({
        where: { id: communicationId },
        data: { status: nextStatus },
      });
    }

    return communication;
  },

  suggestDueDate(priority: ActionPriority, from = new Date()) {
    const daysByPriority: Record<ActionPriority, number> = {
      LOW: 21,
      MEDIUM: 14,
      HIGH: 7,
    };

    return addDays(from, daysByPriority[priority]);
  },

  buildKpiFilter() {
    return {
      status: {
        in: [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED],
      },
    } satisfies Prisma.CommunicationWhereInput;
  },

  isN6AllowedType(type: CommunicationType) {
    const allowed: CommunicationType[] = [
      CommunicationType.UNSAFE_ACT,
      CommunicationType.UNSAFE_CONDITION,
      CommunicationType.NEAR_MISS,
    ];
    return allowed.includes(type);
  },
};
