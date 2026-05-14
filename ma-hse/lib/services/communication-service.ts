import { ActionPriority, CommunicationSource, CommunicationStatus, CommunicationType, Prisma, RoleCode } from "@prisma/client";
import { addDays } from "date-fns";
import { writeAuditLog, buildDiff } from "@/lib/audit";
import type { CreateCommunicationInput, ManualCloseCommunicationInput, ReopenActionInput, UpdateCommunicationInput, ValidateCommunicationInput } from "@/lib/validation/dtos";
import { prisma } from "@/lib/prisma";
import { calculateLeaveFields, initialStatusForCommunicationCreation, nextStatusAfterValidation } from "@/lib/services/workflow";
import { NotificationService } from "@/lib/services/notification-service";
import { RepeatabilityAlertService } from "@/lib/services/repeatability-alert-service";
import { SewaService } from "@/lib/services/sewo-service";

const ALERT_TYPES: CommunicationType[] = [
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
  CommunicationType.ACCIDENT,
];

export const CommunicationService = {
  async create(input: {
    plantId: string;
    payload: CreateCommunicationInput;
    reporterUserId?: string;
    source?: CommunicationSource;
    actorRole?: RoleCode | null;
  }) {
    const reporterEmployeeNo = input.payload.reporterEmployeeNo?.trim() || undefined;
    const targetEmployeeNo = input.payload.targetEmployeeNo?.trim() || undefined;
    const [reporterEmployee, targetEmployee] = await Promise.all([
      reporterEmployeeNo
        ? prisma.employeeDirectory.findUnique({
            where: {
              plantId_employeeNo: {
                plantId: input.plantId,
                employeeNo: reporterEmployeeNo,
              },
            },
            select: { id: true, name: true, employeeNo: true },
          })
        : Promise.resolve(null),
      input.payload.targetEmployeeId
        ? prisma.employeeDirectory.findUnique({
            where: { id: input.payload.targetEmployeeId },
            select: { id: true, name: true, employeeNo: true },
          })
        : targetEmployeeNo
          ? prisma.employeeDirectory.findUnique({
              where: {
                plantId_employeeNo: {
                  plantId: input.plantId,
                  employeeNo: targetEmployeeNo,
                },
              },
              select: { id: true, name: true, employeeNo: true },
            })
          : Promise.resolve(null),
    ]);

    const reporterName = input.payload.reporterName.trim() || reporterEmployee?.name || "Unknown reporter";
    const resolvedTargetEmployeeId = input.payload.targetEmployeeId ?? targetEmployee?.id ?? null;
    const resolvedTargetEmployeeNo = targetEmployee?.employeeNo ?? targetEmployeeNo ?? null;
    const resolvedTargetText = input.payload.targetText?.trim() || targetEmployee?.name || undefined;

    const defaultRiskTheme = input.payload.riskThemeId
      ? null
      : await prisma.riskTheme.findFirst({
          where: { plantId: input.plantId, isActive: true },
          orderBy: { code: "asc" },
        });

    const leave = calculateLeaveFields({
      eventDatetime: input.payload.eventDatetime,
      lostDays: input.payload.initialLostDays,
      hasLeave: input.payload.hasLeave,
      returnDate: input.payload.returnDate,
      isFatal: input.payload.isFatal,
    });

    const communication = await prisma.communication.create({
      data: {
        plantId: input.plantId,
        type: input.payload.type,
        status: initialStatusForCommunicationCreation(input.actorRole),
        source: input.source ?? CommunicationSource.BACKOFFICE,
        eventDatetime: input.payload.eventDatetime,
        reporterName,
        reporterEmployeeNo,
        reporterUserId: input.reporterUserId,
        targetText: resolvedTargetText,
        targetEmployeeNo: resolvedTargetEmployeeNo,
        targetEmployeeId: resolvedTargetEmployeeId,
        shiftId: input.payload.shiftId,
        areaId: input.payload.areaId,
        lineId: input.payload.lineId,
        workstationId: input.payload.workstationId,
        equipmentId: input.payload.equipmentId,
        riskThemeId: input.payload.riskThemeId ?? defaultRiskTheme?.id ?? "",
        unsafeActTypeId: input.payload.unsafeActTypeId,
        unsafeConditionTypeId: input.payload.unsafeConditionTypeId,
        nearMissTypeId: input.payload.nearMissTypeId,
        description: input.payload.description,
        suggestedAction: input.payload.suggestedAction,
        severityPotential: input.payload.severityPotential,
        isContractor: input.payload.isContractor,
        bodyPartId: input.payload.bodyPartId,
        injuryTypeId: input.payload.injuryTypeId,
        isFatal: input.payload.isFatal,
        initialLostDays: input.payload.initialLostDays,
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

    if (ALERT_TYPES.includes(communication.type)) {
      await NotificationService.notifyPlantRoles({
        plantId: input.plantId,
        roles: [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
        title: `${communication.type} reported`,
        body: `${communication.reporterName} submitted a ${communication.type} communication for plant alert handling.`,
      });
    }

    await RepeatabilityAlertService.processCommunication({
      communicationId: communication.id,
      plantId: input.plantId,
      eventDatetime: communication.eventDatetime,
      targetEmployeeId: communication.targetEmployeeId,
      targetEmployeeNo: communication.targetEmployeeNo,
      workstationId: communication.workstationId,
      type: communication.type,
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

    if (input.payload.isValid && ALERT_TYPES.includes(updated.type)) {
      await NotificationService.notifyPlantRoles({
        plantId: updated.plantId,
        roles: [RoleCode.N1_CORPORATE],
        title: `${updated.type} validated by N3`,
        body: `Communication ${updated.id} was validated and is ready for corporate follow-up.`,
      });

      await SewaService.createProvisionalFromCommunication({
        communicationId: updated.id,
        actorUserId: input.actorUserId,
      });
    }

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
      CommunicationType.FIRST_AID,
    ];
    return allowed.includes(type);
  },

  async update(input: {
    communicationId: string;
    actorUserId: string;
    payload: UpdateCommunicationInput;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } });
    const reporterEmployeeNo = input.payload.reporterEmployeeNo?.trim() || undefined;
    const targetEmployeeNo = input.payload.targetEmployeeNo?.trim() || undefined;
    const requiresTarget =
      input.payload.type === CommunicationType.UNSAFE_ACT ||
      input.payload.type === CommunicationType.NEAR_MISS ||
      input.payload.type === CommunicationType.FIRST_AID ||
      input.payload.type === CommunicationType.ACCIDENT;
    const needsClinicalFields =
      input.payload.type === CommunicationType.FIRST_AID || input.payload.type === CommunicationType.ACCIDENT;
    const isAccident = input.payload.type === CommunicationType.ACCIDENT;

    const [reporterEmployee, targetEmployee] = await Promise.all([
      reporterEmployeeNo
        ? prisma.employeeDirectory.findUnique({
            where: {
              plantId_employeeNo: {
                plantId: before.plantId,
                employeeNo: reporterEmployeeNo,
              },
            },
            select: { id: true, name: true, employeeNo: true },
          })
        : Promise.resolve(null),
      input.payload.targetEmployeeId
        ? prisma.employeeDirectory.findUnique({
            where: { id: input.payload.targetEmployeeId },
            select: { id: true, name: true, employeeNo: true },
          })
        : targetEmployeeNo
          ? prisma.employeeDirectory.findUnique({
              where: {
                plantId_employeeNo: {
                  plantId: before.plantId,
                  employeeNo: targetEmployeeNo,
                },
              },
              select: { id: true, name: true, employeeNo: true },
            })
          : Promise.resolve(null),
    ]);

    const reporterName = input.payload.reporterName.trim() || reporterEmployee?.name || before.reporterName;
    const resolvedTargetEmployeeId = requiresTarget ? input.payload.targetEmployeeId ?? targetEmployee?.id ?? null : null;
    const resolvedTargetEmployeeNo = requiresTarget ? targetEmployee?.employeeNo ?? targetEmployeeNo ?? null : null;
    const resolvedTargetText = requiresTarget
      ? input.payload.targetText?.trim() || targetEmployee?.name || null
      : null;

    const defaultRiskTheme = input.payload.riskThemeId
      ? null
      : await prisma.riskTheme.findFirst({
          where: { plantId: before.plantId, isActive: true },
          orderBy: { code: "asc" },
        });

    const leave = calculateLeaveFields({
      eventDatetime: input.payload.eventDatetime,
      lostDays: isAccident ? input.payload.initialLostDays : undefined,
      hasLeave: isAccident ? input.payload.hasLeave : false,
      returnDate: isAccident ? input.payload.returnDate : undefined,
      isFatal: needsClinicalFields ? input.payload.isFatal : false,
    });

    const updated = await prisma.communication.update({
      where: { id: input.communicationId },
      data: {
        type: input.payload.type,
        eventDatetime: input.payload.eventDatetime,
        reporterName,
        reporterEmployeeNo,
        targetText: resolvedTargetText,
        targetEmployeeNo: resolvedTargetEmployeeNo,
        targetEmployeeId: resolvedTargetEmployeeId,
        areaId: input.payload.areaId ?? null,
        lineId: input.payload.lineId ?? null,
        workstationId: input.payload.workstationId ?? null,
        equipmentId: input.payload.equipmentId ?? null,
        riskThemeId: input.payload.riskThemeId ?? defaultRiskTheme?.id ?? before.riskThemeId,
        unsafeActTypeId: input.payload.type === CommunicationType.UNSAFE_ACT ? input.payload.unsafeActTypeId ?? null : null,
        unsafeConditionTypeId:
          input.payload.type === CommunicationType.UNSAFE_CONDITION ? input.payload.unsafeConditionTypeId ?? null : null,
        nearMissTypeId: input.payload.type === CommunicationType.NEAR_MISS ? input.payload.nearMissTypeId ?? null : null,
        description: input.payload.description,
        suggestedAction: input.payload.suggestedAction?.trim() || null,
        severityPotential: input.payload.severityPotential ?? null,
        isContractor: input.payload.isContractor ?? false,
        bodyPartId: needsClinicalFields ? input.payload.bodyPartId ?? null : null,
        injuryTypeId: needsClinicalFields ? input.payload.injuryTypeId ?? null : null,
        isFatal: needsClinicalFields ? input.payload.isFatal ?? false : false,
        initialLostDays: isAccident ? input.payload.initialLostDays ?? null : null,
        hasLeave: isAccident ? input.payload.hasLeave ?? false : false,
        returnDate: isAccident ? input.payload.returnDate ?? null : null,
        lostDays: needsClinicalFields ? leave.lostDays : null,
        classification: needsClinicalFields ? leave.classification : null,
      },
    });

    await writeAuditLog({
      entityType: "Communication",
      entityId: input.communicationId,
      action: "UPDATE",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    return updated;
  },
};
