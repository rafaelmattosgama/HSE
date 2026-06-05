import {
  ActionAlertChannel,
  ActionAlertType,
  ActionStatus,
  type Prisma,
  type User,
} from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

export const ACTION_ALERT_NOTIFICATION_CHANNEL = "ACTION_ALERT";
export const ACTION_ALERT_TIMEZONE = "Europe/Lisbon";

const OPEN_ACTION_STATUSES: ActionStatus[] = [ActionStatus.OPEN, ActionStatus.ONGOING];

type ActionAlertRecord = Prisma.ActionGetPayload<{
  include: {
    plant: true;
    ownerUser: true;
    coOwners: {
      include: {
        user: true;
      };
    };
    communication: {
      include: {
        area: true;
        workstation: true;
      };
    };
    sewo: {
      include: {
        area: true;
        line: true;
      };
    };
  };
}>;

type ActionAlertRecipient = Pick<User, "id" | "email" | "name" | "language">;

export type ActionFloatingAlert = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  actionUrl: string;
};

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

function getActionRecipients(action: ActionAlertRecord): ActionAlertRecipient[] {
  return Array.from(
    new Map(
      [action.ownerUser, ...action.coOwners.map((entry) => entry.user)]
        .filter((user) => user.isActive)
        .map((user) => [user.id, user]),
    ).values(),
  );
}

function getActionLocation(action: ActionAlertRecord) {
  return action.communication?.workstation?.name
    ?? action.communication?.area?.name
    ?? action.sewo?.whereText
    ?? action.sewo?.area?.name
    ?? action.sewo?.line?.name
    ?? action.plant.name;
}

function formatLisbonDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ACTION_ALERT_TIMEZONE,
  }).format(value);
}

function getAlertLabel(alertType: ActionAlertType) {
  if (alertType === ActionAlertType.NEW_ACTION) return "Nova comunicacao aberta";
  if (alertType === ActionAlertType.THREE_DAYS_BEFORE_DUE_DATE) return "Acao a 3 dias da data limite";
  return "Acao fora de prazo";
}

function getActionUrl(action: ActionAlertRecord) {
  return `/app/${action.plant.code}/actions/${action.id}`;
}

function buildAlertContent(action: ActionAlertRecord, alertType: ActionAlertType) {
  const alertLabel = getAlertLabel(alertType);
  const location = getActionLocation(action);
  const dueDate = formatLisbonDateTime(action.dueDate);
  const actionUrl = getActionUrl(action);
  const communicationLine = action.communicationId
    ? [`Comunicacao associada: ${action.communicationId}`]
    : [];

  const body = [
    `Tipo de alerta: ${alertLabel}`,
    `Local: ${location}`,
    `Descricao da acao: ${action.description}`,
    `Data limite: ${dueDate}`,
    `Acao: ${action.title}`,
    ...communicationLine,
  ].join("\n");

  return {
    title: `${alertLabel}: ${action.title}`,
    body,
    actionUrl,
  };
}

async function findActionForAlert(actionId: string) {
  return prisma.action.findUnique({
    where: { id: actionId },
    include: {
      plant: true,
      ownerUser: true,
      coOwners: {
        include: {
          user: true,
        },
      },
      communication: {
        include: {
          area: true,
          workstation: true,
        },
      },
      sewo: {
        include: {
          area: true,
          line: true,
        },
      },
    },
  });
}

async function createSoftwareAlert(input: {
  action: ActionAlertRecord;
  user: ActionAlertRecipient;
  alertType: ActionAlertType;
}) {
  const content = buildAlertContent(input.action, input.alertType);

  try {
    await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          userId: input.user.id,
          plantId: input.action.plantId,
          title: content.title,
          body: content.body,
          channel: ACTION_ALERT_NOTIFICATION_CHANNEL,
          status: "UNREAD",
        },
      });

      await tx.actionAlertDelivery.create({
        data: {
          actionId: input.action.id,
          userId: input.user.id,
          alertType: input.alertType,
          channel: ActionAlertChannel.SOFTWARE,
          notificationId: notification.id,
        },
      });
    });

    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

