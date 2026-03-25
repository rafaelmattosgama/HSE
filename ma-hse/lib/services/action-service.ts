import { ActionPriority, ActionSourceType, ActionStatus, CommunicationStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { getSlaConfig } from "@/lib/services/parameter-service";
import type { CloseActionInput, CreateActionInput, ReopenActionInput } from "@/lib/validation/dtos";

function calculateDueDate(priority: ActionPriority, slaDays: Record<ActionPriority, number>, inputDueDate?: Date) {
  if (inputDueDate) {
    return inputDueDate;
  }

  return addDays(new Date(), slaDays[priority]);
}

export const ActionService = {
  async create(input: {
    plantId: string;
    actorUserId: string;
    payload: CreateActionInput;
  }) {
    const sla = await getSlaConfig(input.plantId);

    const action = await prisma.action.create({
      data: {
        plantId: input.plantId,
        sourceType: input.payload.sourceType as ActionSourceType,
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
        data: { status: CommunicationStatus.ONGOING },
      });
    }

    return action;
  },

  async close(input: {
    actionId: string;
    actorUserId: string;
    payload: CloseActionInput;
  }) {
    const before = await prisma.action.findUniqueOrThrow({ where: { id: input.actionId } });

    if (!input.payload.evidence.length) {
      throw new Error("Evidence is required to close action");
    }

    const action = await prisma.action.update({
      where: { id: input.actionId },
      data: {
        status: ActionStatus.CLOSED,
        closedAt: new Date(),
        closedBy: input.actorUserId,
        closureComment: input.payload.closureComment,
        evidenceAttachments: {
          createMany: {
            data: input.payload.evidence,
          },
        },
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

    if (action.communicationId) {
      const openActions = await prisma.action.count({
        where: {
          communicationId: action.communicationId,
          status: {
            in: [ActionStatus.OPEN, ActionStatus.ONGOING],
          },
        },
      });

      if (openActions === 0) {
        await prisma.communication.update({
          where: { id: action.communicationId },
          data: { status: CommunicationStatus.CLOSED },
        });
      }
    }

    return action;
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

    if (action.communicationId) {
      await prisma.communication.update({
        where: { id: action.communicationId },
        data: { status: CommunicationStatus.ONGOING },
      });
    }

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
};