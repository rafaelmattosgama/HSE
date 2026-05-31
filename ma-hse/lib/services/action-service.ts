import { ActionPriority, ActionSourceType, ActionStatus, CommunicationStatus, Prisma, SEWOStatus } from "@prisma/client";
import { addDays, differenceInCalendarDays } from "date-fns";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { CommunicationService } from "@/lib/services/communication-service";
import { NotificationService } from "@/lib/services/notification-service";
import { getSlaConfig } from "@/lib/services/parameter-service";
import { SewaService } from "@/lib/services/sewo-service";
import type { BulkCloseActionInput, CloseActionInput, CreateActionInput, ReopenActionInput, UpdateActionInput } from "@/lib/validation/dtos";

function calculateDueDate(priority: ActionPriority, slaDays: Record<ActionPriority, number>, inputDueDate?: Date) {
  if (inputDueDate) {
    return inputDueDate;
  }

  return addDays(new Date(), slaDays[priority]);
}

export const ActionService = {
  async syncParentStatuses(input: {
    actionId?: string | null;
    communicationId?: string | null;
    sewoId?: string | null;
  }) {
    if (input.communicationId) {
      await CommunicationService.syncStatusWithActions(input.communicationId);
    }

    const sewoIds = new Set<string>();
    if (input.sewoId) {
      sewoIds.add(input.sewoId);
    }

    if (input.actionId) {
      const links = await prisma.sEWOActionLink.findMany({
        where: { actionId: input.actionId },
        select: { sewoId: true },
      });

      links.forEach((entry) => sewoIds.add(entry.sewoId));
    }

    for (const sewoId of sewoIds) {
      await SewaService.syncStatusWithActions(sewoId);
    }
  },

  async notifyAssignees(actionId: string) {
    const recipients = await prisma.action.findUniqueOrThrow({
      where: { id: actionId },
      include: {
        ownerUser: true,
        coOwners: {
          include: {
            user: true,
          },
        },
      },
    });

    try {
      await NotificationService.notify({
        plantId: recipients.plantId,
        userIds: [recipients.ownerUserId, ...recipients.coOwners.map((entry) => entry.userId)],
        emailTo: [
          ...(recipients.ownerUser.email ? [recipients.ownerUser.email] : []),
          ...recipients.coOwners.flatMap((entry) => (entry.user.email ? [entry.user.email] : [])),
        ],
        title: `New action assigned: ${recipients.title}`,
        body: `A new action was assigned to you with due date ${recipients.dueDate.toISOString().slice(0, 10)}.`,
      });
    } catch (error) {
      logger.error(
        {
          error,
          actionId,
          plantId: recipients.plantId,
        },
        "failed_to_notify_action_assignees",
      );
    }
  },

  async reopenSewoStatusForNewAction(sewoId: string) {
    const sewo = await prisma.sEWO.findUniqueOrThrow({ where: { id: sewoId } });
    if (sewo.status === SEWOStatus.IN_APPROVAL || sewo.status === SEWOStatus.REJECTED) {
      return;
    }

    const reopenedStatus =
      sewo.approvedAt || sewo.approvedByUserId || sewo.status === SEWOStatus.APPROVED
        ? SEWOStatus.APPROVED
        : SEWOStatus.DRAFT;

    if (sewo.status !== reopenedStatus) {
      await prisma.sEWO.update({
        where: { id: sewoId },
        data: { status: reopenedStatus },
      });
    }
  },

  async create(input: {
    plantId: string;
    actorUserId: string;
    payload: CreateActionInput;
  }) {
    const sla = await getSlaConfig(input.plantId);
    const action = await prisma.$transaction(async (tx) => {
      const latest = await tx.action.findFirst({
        where: {
          plantId: input.plantId,
          sequenceNumber: {
            not: null,
          },
        },
        orderBy: {
          sequenceNumber: "desc",
        },
        select: {
          sequenceNumber: true,
        },
      });

      return tx.action.create({
        data: {
          plantId: input.plantId,
          sequenceNumber: (latest?.sequenceNumber ?? 0) + 1,
          sourceType: input.payload.sourceType as ActionSourceType,
          level: input.payload.level ?? null,
          communicationId: input.payload.communicationId,
          sewoId: input.payload.sewoId,
          category: input.payload.category,
          priority: input.payload.priority,
          title: input.payload.title,
          description: input.payload.description,
          ownerUserId: input.payload.ownerUserId,
          dueDate: calculateDueDate(input.payload.priority, sla, input.payload.dueDate),
          coOwners: input.payload.coOwnerIds?.length
            ? {
                createMany: {
                  data: input.payload.coOwnerIds.map((userId) => ({ userId })),
                },
              }
            : undefined,
        },
        include: {
          coOwners: true,
        },
      });
    });

    await writeAuditLog({
      entityType: "Action",
      entityId: action.id,
      action: "CREATE",
      actorUserId: input.actorUserId,
      plantId: input.plantId,
      diff: {
        before: null,
        after: action as unknown as Record<string, unknown>,
        fieldsChanged: Object.keys(action),
      },
    });

    if (action.communicationId) {
      await prisma.communication.update({
        where: { id: action.communicationId },
        data: {
          status: CommunicationStatus.ONGOING,
          manuallyClosedBy: null,
          manuallyClosedAt: null,
          manualCloseReason: null,
        },
      });
    }

    if (action.sewoId) {
      await this.reopenSewoStatusForNewAction(action.sewoId);
    }

    await this.syncParentStatuses({
      actionId: action.id,
      communicationId: action.communicationId,
      sewoId: action.sewoId,
    });

    await this.notifyAssignees(action.id);

    return action;
  },

  async deleteAction(input: {
    actionId: string;
    actorUserId: string;
  }) {
    const before = await prisma.action.findUniqueOrThrow({
      where: { id: input.actionId },
    });

    await prisma.$transaction(async (tx) => {
      await tx.actionEvidenceAttachment.deleteMany({ where: { actionId: input.actionId } });
      await tx.actionCoOwner.deleteMany({ where: { actionId: input.actionId } });
      await tx.sEWOActionLink.deleteMany({ where: { actionId: input.actionId } });
      await tx.smatAuditActionLink.deleteMany({ where: { actionId: input.actionId } });
      await tx.action.delete({ where: { id: input.actionId } });

      await tx.auditLog.create({
        data: {
          entityType: "Action",
          entityId: input.actionId,
          action: "DELETE",
          actorUserId: input.actorUserId,
          plantId: before.plantId,
          diffJson: {
            before,
            after: null,
            fieldsChanged: Object.keys(before),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await this.syncParentStatuses({
      actionId: input.actionId,
      communicationId: before.communicationId,
      sewoId: before.sewoId,
    });

    return { id: input.actionId };
  },

  async close(input: {
    actionId: string;
    actorUserId: string;
    payload: CloseActionInput;
  }) {
    const before = await prisma.action.findUniqueOrThrow({ where: { id: input.actionId } });

    const action = await prisma.action.update({
      where: { id: input.actionId },
      data: {
        status: ActionStatus.CLOSED,
        closedAt: input.payload.closedAt,
        closedBy: input.actorUserId,
        closureComment: input.payload.closureComment,
        evidenceAttachments: input.payload.evidence.length
          ? {
              createMany: {
                data: input.payload.evidence.map((entry) => ({
                  ...entry,
                  uploadedById: input.actorUserId,
                })),
              },
            }
          : undefined,
      },
      include: {
        evidenceAttachments: true,
      },
    });

    await writeAuditLog({
      entityType: "Action",
      entityId: input.actionId,
      action: "CLOSE",
      actorUserId: input.actorUserId,
      plantId: action.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, action as unknown as Record<string, unknown>),
    });

    await this.syncParentStatuses({
      actionId: action.id,
      communicationId: action.communicationId,
      sewoId: action.sewoId,
    });

    return action;
  },

  async update(input: {
    actionId: string;
    actorUserId: string;
    payload: UpdateActionInput;
  }) {
    const before = await prisma.action.findUniqueOrThrow({ where: { id: input.actionId } });

    const action = await prisma.action.update({
      where: { id: input.actionId },
      data: {
        title: input.payload.title,
        description: input.payload.description,
        ownerUserId: input.payload.ownerUserId,
        priority: input.payload.priority,
        category: input.payload.category,
        level: input.payload.level ?? null,
        dueDate: input.payload.dueDate ?? before.dueDate,
      },
    });

    await writeAuditLog({
      entityType: "Action",
      entityId: input.actionId,
      action: "UPDATE",
      actorUserId: input.actorUserId,
      plantId: action.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, action as unknown as Record<string, unknown>),
    });

    return action;
  },

  async closeMany(input: {
    actorUserId: string;
    payload: BulkCloseActionInput;
  }) {
    const results = [];
    for (const actionId of input.payload.actionIds) {
      results.push(
        await this.close({
          actionId,
          actorUserId: input.actorUserId,
          payload: {
            closureComment: input.payload.closureComment,
            closedAt: input.payload.closedAt,
            evidence: input.payload.evidence,
          },
        }),
      );
    }
    return results;
  },

  async reopen(input: {
    actionId: string;
    actorUserId: string;
    payload: ReopenActionInput;
  }) {
    const before = await prisma.action.findUniqueOrThrow({ where: { id: input.actionId } });

    const action = await prisma.action.update({
      where: { id: input.actionId },
      data: {
        status: ActionStatus.OPEN,
        reopenedAt: new Date(),
        reopenedBy: input.actorUserId,
        reopenReason: input.payload.reason,
      },
    });

    await writeAuditLog({
      entityType: "Action",
      entityId: input.actionId,
      action: "REOPEN",
      actorUserId: input.actorUserId,
      plantId: action.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, action as unknown as Record<string, unknown>),
    });

    await this.syncParentStatuses({
      actionId: action.id,
      communicationId: action.communicationId,
      sewoId: action.sewoId,
    });

    return action;
  },

  async findOverdueActions() {
    const now = new Date();
    return prisma.action.findMany({
      where: {
        status: {
          in: [ActionStatus.OPEN, ActionStatus.ONGOING],
        },
        dueDate: {
          lt: now,
        },
      },
      include: {
        ownerUser: true,
        coOwners: {
          include: {
            user: true,
          },
        },
        plant: true,
      },
    });
  },

  async sendOverdueNotifications() {
    const overdue = await this.findOverdueActions();

    for (const action of overdue) {
      const recipients = new Set<string>();
      if (action.ownerUser.email) recipients.add(action.ownerUser.email);
      action.coOwners.forEach((coOwner) => {
        if (coOwner.user.email) recipients.add(coOwner.user.email);
      });

      await NotificationService.notify({
        plantId: action.plantId,
        userIds: [action.ownerUserId, ...action.coOwners.map((co) => co.userId)],
        title: `Action overdue: ${action.title}`,
        body: `Action ${action.title} is overdue since ${action.dueDate.toISOString().slice(0, 10)}.`,
        emailTo: [...recipients],
      });
    }

    return overdue.length;
  },

  async sendDueDateNotifications(referenceDate = new Date()) {
    const actions = await prisma.action.findMany({
      where: {
        status: {
          in: [ActionStatus.OPEN, ActionStatus.ONGOING],
        },
      },
      include: {
        ownerUser: true,
        coOwners: {
          include: {
            user: true,
          },
        },
      },
    });

    let notified = 0;

    for (const action of actions) {
      const daysUntilDue = differenceInCalendarDays(action.dueDate, referenceDate);
      if (daysUntilDue !== 5 && daysUntilDue !== 0) {
        continue;
      }

      const recipients = new Set<string>();
      if (action.ownerUser.email) recipients.add(action.ownerUser.email);
      action.coOwners.forEach((coOwner) => {
        if (coOwner.user.email) recipients.add(coOwner.user.email);
      });

      const whenText = daysUntilDue === 5 ? "in 5 days" : "today";
      await NotificationService.notify({
        plantId: action.plantId,
        userIds: [action.ownerUserId, ...action.coOwners.map((co) => co.userId)],
        emailTo: [...recipients],
        title: `Action deadline reminder: ${action.title}`,
        body: `Action ${action.title} is due ${whenText} (${action.dueDate.toISOString().slice(0, 10)}).`,
      });
      notified += 1;
    }

    return notified;
  },
};