async function sendEmailAlert(input: {
  action: ActionAlertRecord;
  user: ActionAlertRecipient;
  alertType: ActionAlertType;
}) {
  if (!input.user.email) return false;

  try {
    await prisma.actionAlertDelivery.create({
      data: {
        actionId: input.action.id,
        userId: input.user.id,
        alertType: input.alertType,
        channel: ActionAlertChannel.EMAIL,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }

  const content = buildAlertContent(input.action, input.alertType);
  await sendNotificationEmail({
    user: input.user,
    tituloNotificacao: content.title,
    mensagem: content.body,
    dataHora: new Date(),
    plantName: input.action.plant.name,
    actionUrl: new URL(content.actionUrl, env.APP_URL).toString(),
  });

  return true;
}

async function dispatchActionAlert(input: {
  action: ActionAlertRecord;
  alertType: ActionAlertType;
}) {
  if (!OPEN_ACTION_STATUSES.includes(input.action.status)) {
    return 0;
  }

  let created = 0;
  const recipients = getActionRecipients(input.action);

  for (const user of recipients) {
    try {
      if (await createSoftwareAlert({ action: input.action, user, alertType: input.alertType })) {
        created += 1;
      }
      if (await sendEmailAlert({ action: input.action, user, alertType: input.alertType })) {
        created += 1;
      }
    } catch (error) {
      logger.error(
        {
          error,
          actionId: input.action.id,
          userId: user.id,
          alertType: input.alertType,
        },
        "failed_to_dispatch_action_alert",
      );
    }
  }

  return created;
}

async function listOpenActionsForScheduledAlerts(input: {
  plantId?: string;
}) {
  return prisma.action.findMany({
    where: {
      plantId: input.plantId,
      status: {
        in: OPEN_ACTION_STATUSES,
      },
    },
    include: {
      plant: true,
      ownerUser: true,
      coOwners: {
        include: {
          user: true,
        },
      },
      communication: {
        include: {
          area: true,
          workstation: true,
        },
      },
      sewo: {
        include: {
          area: true,
          line: true,
        },
      },
    },
  });
}

async function sendScheduledAlerts(input: {
  plantId?: string;
  referenceDate?: Date;
  mode: "THREE_DAYS" | "OVERDUE";
}) {
  const reference = toZonedTime(input.referenceDate ?? new Date(), ACTION_ALERT_TIMEZONE);
  const actions = await listOpenActionsForScheduledAlerts({ plantId: input.plantId });
  let notified = 0;

  for (const action of actions) {
    const dueDate = toZonedTime(action.dueDate, ACTION_ALERT_TIMEZONE);
    const daysUntilDue = differenceInCalendarDays(dueDate, reference);

    if (input.mode === "THREE_DAYS" && daysUntilDue !== 3) {
      continue;
    }
    if (input.mode === "OVERDUE" && daysUntilDue >= 0) {
      continue;
    }

    notified += await dispatchActionAlert({
      action,
      alertType: input.mode === "THREE_DAYS"
        ? ActionAlertType.THREE_DAYS_BEFORE_DUE_DATE
        : ActionAlertType.OVERDUE_ACTION,
    });
  }

  return notified;
}

export const ActionAlertService = {
  async sendNewActionAlerts(actionId: string) {
    const action = await findActionForAlert(actionId);
    if (!action) return 0;

    return dispatchActionAlert({
      action,
      alertType: ActionAlertType.NEW_ACTION,
    });
  },

  async sendThreeDaysBeforeDueDateAlerts(input: {
    plantId?: string;
    referenceDate?: Date;
  } = {}) {
    return sendScheduledAlerts({
      ...input,
      mode: "THREE_DAYS",
    });
  },

  async sendOverdueActionAlerts(input: {
    plantId?: string;
    referenceDate?: Date;
  } = {}) {
    return sendScheduledAlerts({
      ...input,
      mode: "OVERDUE",
    });
  },

  async listUnreadSoftwareAlerts(input: {
    userId: string;
    limit?: number;
  }): Promise<ActionFloatingAlert[]> {
    const rows = await prisma.actionAlertDelivery.findMany({
      where: {
        userId: input.userId,
        channel: ActionAlertChannel.SOFTWARE,
        notification: {
          channel: ACTION_ALERT_NOTIFICATION_CHANNEL,
          status: "UNREAD",
        },
      },
      include: {
        notification: true,
        action: {
          include: {
            plant: true,
          },
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: input.limit ?? 10,
    });

    return rows.flatMap((row): ActionFloatingAlert[] => {
      if (!row.notification) return [];
      return [{
        id: row.notification.id,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt.toISOString(),
        actionUrl: `/app/${row.action.plant.code}/actions/${row.action.id}`,
      }];
    });
  },
};
