import {
  ActionAlertChannel,
  FireChecklistFrequency,
  FireChecklistResult,
  FireComplianceCellState,
  FireEquipmentAlertType,
  FireEquipmentStatus,
  RoleCode,
} from "@prisma/client";
import { toZonedTime } from "date-fns-tz";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/routing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { normalizeMasterDataLocale } from "@/lib/services/master-data-translation-service";
import { resolveDepartmentAlertRecipients } from "@/lib/services/safety-communication-alert-service";
import { FIRE_EQUIPMENT_TIMEZONE, type ComputedFireCompliancePeriodicity } from "@/lib/services/fire-equipment-state-service";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

/**
 * §8 of the fire-equipment module spec.
 * FIRE_EQUIPMENT_ALERT: DUE_SOON/OVERDUE (per periodicity) + TAG_MISSING —
 * read by the existing RepeatabilityAlertModal (layout.tsx adds this channel
 * to its filter, mirroring COMPETENCE_ALERT).
 * FIRE_EQUIPMENT_URGENT: NON_CONFORMITY_FOUND — a critical checklist item
 * failing can't wait for the next navigation, so this polls every 30s like
 * CompetenceUrgentAlert / SafetyCommunicationFloatingAlert instead of going
 * through the server-side RepeatabilityAlertModal.
 */
export const FIRE_EQUIPMENT_ALERT_CHANNEL = "FIRE_EQUIPMENT_ALERT";
export const FIRE_EQUIPMENT_URGENT_CHANNEL = "FIRE_EQUIPMENT_URGENT";

export type FireEquipmentUrgentFloatingAlert = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  actionUrl: string;
};

type AlertRecipient = {
  id: string;
  name: string;
  email: string | null;
  language: string;
};

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function mergeRecipients(...groups: AlertRecipient[][]): AlertRecipient[] {
  return dedupeById(groups.flat());
}

/** §8 destinatários: responsible of the Area where the equipment is located. Empty when the equipment has no areaId. */
async function resolveAreaRecipients(plantId: string, areaId: string | null): Promise<AlertRecipient[]> {
  if (!areaId) return [];
  const rows = await resolveDepartmentAlertRecipients({ plantId, departmentId: areaId });
  return dedupeById(rows.map((row) => row.user));
}

/** §8 destinatários: N3_SAFETY, always included alongside the Area responsible. */
async function resolveN3SafetyRecipients(plantId: string): Promise<AlertRecipient[]> {
  const rows = await prisma.userPlantRole.findMany({
    where: { plantId, role: { code: RoleCode.N3_SAFETY }, user: { isActive: true } },
    include: { user: { select: { id: true, name: true, email: true, language: true } } },
  });
  return dedupeById(rows.map((row) => row.user));
}

/** §8: cycleKey for DUE_SOON/OVERDUE — a fresh due date (a new execution) is free to alert again inside the same warning window. */
function dueDateCycleKey(fireEquipmentId: string, frequency: FireChecklistFrequency, dueDate: Date) {
  return `${fireEquipmentId}:${frequency}:${dueDate.toISOString()}`;
}

