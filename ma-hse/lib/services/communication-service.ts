import { ActionPriority, CommunicationSource, CommunicationStatus, CommunicationType, Prisma, RoleCode } from "@prisma/client";
import { addDays } from "date-fns";
import { writeAuditLog, buildDiff } from "@/lib/audit";
import { OPEN_LINKED_ACTION_STATUSES } from "@/lib/communication-status";
import type { CreateCommunicationInput, ManualCloseCommunicationInput, ReopenActionInput, UpdateCommunicationInput, ValidateCommunicationInput } from "@/lib/validation/dtos";
import {
  canManageCommunicationClassification,
  getMissingCommunicationClassificationFields,
  requiresNearMissType,
  requiresProfessionalRisk,
  requiresUnsafeConditionType,
  shouldDeferPublicReportNearMissType,
  shouldDeferPublicReportProfessionalRisk,
  shouldDeferPublicReportUnsafeActType,
  shouldDeferPublicReportUnsafeConditionType,
  supportsUnsafeActType,
} from "@/lib/communication-classification";
import { DEFAULT_NEAR_MISS_TYPE_CODES } from "@/lib/defaults/near-miss-types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { calculateLeaveFields, initialStatusForCommunicationCreation, nextStatusAfterValidation } from "@/lib/services/workflow";
import { NotificationService } from "@/lib/services/notification-service";
import { RepeatabilityAlertService } from "@/lib/services/repeatability-alert-service";
import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";
import { SewaService } from "@/lib/services/sewo-service";

const ALERT_TYPES: CommunicationType[] = [
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
  CommunicationType.ACCIDENT,
];

const REPORTER_REVIEW_REQUIRED_MESSAGE = "Open the communication and select a valid reporter before validating.";
const CLASSIFICATION_REQUIRED_MESSAGE = "Complete the required classification fields before validating.";
const OPEN_LINKED_ACTIONS_MESSAGE = "Cannot close this communication because linked actions are still open.";

function runCommunicationSideEffect(
  task: () => Promise<unknown>,
  context: Record<string, unknown>,
) {
  void task().catch((error) => {
    logger.error(
      {
        ...context,
        error,
      },
      "communication_side_effect_failed",
    );
  });
}

export class CommunicationValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "CommunicationValidationError";
  }
}

function resolveReporterName(input: {
  submittedName: string;
  employeeName?: string | null;
  fallback: string;
}) {
  return input.employeeName?.trim() || input.submittedName.trim() || input.fallback;
}

async function resolveReporterForApproval(input: {
  plantId: string;
  reporterEmployeeNo: string | null;
}) {
  const reporterEmployeeNo = input.reporterEmployeeNo?.trim();

  if (!reporterEmployeeNo) {
    throw new CommunicationValidationError("REPORTER_REVIEW_REQUIRED", REPORTER_REVIEW_REQUIRED_MESSAGE);
  }

  const reporterEmployee = await prisma.employeeDirectory.findFirst({
    where: {
      plantId: input.plantId,
      employeeNo: reporterEmployeeNo,
      isActive: true,
    },
    select: { employeeNo: true, name: true },
  });

  if (!reporterEmployee) {
    throw new CommunicationValidationError("REPORTER_REVIEW_REQUIRED", REPORTER_REVIEW_REQUIRED_MESSAGE);
  }

  return reporterEmployee;
}

