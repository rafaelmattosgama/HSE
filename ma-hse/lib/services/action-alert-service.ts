import {
  ActionAlertChannel,
  ActionAlertType,
  ActionStatus,
  MasterDataEntityType,
  type Prisma,
  type User,
} from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type AppLocale } from "@/lib/i18n/routing";
import {
  localizeMasterDataRows,
  normalizeMasterDataLocale,
} from "@/lib/services/master-data-translation-service";
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

async function getActionLocation(action: ActionAlertRecord, locale: AppLocale) {
  const areas = Array.from(
    new Map(
      [action.communication?.area, action.sewo?.area]
        .filter((area): area is NonNullable<typeof area> => Boolean(area))
        .map((area) => [area.id, area] as const),
    ).values(),
  );
  const [localizedAreas, localizedWorkstations] = await Promise.all([
    localizeMasterDataRows(MasterDataEntityType.AREA, areas, locale),
    localizeMasterDataRows(
      MasterDataEntityType.WORKSTATION,
      action.communication?.workstation ? [action.communication.workstation] : [],
      locale,
    ),
  ]);
  const localizedAreaById = new Map(localizedAreas.map((area) => [area.id, area.name]));

  return localizedWorkstations[0]?.name
    ?? (action.communication?.area
      ? localizedAreaById.get(action.communication.area.id) ?? action.communication.area.name
      : null)
    ?? action.sewo?.whereText
    ?? (action.sewo?.area ? localizedAreaById.get(action.sewo.area.id) ?? action.sewo.area.name : null)
    ?? action.sewo?.line?.name
    ?? action.plant.name;
}

function formatLisbonDateTime(value: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ACTION_ALERT_TIMEZONE,
  }).format(value);
}

const actionAlertCopy: Record<AppLocale, {
  newAction: string;
  threeDays: string;
  overdue: string;
  alertType: string;
  location: string;
  description: string;
  dueDate: string;
  action: string;
  communication: string;
}> = {
  en: { newAction: "New action opened", threeDays: "Action due in 3 days", overdue: "Overdue action", alertType: "Alert type", location: "Location", description: "Action description", dueDate: "Due date", action: "Action", communication: "Related communication" },
  pt: { newAction: "Nova ação aberta", threeDays: "Ação a 3 dias da data limite", overdue: "Ação fora de prazo", alertType: "Tipo de alerta", location: "Local", description: "Descrição da ação", dueDate: "Data limite", action: "Ação", communication: "Comunicação associada" },
  it: { newAction: "Nuova azione aperta", threeDays: "Azione in scadenza tra 3 giorni", overdue: "Azione scaduta", alertType: "Tipo di avviso", location: "Luogo", description: "Descrizione dell'azione", dueDate: "Scadenza", action: "Azione", communication: "Comunicazione associata" },
  pl: { newAction: "Otwarto nowe działanie", threeDays: "Działanie z terminem za 3 dni", overdue: "Działanie po terminie", alertType: "Typ alertu", location: "Lokalizacja", description: "Opis działania", dueDate: "Termin", action: "Działanie", communication: "Powiązane zgłoszenie" },
  de: { newAction: "Neue Maßnahme eröffnet", threeDays: "Maßnahme in 3 Tagen fällig", overdue: "Überfällige Maßnahme", alertType: "Warnungstyp", location: "Ort", description: "Maßnahmenbeschreibung", dueDate: "Fälligkeitsdatum", action: "Maßnahme", communication: "Zugehörige Meldung" },
  ro: { newAction: "Acțiune nouă deschisă", threeDays: "Acțiune scadentă în 3 zile", overdue: "Acțiune restantă", alertType: "Tip alertă", location: "Locație", description: "Descrierea acțiunii", dueDate: "Termen limită", action: "Acțiune", communication: "Comunicare asociată" },
  fr: { newAction: "Nouvelle action ouverte", threeDays: "Action à échéance dans 3 jours", overdue: "Action en retard", alertType: "Type d'alerte", location: "Lieu", description: "Description de l'action", dueDate: "Échéance", action: "Action", communication: "Communication associée" },
};

function getAlertLabel(alertType: ActionAlertType, locale: AppLocale) {
  const copy = actionAlertCopy[locale];
  if (alertType === ActionAlertType.NEW_ACTION) return copy.newAction;
  if (alertType === ActionAlertType.THREE_DAYS_BEFORE_DUE_DATE) return copy.threeDays;
  return copy.overdue;
}

function getActionUrl(action: ActionAlertRecord) {
  return `/app/${action.plant.code}/actions/${action.id}`;
}

async function buildAlertContent(action: ActionAlertRecord, alertType: ActionAlertType, userLanguage?: string | null) {
  const locale = normalizeMasterDataLocale(userLanguage);
  const copy = actionAlertCopy[locale];
  const alertLabel = getAlertLabel(alertType, locale);
  const location = await getActionLocation(action, locale);
  const dueDate = formatLisbonDateTime(action.dueDate, locale);
  const actionUrl = getActionUrl(action);
  const communicationLine = action.communicationId
    ? [`${copy.communication}: ${action.communicationId}`]
    : [];

  const body = [
    `${copy.alertType}: ${alertLabel}`,
    `${copy.location}: ${location}`,
    `${copy.description}: ${action.description}`,
    `${copy.dueDate}: ${dueDate}`,
    `${copy.action}: ${action.title}`,
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
  content: Awaited<ReturnType<typeof buildAlertContent>>;
}) {
  const { content } = input;

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
  content: Awaited<ReturnType<typeof buildAlertContent>>;
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

  const { content } = input;
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
      const content = await buildAlertContent(input.action, input.alertType, user.language);
      if (await createSoftwareAlert({ action: input.action, user, alertType: input.alertType, content })) {
        created += 1;
      }
      if (await sendEmailAlert({ action: input.action, user, alertType: input.alertType, content })) {
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