/** §8: TAG_MISSING's cycleKey is the plain month — fireEquipmentId is already a separate column of the @@unique, so it scopes this per equipment on its own. */
function monthlyCycleKey(referenceDate: Date) {
  const zoned = toZonedTime(referenceDate, FIRE_EQUIPMENT_TIMEZONE);
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}`;
}

/** Composite key matching FireEquipmentAlertDelivery's @@unique, used to skip a combination already delivered instead of relying on a P2002. */
function deliveryKey(input: {
  fireEquipmentId: string;
  userId: string;
  alertType: FireEquipmentAlertType;
  channel: ActionAlertChannel;
  cycleKey: string;
}) {
  return [input.fireEquipmentId, input.userId, input.alertType, input.channel, input.cycleKey].join("|");
}

const fireEquipmentAlertCopy: Record<AppLocale, {
  dueSoon: string;
  overdue: string;
  quarterlyLabel: string;
  annualLabel: string;
  tagMissing: string;
  nonConformityFound: string;
  equipmentLabel: string;
  typeLabel: string;
  areaLabel: string;
  dueDateLabel: string;
}> = {
  en: {
    dueSoon: "{frequency} maintenance approaching its due date", overdue: "{frequency} maintenance overdue",
    quarterlyLabel: "Quarterly", annualLabel: "Annual",
    tagMissing: "Equipment has no NFC/QR tag assigned", nonConformityFound: "Critical non-conformity found",
    equipmentLabel: "Equipment", typeLabel: "Type", areaLabel: "Area", dueDateLabel: "Due date",
  },
  pt: {
    dueSoon: "Manutenção {frequency} a aproximar-se do prazo", overdue: "Manutenção {frequency} em atraso",
    quarterlyLabel: "Trimestral", annualLabel: "Anual",
    tagMissing: "Equipamento sem ficha NFC/QR associada", nonConformityFound: "Não conformidade crítica detetada",
    equipmentLabel: "Equipamento", typeLabel: "Tipo", areaLabel: "Área", dueDateLabel: "Prazo",
  },
  it: {
    dueSoon: "Manutenzione {frequency} in prossimità della scadenza", overdue: "Manutenzione {frequency} scaduta",
    quarterlyLabel: "Trimestrale", annualLabel: "Annuale",
    tagMissing: "Attrezzatura senza etichetta NFC/QR associata", nonConformityFound: "Rilevata non conformità critica",
    equipmentLabel: "Attrezzatura", typeLabel: "Tipo", areaLabel: "Area", dueDateLabel: "Scadenza",
  },
  pl: {
    dueSoon: "Przegląd {frequency} zbliża się do terminu", overdue: "Przegląd {frequency} po terminie",
    quarterlyLabel: "Kwartalny", annualLabel: "Roczny",
    tagMissing: "Sprzęt bez przypisanej etykiety NFC/QR", nonConformityFound: "Wykryto krytyczną niezgodność",
    equipmentLabel: "Sprzęt", typeLabel: "Typ", areaLabel: "Obszar", dueDateLabel: "Termin",
  },
  de: {
    dueSoon: "{frequency} Wartung nähert sich der Frist", overdue: "{frequency} Wartung überfällig",
    quarterlyLabel: "Vierteljährliche", annualLabel: "Jährliche",
    tagMissing: "Gerät hat kein NFC/QR-Etikett zugewiesen", nonConformityFound: "Kritische Abweichung festgestellt",
    equipmentLabel: "Gerät", typeLabel: "Typ", areaLabel: "Bereich", dueDateLabel: "Frist",
  },
  ro: {
    dueSoon: "Întreținerea {frequency} se apropie de termen", overdue: "Întreținerea {frequency} este întârziată",
    quarterlyLabel: "Trimestrială", annualLabel: "Anuală",
    tagMissing: "Echipamentul nu are o etichetă NFC/QR asociată", nonConformityFound: "Neconformitate critică detectată",
    equipmentLabel: "Echipament", typeLabel: "Tip", areaLabel: "Zonă", dueDateLabel: "Termen",
  },
  fr: {
    dueSoon: "Maintenance {frequency} approchant de l'échéance", overdue: "Maintenance {frequency} en retard",
    quarterlyLabel: "Trimestrielle", annualLabel: "Annuelle",
    tagMissing: "Équipement sans étiquette NFC/QR associée", nonConformityFound: "Non-conformité critique détectée",
    equipmentLabel: "Équipement", typeLabel: "Type", areaLabel: "Zone", dueDateLabel: "Échéance",
  },
};

function formatLisbonDate(value: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: FIRE_EQUIPMENT_TIMEZONE }).format(value);
}

function frequencyLabel(copy: (typeof fireEquipmentAlertCopy)[AppLocale], frequency: FireChecklistFrequency) {
  return frequency === FireChecklistFrequency.QUARTERLY ? copy.quarterlyLabel : copy.annualLabel;
}

function buildDueDateAlertContent(input: {
  alertType: FireEquipmentAlertType;
  frequency: FireChecklistFrequency;
  locale: AppLocale;
  equipmentInternalCode: string;
  equipmentTypeName: string;
  areaName: string | null;
  dueDate: Date;
  plantCode: string;
  fireEquipmentId: string;
}) {
  const copy = fireEquipmentAlertCopy[input.locale];
  const template = input.alertType === FireEquipmentAlertType.OVERDUE ? copy.overdue : copy.dueSoon;
  const label = template.replace("{frequency}", frequencyLabel(copy, input.frequency));
  const lines = [
    `${copy.equipmentLabel}: ${input.equipmentInternalCode}`,
    `${copy.typeLabel}: ${input.equipmentTypeName}`,
  ];
  if (input.areaName) lines.push(`${copy.areaLabel}: ${input.areaName}`);
  lines.push(`${copy.dueDateLabel}: ${formatLisbonDate(input.dueDate, input.locale)}`);

  return {
    title: `${label}: ${input.equipmentInternalCode}`,
    body: lines.join("\n"),
    actionUrl: `/app/${input.plantCode}/fire-equipment/${input.fireEquipmentId}`,
  };
}

function buildTagMissingAlertContent(input: {
  locale: AppLocale;
  equipmentInternalCode: string;
  equipmentTypeName: string;
  areaName: string | null;
  plantCode: string;
  fireEquipmentId: string;
}) {
  const copy = fireEquipmentAlertCopy[input.locale];
  const lines = [
    `${copy.equipmentLabel}: ${input.equipmentInternalCode}`,
    `${copy.typeLabel}: ${input.equipmentTypeName}`,
  ];
  if (input.areaName) lines.push(`${copy.areaLabel}: ${input.areaName}`);

  return {
    title: `${copy.tagMissing}: ${input.equipmentInternalCode}`,
    body: lines.join("\n"),
    actionUrl: `/app/${input.plantCode}/fire-equipment/${input.fireEquipmentId}`,
  };
}

function buildNonConformityAlertContent(input: {
  locale: AppLocale;
  equipmentInternalCode: string;
  equipmentTypeName: string;
  areaName: string | null;
  plantCode: string;
  fireEquipmentId: string;
}) {
  const copy = fireEquipmentAlertCopy[input.locale];
  const lines = [
    `${copy.equipmentLabel}: ${input.equipmentInternalCode}`,
    `${copy.typeLabel}: ${input.equipmentTypeName}`,
  ];
  if (input.areaName) lines.push(`${copy.areaLabel}: ${input.areaName}`);

  return {
    title: `${copy.nonConformityFound}: ${input.equipmentInternalCode}`,
    body: lines.join("\n"),
    actionUrl: `/app/${input.plantCode}/fire-equipment/${input.fireEquipmentId}`,
  };
}

type DispatchContext = {
  plantId: string;
  plantName: string;
  fireEquipmentId: string;
  executionId: string | null;
  alertType: FireEquipmentAlertType;
  cycleKey: string;
  title: string;
  body: string;
  actionUrl: string;
};

async function createSoftwareAlert(ctx: DispatchContext, recipient: AlertRecipient, notificationChannel: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          userId: recipient.id,
          plantId: ctx.plantId,
          title: ctx.title,
          body: ctx.body,
          actionUrl: ctx.actionUrl,
          channel: notificationChannel,
          status: "UNREAD",
        },
      });

      await tx.fireEquipmentAlertDelivery.create({
        data: {
          plantId: ctx.plantId,
          fireEquipmentId: ctx.fireEquipmentId,
          executionId: ctx.executionId,
          userId: recipient.id,
          alertType: ctx.alertType,
          channel: ActionAlertChannel.SOFTWARE,
          cycleKey: ctx.cycleKey,
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

async function sendEmailAlert(ctx: DispatchContext, recipient: AlertRecipient) {
  if (!recipient.email) return false;

  try {
    await prisma.fireEquipmentAlertDelivery.create({
      data: {
        plantId: ctx.plantId,
        fireEquipmentId: ctx.fireEquipmentId,
        executionId: ctx.executionId,
        userId: recipient.id,
        alertType: ctx.alertType,
        channel: ActionAlertChannel.EMAIL,
        cycleKey: ctx.cycleKey,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }

  await sendNotificationEmail({
    user: recipient,
    tituloNotificacao: ctx.title,
    mensagem: ctx.body,
    dataHora: new Date(),
    plantName: ctx.plantName,
    actionUrl: new URL(ctx.actionUrl, env.APP_URL).toString(),
  });

  return true;
}

async function dispatchToRecipients(input: {
  recipients: AlertRecipient[];
  notificationChannel: string;
  build: (recipient: AlertRecipient) => DispatchContext;
  /** Pre-loaded already-delivered combinations, to skip a write attempt instead of catching its P2002. */
  deliveredKeys?: Set<string>;
}) {
  let created = 0;

  for (const recipient of input.recipients) {
    try {
      const ctx = input.build(recipient);
      const alreadySoftware = input.deliveredKeys?.has(
        deliveryKey({ fireEquipmentId: ctx.fireEquipmentId, userId: recipient.id, alertType: ctx.alertType, channel: ActionAlertChannel.SOFTWARE, cycleKey: ctx.cycleKey }),
      );
      if (!alreadySoftware && await createSoftwareAlert(ctx, recipient, input.notificationChannel)) created += 1;

      const alreadyEmail = input.deliveredKeys?.has(
        deliveryKey({ fireEquipmentId: ctx.fireEquipmentId, userId: recipient.id, alertType: ctx.alertType, channel: ActionAlertChannel.EMAIL, cycleKey: ctx.cycleKey }),
      );
      if (!alreadyEmail && await sendEmailAlert(ctx, recipient)) created += 1;
    } catch (error) {
      logger.error({ error, userId: recipient.id }, "failed_to_dispatch_fire_equipment_alert");
    }
  }

  return created;
}

type FireEquipmentAlertRow = {
  id: string;
  internalCode: string;
  areaId: string | null;
  areaName: string | null;
  fireEquipmentTypeName: string;
  status: FireEquipmentStatus;
  hasTag: boolean;
};

type DailyFireAlertContext = {
  plant: { id: string; code: string; name: string };
  equipmentById: Map<string, FireEquipmentAlertRow>;
  n3Recipients: AlertRecipient[];
  recipientsByAreaId: Map<string, AlertRecipient[]>;
  deliveredKeys: Set<string>;
};

/** Everything the daily job's per-equipment dispatch needs, loaded once per plant rather than per equipment (mirrors loadDailyAlertContext in competence-alert-service.ts, item 16). */
async function loadDailyFireAlertContext(
  plantId: string,
  computedRows: Array<{ fireEquipmentId: string; quarterly: ComputedFireCompliancePeriodicity; annual: ComputedFireCompliancePeriodicity }>,
  referenceDate: Date,
): Promise<DailyFireAlertContext | null> {
  const [plant, equipmentRows, n3Recipients] = await Promise.all([
    prisma.plant.findUnique({ where: { id: plantId }, select: { id: true, code: true, name: true } }),
    prisma.fireEquipment.findMany({
      where: { plantId, isActive: true },
      select: {
        id: true,
        internalCode: true,
        status: true,
        area: { select: { id: true, name: true } },
        fireEquipmentType: { select: { name: true } },
        tagAssignments: { where: { isActive: true }, select: { id: true } },
      },
    }),
    resolveN3SafetyRecipients(plantId),
  ]);
  if (!plant) return null;

  const equipmentById = new Map<string, FireEquipmentAlertRow>(
    equipmentRows.map((row) => [row.id, {
      id: row.id,
      internalCode: row.internalCode,
      areaId: row.area?.id ?? null,
      areaName: row.area?.name ?? null,
      fireEquipmentTypeName: row.fireEquipmentType.name,
      status: row.status,
      hasTag: row.tagAssignments.length > 0,
    }]),
  );

  const areaIds = Array.from(new Set(equipmentRows.map((row) => row.area?.id).filter((id): id is string => Boolean(id))));
  const recipientsByAreaId = new Map<string, AlertRecipient[]>(
    await Promise.all(areaIds.map(async (areaId) => [areaId, await resolveAreaRecipients(plantId, areaId)] as const)),
  );

  const relevantCycleKeys = new Set<string>([monthlyCycleKey(referenceDate)]);
  for (const row of computedRows) {
    if (row.quarterly.dueDate) relevantCycleKeys.add(dueDateCycleKey(row.fireEquipmentId, FireChecklistFrequency.QUARTERLY, row.quarterly.dueDate));
    if (row.annual.dueDate) relevantCycleKeys.add(dueDateCycleKey(row.fireEquipmentId, FireChecklistFrequency.ANNUAL, row.annual.dueDate));
  }

  const deliveries = relevantCycleKeys.size > 0
    ? await prisma.fireEquipmentAlertDelivery.findMany({
        where: { plantId, cycleKey: { in: Array.from(relevantCycleKeys) } },
        select: { fireEquipmentId: true, userId: true, alertType: true, channel: true, cycleKey: true },
      })
    : [];
  const deliveredKeys = new Set(deliveries.map((delivery) => deliveryKey(delivery)));

  return { plant, equipmentById, n3Recipients, recipientsByAreaId, deliveredKeys };
}

export const FireEquipmentAlertService = {
  /**
   * The daily job (jobs/handlers/fire-equipment-due-dates.ts): DUE_SOON/OVERDUE
   * from the freshly recomputed FireEquipmentComplianceState (both periodicities,
   * independently — §6's own rule that the two axes are never collapsed), plus
   * TAG_MISSING for ACTIVE equipment with no active FireEquipmentTagAssignment.
   * A failure resolving one equipment must not cost every other equipment in
   * the plant its alert for the day (mirrors crit 4 in the Competences module).
   */
  async runDailyAlerts(
    plantId: string,
    computedRows: Array<{ fireEquipmentId: string; quarterly: ComputedFireCompliancePeriodicity; annual: ComputedFireCompliancePeriodicity }>,
    referenceDate = new Date(),
  ) {
    const context = await loadDailyFireAlertContext(plantId, computedRows, referenceDate);
    if (!context) return 0;

    let sent = 0;
    for (const row of computedRows) {
      const equipment = context.equipmentById.get(row.fireEquipmentId);
      if (!equipment) continue;

      try {
        sent += await FireEquipmentAlertService.dispatchDueDateAlert({
          context, equipment, frequency: FireChecklistFrequency.QUARTERLY, computed: row.quarterly,
        });
        sent += await FireEquipmentAlertService.dispatchDueDateAlert({
          context, equipment, frequency: FireChecklistFrequency.ANNUAL, computed: row.annual,
        });
      } catch (error) {
        logger.error({ error, plantId, fireEquipmentId: row.fireEquipmentId }, "failed_to_process_fire_equipment_alert_row");
      }
    }

    try {
      sent += await FireEquipmentAlertService.dispatchTagMissingAlerts(context, referenceDate);
    } catch (error) {
      logger.error({ error, plantId }, "failed_to_dispatch_fire_equipment_tag_missing_alerts");
    }

    return sent;
  },

  /** §8: Area responsible + N3_SAFETY. cycleKey = fireEquipmentId:frequency:dueDate — only fires for DUE_SOON/OVERDUE states. */
  async dispatchDueDateAlert(input: {
    context: DailyFireAlertContext;
    equipment: FireEquipmentAlertRow;
    frequency: FireChecklistFrequency;
    computed: ComputedFireCompliancePeriodicity;
  }) {
    const { context, equipment, frequency, computed } = input;
    if (computed.state !== FireComplianceCellState.DUE_SOON && computed.state !== FireComplianceCellState.OVERDUE) return 0;
    if (!computed.dueDate) return 0;

    const areaRecipients = equipment.areaId ? context.recipientsByAreaId.get(equipment.areaId) ?? [] : [];
    const recipients = mergeRecipients(areaRecipients, context.n3Recipients);
    if (recipients.length === 0) return 0;

    const alertType = computed.state === FireComplianceCellState.OVERDUE
      ? FireEquipmentAlertType.OVERDUE
      : FireEquipmentAlertType.DUE_SOON;
    const cycleKey = dueDateCycleKey(equipment.id, frequency, computed.dueDate);
    const dueDate = computed.dueDate;

    return dispatchToRecipients({
      recipients,
      notificationChannel: FIRE_EQUIPMENT_ALERT_CHANNEL,
      deliveredKeys: context.deliveredKeys,
      build: (recipient) => {
        const content = buildDueDateAlertContent({
          alertType,
          frequency,
          locale: normalizeMasterDataLocale(recipient.language),
          equipmentInternalCode: equipment.internalCode,
          equipmentTypeName: equipment.fireEquipmentTypeName,
          areaName: equipment.areaName,
          dueDate,
          plantCode: context.plant.code,
          fireEquipmentId: equipment.id,
        });
        return {
          plantId: context.plant.id,
          plantName: context.plant.name,
          fireEquipmentId: equipment.id,
          executionId: null,
          alertType,
          cycleKey,
          ...content,
        };
      },
    });
  },

  /** §8: Area responsible + N3_SAFETY. cycleKey = "YYYY-MM" — only ACTIVE equipment with no active tag assignment. */
  async dispatchTagMissingAlerts(context: DailyFireAlertContext, referenceDate: Date) {
    const cycleKey = monthlyCycleKey(referenceDate);
    let sent = 0;

    for (const equipment of context.equipmentById.values()) {
      if (equipment.status !== FireEquipmentStatus.ACTIVE || equipment.hasTag) continue;

      const areaRecipients = equipment.areaId ? context.recipientsByAreaId.get(equipment.areaId) ?? [] : [];
      const recipients = mergeRecipients(areaRecipients, context.n3Recipients);
      if (recipients.length === 0) continue;

      sent += await dispatchToRecipients({
        recipients,
        notificationChannel: FIRE_EQUIPMENT_ALERT_CHANNEL,
        deliveredKeys: context.deliveredKeys,
        build: (recipient) => {
          const content = buildTagMissingAlertContent({
            locale: normalizeMasterDataLocale(recipient.language),
            equipmentInternalCode: equipment.internalCode,
            equipmentTypeName: equipment.fireEquipmentTypeName,
            areaName: equipment.areaName,
            plantCode: context.plant.code,
            fireEquipmentId: equipment.id,
          });
          return {
            plantId: context.plant.id,
            plantName: context.plant.name,
            fireEquipmentId: equipment.id,
            executionId: null,
            alertType: FireEquipmentAlertType.TAG_MISSING,
            cycleKey,
            ...content,
          };
        },
      });
    }

    return sent;
  },

  /**
   * §8, immediate/urgent: Area responsible + N3_SAFETY, same recipient
   * mechanism as the daily alerts. Called from fire-equipment-service.ts's
   * recordExecution AFTER its own transaction has committed — mirrors
   * competence-service.ts calling CompetenceAlertService.dispatchAuthorizationSuspended/
   * Revoked post-commit, in its own try/catch, so a dispatch failure never
   * rolls back or masks the checklist execution itself. cycleKey is the
   * execution's own id — one non-conformity alert per execution.
   */
  async dispatchNonConformityFound(executionId: string) {
    const execution = await prisma.fireChecklistExecution.findUnique({
      where: { id: executionId },
      include: { fireEquipment: { include: { fireEquipmentType: true, area: true } } },
    });
    if (!execution || execution.overallResult !== FireChecklistResult.FAILED) return 0;

    const plant = await prisma.plant.findUnique({ where: { id: execution.plantId } });
    if (!plant) return 0;

    const [areaRecipients, n3Recipients] = await Promise.all([
      resolveAreaRecipients(execution.plantId, execution.fireEquipment.areaId),
      resolveN3SafetyRecipients(execution.plantId),
    ]);
    const recipients = mergeRecipients(areaRecipients, n3Recipients);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: FIRE_EQUIPMENT_URGENT_CHANNEL,
      build: (recipient) => {
        const content = buildNonConformityAlertContent({
          locale: normalizeMasterDataLocale(recipient.language),
          equipmentInternalCode: execution.fireEquipment.internalCode,
          equipmentTypeName: execution.fireEquipment.fireEquipmentType.name,
          areaName: execution.fireEquipment.area?.name ?? null,
          plantCode: plant.code,
          fireEquipmentId: execution.fireEquipmentId,
        });
        return {
          plantId: execution.plantId,
          plantName: plant.name,
          fireEquipmentId: execution.fireEquipmentId,
          executionId: execution.id,
          alertType: FireEquipmentAlertType.NON_CONFORMITY_FOUND,
          cycleKey: execution.id,
          ...content,
        };
      },
    });
  },

  /** Polling target for FireEquipmentUrgentAlert (NON_CONFORMITY_FOUND only, FIRE_EQUIPMENT_URGENT channel). */
  async listUnreadUrgentAlerts(input: { plantId: string; plantCode: string; userId: string; limit?: number }): Promise<FireEquipmentUrgentFloatingAlert[]> {
    const rows = await prisma.fireEquipmentAlertDelivery.findMany({
      where: {
        userId: input.userId,
        plantId: input.plantId,
        channel: ActionAlertChannel.SOFTWARE,
        alertType: FireEquipmentAlertType.NON_CONFORMITY_FOUND,
        // Filters by the notification's own channel, not just the delivery
        // row's — this delivery log has no other alertType that would use
        // FIRE_EQUIPMENT_ALERT instead, but keeping the same guard as
        // competence-alert-service.ts's listUnreadUrgentAlerts avoids relying
        // on that staying true forever.
        notification: { channel: FIRE_EQUIPMENT_URGENT_CHANNEL, status: "UNREAD" },
      },
      include: { notification: true },
      orderBy: { sentAt: "desc" },
      take: input.limit ?? 10,
    });

    return rows.flatMap((row): FireEquipmentUrgentFloatingAlert[] => {
      if (!row.notification) return [];
      return [{
        id: row.notification.id,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt.toISOString(),
        actionUrl: `/app/${input.plantCode}/fire-equipment/${row.fireEquipmentId}`,
      }];
    });
  },
};