async function resolveRiskThemeId(input: {
  plantId: string;
  riskThemeId?: string | null;
}) {
  if (!input.riskThemeId) {
    throw new CommunicationValidationError("PROFESSIONAL_RISK_REQUIRED", "Select a valid professional risk", 400);
  }

  const riskTheme = await prisma.riskTheme.findFirst({
    where: {
      id: input.riskThemeId,
      plantId: input.plantId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!riskTheme) {
    throw new CommunicationValidationError("INVALID_PROFESSIONAL_RISK", "Select a valid professional risk for this plant", 400);
  }

  return riskTheme.id;
}

async function resolveUnsafeActTypeId(input: {
  plantId: string;
  unsafeActTypeId?: string | null;
}) {
  if (!input.unsafeActTypeId) {
    throw new CommunicationValidationError("UNSAFE_ACT_TYPE_REQUIRED", "Select a valid unsafe act type", 400);
  }

  const unsafeActType = await prisma.unsafeActType.findFirst({
    where: {
      id: input.unsafeActTypeId,
      plantId: input.plantId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!unsafeActType) {
    throw new CommunicationValidationError("INVALID_UNSAFE_ACT_TYPE", "Select a valid unsafe act type for this plant", 400);
  }

  return unsafeActType.id;
}

async function resolveUnsafeConditionTypeId(input: {
  plantId: string;
  unsafeConditionTypeId?: string | null;
}) {
  if (!input.unsafeConditionTypeId) {
    throw new CommunicationValidationError("UNSAFE_CONDITION_TYPE_REQUIRED", "Select a valid unsafe condition type", 400);
  }

  const unsafeConditionType = await prisma.unsafeConditionType.findFirst({
    where: {
      id: input.unsafeConditionTypeId,
      plantId: input.plantId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!unsafeConditionType) {
    throw new CommunicationValidationError("INVALID_UNSAFE_CONDITION_TYPE", "Select a valid unsafe condition type for this plant", 400);
  }

  return unsafeConditionType.id;
}

async function resolveNearMissTypeId(input: {
  plantId: string;
  nearMissTypeId?: string | null;
}) {
  if (!input.nearMissTypeId) {
    throw new CommunicationValidationError("NEAR_MISS_TYPE_REQUIRED", "Select a valid near miss type", 400);
  }

  const nearMissType = await prisma.nearMissType.findFirst({
    where: {
      id: input.nearMissTypeId,
      plantId: input.plantId,
      isActive: true,
      code: {
        in: DEFAULT_NEAR_MISS_TYPE_CODES,
      },
    },
    select: {
      id: true,
    },
  });

  if (!nearMissType) {
    throw new CommunicationValidationError("INVALID_NEAR_MISS_TYPE", "Select a valid near miss type for this plant", 400);
  }

  return nearMissType.id;
}

function canResolveDeferredClassification(input: {
  actorRole?: RoleCode | null;
  source?: CommunicationSource;
}) {
  return input.source !== CommunicationSource.TOKEN_REPORT && canManageCommunicationClassification(input.actorRole);
}

async function resolveCommunicationClassification(input: {
  plantId: string;
  type: CommunicationType;
  riskThemeId?: string | null;
  unsafeActTypeId?: string | null;
  unsafeConditionTypeId?: string | null;
  nearMissTypeId?: string | null;
  actorRole?: RoleCode | null;
  source?: CommunicationSource;
}) {
  const canClassifyDeferredFields = canResolveDeferredClassification({
    actorRole: input.actorRole,
    source: input.source,
  });

  const riskThemeId =
    requiresProfessionalRisk(input.type) &&
    (!shouldDeferPublicReportProfessionalRisk(input.type) || canClassifyDeferredFields)
      ? await resolveRiskThemeId({
          plantId: input.plantId,
          riskThemeId: input.riskThemeId,
        })
      : null;

  const unsafeActTypeId =
    supportsUnsafeActType(input.type) &&
    (!shouldDeferPublicReportUnsafeActType(input.type) || canClassifyDeferredFields)
      ? await resolveUnsafeActTypeId({
          plantId: input.plantId,
          unsafeActTypeId: input.unsafeActTypeId,
        })
      : null;

  const nearMissTypeId =
    requiresNearMissType(input.type) &&
    (!shouldDeferPublicReportNearMissType(input.type) || canClassifyDeferredFields)
      ? await resolveNearMissTypeId({
          plantId: input.plantId,
          nearMissTypeId: input.nearMissTypeId,
        })
      : null;

  const unsafeConditionTypeId =
    requiresUnsafeConditionType(input.type) &&
    (!shouldDeferPublicReportUnsafeConditionType(input.type) || canClassifyDeferredFields)
      ? await resolveUnsafeConditionTypeId({
          plantId: input.plantId,
          unsafeConditionTypeId: input.unsafeConditionTypeId,
        })
      : null;

  return {
    riskThemeId,
    unsafeActTypeId,
    unsafeConditionTypeId,
    nearMissTypeId,
  };
}

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

    const reporterName = resolveReporterName({
      submittedName: input.payload.reporterName,
      employeeName: reporterEmployee?.name,
      fallback: "Unknown reporter",
    });
    const resolvedTargetEmployeeId = input.payload.targetEmployeeId ?? targetEmployee?.id ?? null;
    const resolvedTargetEmployeeNo = targetEmployee?.employeeNo ?? targetEmployeeNo ?? null;
    const resolvedTargetText = input.payload.targetText?.trim() || targetEmployee?.name || undefined;

    const { riskThemeId, unsafeActTypeId, unsafeConditionTypeId, nearMissTypeId } = await resolveCommunicationClassification({
      plantId: input.plantId,
      type: input.payload.type,
      riskThemeId: input.payload.riskThemeId,
      unsafeActTypeId: input.payload.unsafeActTypeId,
      unsafeConditionTypeId: input.payload.unsafeConditionTypeId,
      nearMissTypeId: input.payload.nearMissTypeId,
      actorRole: input.actorRole,
      source: input.source,
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
        level: input.payload.level ?? null,
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
        riskThemeId,
        unsafeActTypeId,
        unsafeConditionTypeId,
        nearMissTypeId,
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

    const isPublicTokenReport = input.source === CommunicationSource.TOKEN_REPORT;
    const notifySafetyCommunicationReported = () => SafetyCommunicationAlertService.safeDispatchN3CommunicationCreatedAlerts({
      communicationId: communication.id,
    });

    if (isPublicTokenReport) {
      runCommunicationSideEffect(notifySafetyCommunicationReported, {
        communicationId: communication.id,
        plantId: input.plantId,
        type: communication.type,
        sideEffect: "safety_communication_reported_email",
      });
    } else {
      await notifySafetyCommunicationReported();
    }

    if (ALERT_TYPES.includes(communication.type)) {
      const notifyAlertRoles = () => NotificationService.notifyPlantRoles({
        plantId: input.plantId,
        roles: [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
        title: `${communication.type} reported`,
        body: `${communication.reporterName} submitted a ${communication.type} communication for plant alert handling.`,
      });

      if (isPublicTokenReport) {
        runCommunicationSideEffect(notifyAlertRoles, {
          communicationId: communication.id,
          plantId: input.plantId,
          type: communication.type,
          sideEffect: "alert_role_notification",
        });
      } else {
        await notifyAlertRoles();
      }
    }

    if (communication.status === CommunicationStatus.VALID_OPEN && ALERT_TYPES.includes(communication.type) && input.reporterUserId) {
      await SewaService.createProvisionalFromCommunication({
        communicationId: communication.id,
        actorUserId: input.reporterUserId,
      });
      await SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts({
        communicationId: communication.id,
        actorRole: input.actorRole,
      });
    }

    const processRepeatabilityAlerts = () => RepeatabilityAlertService.processCommunication({
      communicationId: communication.id,
      plantId: input.plantId,
      eventDatetime: communication.eventDatetime,
      targetEmployeeId: communication.targetEmployeeId,
      targetEmployeeNo: communication.targetEmployeeNo,
      workstationId: communication.workstationId,
      type: communication.type,
    });

    if (isPublicTokenReport) {
      runCommunicationSideEffect(processRepeatabilityAlerts, {
        communicationId: communication.id,
        plantId: input.plantId,
        type: communication.type,
        sideEffect: "repeatability_alert_processing",
      });
    } else {
      await processRepeatabilityAlerts();
    }

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
    actorRole?: RoleCode | null;
    payload: ValidateCommunicationInput;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } });

    const nextStatus = nextStatusAfterValidation({
      isValid: input.payload.isValid,
      preferredStatus: input.payload.status,
    });

    if (!input.payload.isValid) {
      return this.deleteCommunication({
        communicationId: input.communicationId,
        actorUserId: input.actorUserId,
        action: nextStatus === CommunicationStatus.INVALID ? "INVALIDATE_DELETE" : "REJECT_DELETE",
        reason: input.payload.notes,
      });
    }

    const missingClassificationFields = getMissingCommunicationClassificationFields(before);
    if (missingClassificationFields.length > 0) {
      throw new CommunicationValidationError("CLASSIFICATION_REQUIRED", CLASSIFICATION_REQUIRED_MESSAGE, 400);
    }

    const validatedReporter = input.payload.isValid
      ? await resolveReporterForApproval({
          plantId: before.plantId,
          reporterEmployeeNo: before.reporterEmployeeNo,
        })
      : null;
    const openLinkedActions = input.payload.isValid
      ? await prisma.action.count({
          where: {
            communicationId: input.communicationId,
            status: {
              in: [...OPEN_LINKED_ACTION_STATUSES],
            },
          },
        })
      : 0;
    const validatedStatus = openLinkedActions > 0 ? CommunicationStatus.ONGOING : nextStatus;
    const validationData: Prisma.CommunicationUncheckedUpdateInput = {
      status: validatedStatus,
      validatedAt: new Date(),
      validatedBy: input.actorUserId,
      validationNotes: input.payload.notes,
      invalidationReason: input.payload.isValid ? null : input.payload.notes,
    };

    if (validatedReporter) {
      validationData.reporterName = validatedReporter.name;
      validationData.reporterEmployeeNo = validatedReporter.employeeNo;
    }

    const updated = await prisma.communication.update({
      where: { id: input.communicationId },
      data: validationData,
    });

    if (input.payload.isValid && ALERT_TYPES.includes(updated.type)) {
      await NotificationService.notifyPlantRoles({
        plantId: updated.plantId,
        roles: [RoleCode.N1_CORPORATE],
        title: `${updated.type} validated`,
        body: `Communication ${updated.id} was validated and is ready for corporate follow-up.`,
      });

      await SewaService.createProvisionalFromCommunication({
        communicationId: updated.id,
        actorUserId: input.actorUserId,
      });
      await SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts({
        communicationId: updated.id,
        actorRole: input.actorRole,
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

  async deleteCommunication(input: {
    communicationId: string;
    actorUserId: string;
    action?: "DELETE" | "REJECT_DELETE" | "INVALIDATE_DELETE";
    reason?: string | null;
  }) {
    const before = await prisma.communication.findUniqueOrThrow({
      where: { id: input.communicationId },
      include: {
        actions: {
          select: {
            id: true,
          },
        },
        alertEvents: {
          select: {
            id: true,
          },
        },
        mapFeatures: {
          select: {
            id: true,
          },
        },
        sewoRecords: {
          select: {
            id: true,
          },
        },
        smatAudits: {
          select: {
            id: true,
          },
        },
      },
    });
    const actionIds = before.actions.map((action) => action.id);

    return prisma.$transaction(async (tx) => {
      if (actionIds.length > 0) {
        await tx.actionEvidenceAttachment.deleteMany({
          where: {
            actionId: {
              in: actionIds,
            },
          },
        });
        await tx.actionCoOwner.deleteMany({
          where: {
            actionId: {
              in: actionIds,
            },
          },
        });
        await tx.sEWOActionLink.deleteMany({
          where: {
            actionId: {
              in: actionIds,
            },
          },
        });
        await tx.smatAuditActionLink.deleteMany({
          where: {
            actionId: {
              in: actionIds,
            },
          },
        });
        await tx.action.deleteMany({
          where: {
            id: {
              in: actionIds,
            },
          },
        });
      }

      await tx.alertEvent.deleteMany({ where: { communicationId: input.communicationId } });
      await tx.mapFeature.updateMany({
        where: { communicationId: input.communicationId },
        data: { communicationId: null },
      });
      await tx.sEWO.updateMany({
        where: { communicationId: input.communicationId },
        data: { communicationId: null },
      });
      await tx.smatAudit.updateMany({
        where: { communicationId: input.communicationId },
        data: { communicationId: null },
      });
      await tx.communicationAttachment.deleteMany({ where: { communicationId: input.communicationId } });
      await tx.communication.delete({ where: { id: input.communicationId } });

      await tx.auditLog.create({
        data: {
          entityType: "Communication",
          entityId: input.communicationId,
          action: input.action ?? "DELETE",
          actorUserId: input.actorUserId,
          plantId: before.plantId,
          diffJson: {
            before,
            after: null,
            reason: input.reason ?? null,
            fieldsChanged: Object.keys(before),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        id: input.communicationId,
        plantId: before.plantId,
        deletedLinkedActions: actionIds.length,
        deletedAlertEvents: before.alertEvents.length,
        unlinkedMapFeatures: before.mapFeatures.length,
        unlinkedSewoRecords: before.sewoRecords.length,
        unlinkedSmatAudits: before.smatAudits.length,
      };
    });
  },

  async manualClose(input: {
    communicationId: string;
    actorUserId: string;
    payload: ManualCloseCommunicationInput;
  }) {
    const [before, openLinkedActions] = await Promise.all([
      prisma.communication.findUniqueOrThrow({ where: { id: input.communicationId } }),
      prisma.action.count({
        where: {
          communicationId: input.communicationId,
          status: {
            in: [...OPEN_LINKED_ACTION_STATUSES],
          },
        },
      }),
    ]);

    if (openLinkedActions > 0) {
      throw new CommunicationValidationError("COMMUNICATION_HAS_OPEN_ACTIONS", OPEN_LINKED_ACTIONS_MESSAGE);
    }

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
          in: [...OPEN_LINKED_ACTION_STATUSES],
        },
      },
    });

    const nextStatus = openActions > 0 ? CommunicationStatus.ONGOING : CommunicationStatus.CLOSED;

    if (communication.status !== nextStatus) {
      return prisma.communication.update({
        where: { id: communicationId },
        data: {
          status: nextStatus,
          manuallyClosedBy: null,
          manuallyClosedAt: null,
          manualCloseReason: null,
        },
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
    actorRole?: RoleCode | null;
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

    const reporterName = resolveReporterName({
      submittedName: input.payload.reporterName,
      employeeName: reporterEmployee?.name,
      fallback: before.reporterName,
    });
    const resolvedTargetEmployeeId = requiresTarget ? input.payload.targetEmployeeId ?? targetEmployee?.id ?? null : null;
    const resolvedTargetEmployeeNo = requiresTarget ? targetEmployee?.employeeNo ?? targetEmployeeNo ?? null : null;
    const resolvedTargetText = requiresTarget
      ? input.payload.targetText?.trim() || targetEmployee?.name || null
      : null;

    const { riskThemeId, unsafeActTypeId, unsafeConditionTypeId, nearMissTypeId } = await resolveCommunicationClassification({
      plantId: before.plantId,
      type: input.payload.type,
      riskThemeId: input.payload.riskThemeId,
      unsafeActTypeId: input.payload.unsafeActTypeId,
      unsafeConditionTypeId: input.payload.unsafeConditionTypeId,
      nearMissTypeId: input.payload.nearMissTypeId,
      actorRole: input.actorRole,
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
        level: input.payload.level ?? null,
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
        riskThemeId,
        unsafeActTypeId,
        unsafeConditionTypeId,
        nearMissTypeId,
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
