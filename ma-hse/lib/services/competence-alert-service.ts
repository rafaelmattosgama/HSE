import { ActionAlertChannel, AuthorizationStatus, CompetenceAlertType, CompetenceCellState, RoleCode } from "@prisma/client";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/routing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ACTION_ALERT_TIMEZONE } from "@/lib/services/action-alert-service";
import { normalizeMasterDataLocale } from "@/lib/services/master-data-translation-service";
import { resolveDepartmentAlertRecipients } from "@/lib/services/safety-communication-alert-service";
import type { ComputedCompetenceCellState } from "@/lib/services/competence-state-service";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

/**
 * §7.1 of docs/modulo-competencias-autorizacoes.md.
 * COMPETENCE_ALERT: EXPIRING_90/60/30/7, EXPIRY_DAY, MISSING_DOCUMENT,
 * ROLE_WITHOUT_COMPETENCE, AWAITING_ASSESSMENT — read by the existing
 * RepeatabilityAlertModal (layout.tsx just adds this channel to its filter).
 * COMPETENCE_URGENT: AUTHORIZATION_SUSPENDED / AUTHORIZATION_REVOKED —
 * immediate, polled client-side every 30s like SafetyCommunicationFloatingAlert.
 */
export const COMPETENCE_ALERT_CHANNEL = "COMPETENCE_ALERT";
export const COMPETENCE_URGENT_CHANNEL = "COMPETENCE_URGENT";

export type CompetenceUrgentFloatingAlert = {
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

async function resolveN3Recipients(plantId: string): Promise<AlertRecipient[]> {
  const rows = await prisma.userPlantRole.findMany({
    where: { plantId, role: { code: RoleCode.N3_SAFETY }, user: { isActive: true } },
    include: { user: { select: { id: true, name: true, email: true, language: true } } },
  });
  return dedupeById(rows.map((row) => row.user));
}

async function resolveN2Recipients(plantId: string): Promise<AlertRecipient[]> {
  const rows = await prisma.userPlantRole.findMany({
    where: { plantId, role: { code: RoleCode.N2_PLANT_MANAGER }, user: { isActive: true } },
    include: { user: { select: { id: true, name: true, email: true, language: true } } },
  });
  return dedupeById(rows.map((row) => row.user));
}

/** §7.2 "Responsável do departamento" — empty when the worker has no areaId yet (§2.2). */
async function resolveDepartmentRecipients(plantId: string, areaId: string | null): Promise<AlertRecipient[]> {
  if (!areaId) return [];
  const rows = await resolveDepartmentAlertRecipients({ plantId, departmentId: areaId });
  return dedupeById(rows.map((row) => row.user));
}

/** The worker themselves, if EmployeeDirectory is linked to a User account (§7.2, AUTHORIZATION_SUSPENDED only). */
async function resolveWorkerOwnAccount(employeeDirectoryId: string): Promise<AlertRecipient[]> {
  const user = await prisma.user.findFirst({
    where: { employeeDirectoryId, isActive: true },
    select: { id: true, name: true, email: true, language: true },
  });
  return user ? [user] : [];
}

function monthlyCycleKey(referenceDate: Date) {
  const zoned = toZonedTime(referenceDate, ACTION_ALERT_TIMEZONE);
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}`;
}

/** item 14: ISO week ("YYYY-Www", Europe/Lisbon) so the weekly AWAITING_ASSESSMENT summary actually recurs weekly. */
function weeklyCycleKey(referenceDate: Date) {
  const zoned = toZonedTime(referenceDate, ACTION_ALERT_TIMEZONE);
  return `${getISOWeekYear(zoned)}-W${String(getISOWeek(zoned)).padStart(2, "0")}`;
}

/** item 16: composite key matching CompetenceAlertDelivery's @@unique, used to skip a combination already delivered instead of relying on a P2002. */
function deliveryKey(input: {
  competenceWorkerId: string;
  competenceTypeId: string;
  userId: string;
  alertType: CompetenceAlertType;
  channel: ActionAlertChannel;
  cycleKey: string;
}) {
  return [input.competenceWorkerId, input.competenceTypeId, input.userId, input.alertType, input.channel, input.cycleKey].join("|");
}

const competenceAlertCopy: Record<AppLocale, {
  expiring90: string;
  expiring60: string;
  expiring30: string;
  expiring7: string;
  expiryDay: string;
  missingDocument: string;
  suspended: string;
  revoked: string;
  roleWithoutCompetence: string;
  awaitingAssessment: string;
  competenceLabel: string;
  workerLabel: string;
  validUntilLabel: string;
  daysRemainingLabel: string;
  reasonLabel: string;
}> = {
  en: {
    expiring90: "Authorization expiring in 90 days", expiring60: "Authorization expiring in 60 days",
    expiring30: "Authorization expiring in 30 days", expiring7: "Authorization expiring in 7 days",
    expiryDay: "Authorization expires today", missingDocument: "Signed authorization document missing",
    suspended: "Authorization suspended", revoked: "Authorization revoked",
    roleWithoutCompetence: "Worker missing a required competence", awaitingAssessment: "Practical assessment pending",
    competenceLabel: "Competence", workerLabel: "Worker", validUntilLabel: "Valid until",
    daysRemainingLabel: "Days remaining", reasonLabel: "Reason",
  },
  pt: {
    expiring90: "Autorização a expirar em 90 dias", expiring60: "Autorização a expirar em 60 dias",
    expiring30: "Autorização a expirar em 30 dias", expiring7: "Autorização a expirar em 7 dias",
    expiryDay: "Autorização expira hoje", missingDocument: "Falta o documento assinado da autorização",
    suspended: "Autorização suspensa", revoked: "Autorização revogada",
    roleWithoutCompetence: "Trabalhador sem competência exigida", awaitingAssessment: "Avaliação prática pendente",
    competenceLabel: "Competência", workerLabel: "Trabalhador", validUntilLabel: "Válida até",
    daysRemainingLabel: "Dias restantes", reasonLabel: "Motivo",
  },
  it: {
    expiring90: "Autorizzazione in scadenza in 90 giorni", expiring60: "Autorizzazione in scadenza in 60 giorni",
    expiring30: "Autorizzazione in scadenza in 30 giorni", expiring7: "Autorizzazione in scadenza in 7 giorni",
    expiryDay: "L'autorizzazione scade oggi", missingDocument: "Manca il documento firmato dell'autorizzazione",
    suspended: "Autorizzazione sospesa", revoked: "Autorizzazione revocata",
    roleWithoutCompetence: "Lavoratore senza competenza richiesta", awaitingAssessment: "Valutazione pratica in sospeso",
    competenceLabel: "Competenza", workerLabel: "Lavoratore", validUntilLabel: "Valida fino al",
    daysRemainingLabel: "Giorni rimanenti", reasonLabel: "Motivo",
  },
  pl: {
    expiring90: "Upoważnienie wygasa za 90 dni", expiring60: "Upoważnienie wygasa za 60 dni",
    expiring30: "Upoważnienie wygasa za 30 dni", expiring7: "Upoważnienie wygasa za 7 dni",
    expiryDay: "Upoważnienie wygasa dzisiaj", missingDocument: "Brak podpisanego dokumentu upoważnienia",
    suspended: "Upoważnienie wstrzymane", revoked: "Upoważnienie odwołane",
    roleWithoutCompetence: "Pracownik bez wymaganej kompetencji", awaitingAssessment: "Oczekująca ocena praktyczna",
    competenceLabel: "Kompetencja", workerLabel: "Pracownik", validUntilLabel: "Ważna do",
    daysRemainingLabel: "Dni pozostałe", reasonLabel: "Powód",
  },
  de: {
    expiring90: "Genehmigung läuft in 90 Tagen ab", expiring60: "Genehmigung läuft in 60 Tagen ab",
    expiring30: "Genehmigung läuft in 30 Tagen ab", expiring7: "Genehmigung läuft in 7 Tagen ab",
    expiryDay: "Genehmigung läuft heute ab", missingDocument: "Unterschriebenes Genehmigungsdokument fehlt",
    suspended: "Genehmigung ausgesetzt", revoked: "Genehmigung widerrufen",
    roleWithoutCompetence: "Mitarbeiter ohne erforderliche Kompetenz", awaitingAssessment: "Praktische Bewertung ausstehend",
    competenceLabel: "Kompetenz", workerLabel: "Mitarbeiter", validUntilLabel: "Gültig bis",
    daysRemainingLabel: "Verbleibende Tage", reasonLabel: "Grund",
  },
  ro: {
    expiring90: "Autorizația expiră în 90 de zile", expiring60: "Autorizația expiră în 60 de zile",
    expiring30: "Autorizația expiră în 30 de zile", expiring7: "Autorizația expiră în 7 zile",
    expiryDay: "Autorizația expiră astăzi", missingDocument: "Lipsește documentul semnat al autorizației",
    suspended: "Autorizație suspendată", revoked: "Autorizație revocată",
    roleWithoutCompetence: "Lucrător fără competența necesară", awaitingAssessment: "Evaluare practică în așteptare",
    competenceLabel: "Competență", workerLabel: "Lucrător", validUntilLabel: "Valabilă până la",
    daysRemainingLabel: "Zile rămase", reasonLabel: "Motiv",
  },
  fr: {
    expiring90: "Autorisation expirant dans 90 jours", expiring60: "Autorisation expirant dans 60 jours",
    expiring30: "Autorisation expirant dans 30 jours", expiring7: "Autorisation expirant dans 7 jours",
    expiryDay: "L'autorisation expire aujourd'hui", missingDocument: "Document d'autorisation signé manquant",
    suspended: "Autorisation suspendue", revoked: "Autorisation révoquée",
    roleWithoutCompetence: "Collaborateur sans la compétence requise", awaitingAssessment: "Évaluation pratique en attente",
    competenceLabel: "Compétence", workerLabel: "Collaborateur", validUntilLabel: "Valable jusqu'au",
    daysRemainingLabel: "Jours restants", reasonLabel: "Motif",
  },
};

const ALERT_TYPE_TITLE_KEY: Record<CompetenceAlertType, keyof typeof competenceAlertCopy.en> = {
  EXPIRING_90: "expiring90",
  EXPIRING_60: "expiring60",
  EXPIRING_30: "expiring30",
  EXPIRING_7: "expiring7",
  EXPIRY_DAY: "expiryDay",
  MISSING_DOCUMENT: "missingDocument",
  AUTHORIZATION_SUSPENDED: "suspended",
  AUTHORIZATION_REVOKED: "revoked",
  ROLE_WITHOUT_COMPETENCE: "roleWithoutCompetence",
  AWAITING_ASSESSMENT: "awaitingAssessment",
};

function formatLisbonDate(value: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: ACTION_ALERT_TIMEZONE }).format(value);
}

function buildAlertContent(input: {
  alertType: CompetenceAlertType;
  locale: AppLocale;
  competenceTypeName: string;
  workerName: string;
  validUntil?: Date | null;
  daysToExpiry?: number | null;
  reason?: string | null;
  plantCode: string;
  competenceWorkerId: string;
}) {
  const copy = competenceAlertCopy[input.locale];
  const label = copy[ALERT_TYPE_TITLE_KEY[input.alertType]];
  const lines = [
    `${copy.competenceLabel}: ${input.competenceTypeName}`,
    `${copy.workerLabel}: ${input.workerName}`,
  ];
  if (input.validUntil) lines.push(`${copy.validUntilLabel}: ${formatLisbonDate(input.validUntil, input.locale)}`);
  if (typeof input.daysToExpiry === "number") lines.push(`${copy.daysRemainingLabel}: ${input.daysToExpiry}`);
  if (input.reason) lines.push(`${copy.reasonLabel}: ${input.reason}`);

  return {
    title: `${label}: ${input.workerName}`,
    body: lines.join("\n"),
    actionUrl: `/app/${input.plantCode}/competences/${input.competenceWorkerId}`,
  };
}

/** item 14: one summary body per recipient, listing every pending (worker, competence) pair instead of one message per pair. */
function buildAwaitingAssessmentSummaryContent(input: {
  locale: AppLocale;
  plantCode: string;
  rows: Array<{ workerName: string; competenceTypeName: string }>;
}) {
  const copy = competenceAlertCopy[input.locale];
  const lines = input.rows.map((row) => `${copy.workerLabel}: ${row.workerName} — ${copy.competenceLabel}: ${row.competenceTypeName}`);

  return {
    title: copy.awaitingAssessment,
    body: lines.join("\n"),
    actionUrl: `/app/${input.plantCode}/competences`,
  };
}

type DispatchContext = {
  plantId: string;
  plantName: string;
  competenceWorkerId: string;
  competenceTypeId: string;
  authorizationId: string | null;
  alertType: CompetenceAlertType;
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
          // minor fix ("alerta in-app sem link"): ctx.actionUrl already existed
          // and reached the email — it just never got attached to the in-app
          // Notification, so RepeatabilityAlertModal had nothing to link to.
          actionUrl: ctx.actionUrl,
          channel: notificationChannel,
          status: "UNREAD",
        },
      });

      await tx.competenceAlertDelivery.create({
        data: {
          plantId: ctx.plantId,
          competenceWorkerId: ctx.competenceWorkerId,
          competenceTypeId: ctx.competenceTypeId,
          authorizationId: ctx.authorizationId,
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
    await prisma.competenceAlertDelivery.create({
      data: {
        plantId: ctx.plantId,
        competenceWorkerId: ctx.competenceWorkerId,
        competenceTypeId: ctx.competenceTypeId,
        authorizationId: ctx.authorizationId,
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
  /** item 16: pre-loaded already-delivered combinations, to skip a write attempt instead of catching its P2002. */
  deliveredKeys?: Set<string>;
}) {
  let created = 0;

  for (const recipient of input.recipients) {
    try {
      const ctx = input.build(recipient);
      const alreadySoftware = input.deliveredKeys?.has(
        deliveryKey({ competenceWorkerId: ctx.competenceWorkerId, competenceTypeId: ctx.competenceTypeId, userId: recipient.id, alertType: ctx.alertType, channel: ActionAlertChannel.SOFTWARE, cycleKey: ctx.cycleKey }),
      );
      if (!alreadySoftware && await createSoftwareAlert(ctx, recipient, input.notificationChannel)) created += 1;

      const alreadyEmail = input.deliveredKeys?.has(
        deliveryKey({ competenceWorkerId: ctx.competenceWorkerId, competenceTypeId: ctx.competenceTypeId, userId: recipient.id, alertType: ctx.alertType, channel: ActionAlertChannel.EMAIL, cycleKey: ctx.cycleKey }),
      );
      if (!alreadyEmail && await sendEmailAlert(ctx, recipient)) created += 1;
    } catch (error) {
      logger.error({ error, userId: recipient.id }, "failed_to_dispatch_competence_alert");
    }
  }

  return created;
}

// minor fix: findFirst + plantId, not a bare findUnique(id) — a stale or
// cross-plant id must not resolve to another plant's worker/type.
async function loadWorkerTypeContext(plantId: string, competenceWorkerId: string, competenceTypeId: string) {
  const [worker, competenceType, plant] = await Promise.all([
    prisma.competenceWorker.findFirst({ where: { id: competenceWorkerId, plantId }, include: { employee: true } }),
    prisma.competenceType.findFirst({ where: { id: competenceTypeId, plantId } }),
    prisma.plant.findUnique({ where: { id: plantId } }),
  ]);
  if (!worker || !competenceType || !plant) return null;
  return { worker, competenceType, plant };
}

type DailyAlertContext = {
  plant: { id: string; code: string; name: string };
  competenceTypesById: Map<string, { id: string; name: string }>;
  workersById: Map<string, { id: string; areaId: string | null; employee: { name: string } }>;
  n3Recipients: AlertRecipient[];
  n2Recipients: AlertRecipient[];
  recipientsByAreaId: Map<string, AlertRecipient[]>;
  undocumentedAuthorizations: Array<{ id: string; competenceWorkerId: string; competenceTypeId: string }>;
  deliveredKeys: Set<string>;
};

/**
 * item 16: everything the daily job's per-cell dispatch needs, loaded once
 * per plant rather than per cell. Before this, each cell in an expiry band
 * re-ran three findUnique calls (loadWorkerTypeContext) plus two or three
 * recipient findMany calls, and — because the bands use `<=` — the same
 * cost repeated every day for as long as that authorization stayed in band.
 */
async function loadDailyAlertContext(
  plantId: string,
  computedStates: Array<{ competenceWorkerId: string; competenceTypeId: string; computed: ComputedCompetenceCellState }>,
  referenceDate: Date,
): Promise<DailyAlertContext | null> {
  const [plant, competenceTypes, workers, n3Recipients, n2Recipients, undocumentedAuthorizations] = await Promise.all([
    prisma.plant.findUnique({ where: { id: plantId }, select: { id: true, code: true, name: true } }),
    prisma.competenceType.findMany({ where: { plantId }, select: { id: true, name: true } }),
    prisma.competenceWorker.findMany({ where: { plantId }, select: { id: true, areaId: true, employee: { select: { name: true } } } }),
    resolveN3Recipients(plantId),
    resolveN2Recipients(plantId),
    // minor fix: an inactive worker or a deactivated competence type must
    // stop generating a MISSING_DOCUMENT reminder every month forever.
    prisma.workerAuthorization.findMany({
      where: {
        plantId,
        status: AuthorizationStatus.ACTIVE,
        documentFileKey: null,
        competenceWorker: { isActive: true },
        competenceType: { isActive: true },
      },
      select: { id: true, competenceWorkerId: true, competenceTypeId: true },
    }),
  ]);
  if (!plant) return null;

  const competenceTypesById = new Map(competenceTypes.map((type) => [type.id, type]));
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));

  const areaIds = Array.from(new Set(workers.map((worker) => worker.areaId).filter((id): id is string => Boolean(id))));
  const recipientsByAreaId = new Map<string, AlertRecipient[]>(
    await Promise.all(areaIds.map(async (areaId) => [areaId, await resolveDepartmentRecipients(plantId, areaId)] as const)),
  );

  // minor fix: authorizationId is not part of CompetenceAlertDelivery's
  // @@unique, so MISSING_DOCUMENT's cycleKey folds it in here too — a
  // renewal granted the same month as the old undocumented authorization
  // must still get its own reminder.
  const missingDocumentCycleKeySuffix = monthlyCycleKey(referenceDate);
  const relevantCycleKeys = Array.from(new Set([
    ...computedStates.map((row) => row.computed.currentAuthorizationId).filter((id): id is string => Boolean(id)),
    ...undocumentedAuthorizations.map((authorization) => `${authorization.id}:${missingDocumentCycleKeySuffix}`),
  ]));

  const deliveries = relevantCycleKeys.length > 0
    ? await prisma.competenceAlertDelivery.findMany({
        where: { plantId, cycleKey: { in: relevantCycleKeys } },
        select: { competenceWorkerId: true, competenceTypeId: true, userId: true, alertType: true, channel: true, cycleKey: true },
      })
    : [];
  const deliveredKeys = new Set(deliveries.map((delivery) => deliveryKey(delivery)));

  return { plant, competenceTypesById, workersById, n3Recipients, n2Recipients, recipientsByAreaId, undocumentedAuthorizations, deliveredKeys };
}

function pickExpiryAlertType(daysToExpiry: number): CompetenceAlertType | null {
  // item 12: <= 0, not === 0 — if the job misses the exact expiry day, the
  // next run must still be able to send EXPIRY_DAY (nothing else covers
  // EXPIRED). Bounded to -30 so a very old, long-expired row stops retrying
  // forever; cycleKey already caps it to one delivery per authorization.
  if (daysToExpiry <= 0 && daysToExpiry >= -30) return CompetenceAlertType.EXPIRY_DAY;
  if (daysToExpiry < 0) return null;
  if (daysToExpiry <= 7) return CompetenceAlertType.EXPIRING_7;
  if (daysToExpiry <= 30) return CompetenceAlertType.EXPIRING_30;
  if (daysToExpiry <= 60) return CompetenceAlertType.EXPIRING_60;
  if (daysToExpiry <= 90) return CompetenceAlertType.EXPIRING_90;
  return null;
}

export const CompetenceAlertService = {
  /**
   * §7.2, immediate: department responsible, N3_SAFETY, and the worker's own
   * account if EmployeeDirectory is linked to a User. cycleKey includes
   * suspendedAt (§7.3, crit 3) — reactivateAuthorization flips SUSPENDED back
   * to ACTIVE on the same row, without a new authorizationId, so a bare
   * authorization.id key would make a second suspend->reactivate->suspend
   * cycle collide (P2002) with the first delivery and silently never alert.
   * suspendedAt is rewritten on every suspend (competence-service.ts,
   * suspendAuthorization), so each cycle gets a fresh key.
   */
  async dispatchAuthorizationSuspended(authorizationId: string) {
    const authorization = await prisma.workerAuthorization.findUnique({
      where: { id: authorizationId },
      include: { competenceWorker: { include: { employee: true } }, competenceType: true },
    });
    if (!authorization) return 0;
    const plant = await prisma.plant.findUnique({ where: { id: authorization.plantId } });
    if (!plant) return 0;

    const [departmentRecipients, n3Recipients, ownAccount] = await Promise.all([
      resolveDepartmentRecipients(authorization.plantId, authorization.competenceWorker.areaId),
      resolveN3Recipients(authorization.plantId),
      resolveWorkerOwnAccount(authorization.competenceWorker.employeeDirectoryId),
    ]);
    const recipients = mergeRecipients(departmentRecipients, n3Recipients, ownAccount);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: COMPETENCE_URGENT_CHANNEL,
      build: (recipient) => {
        const content = buildAlertContent({
          alertType: CompetenceAlertType.AUTHORIZATION_SUSPENDED,
          locale: normalizeMasterDataLocale(recipient.language),
          competenceTypeName: authorization.competenceType.name,
          workerName: authorization.competenceWorker.employee.name,
          reason: authorization.suspensionReason,
          plantCode: plant.code,
          competenceWorkerId: authorization.competenceWorkerId,
        });
        return {
          plantId: authorization.plantId,
          plantName: plant.name,
          competenceWorkerId: authorization.competenceWorkerId,
          competenceTypeId: authorization.competenceTypeId,
          authorizationId: authorization.id,
          alertType: CompetenceAlertType.AUTHORIZATION_SUSPENDED,
          cycleKey: `${authorization.id}:${authorization.suspendedAt?.toISOString() ?? ""}`,
          ...content,
        };
      },
    });
  },

  /** §7.2, immediate: department responsible, N3_SAFETY, N2_PLANT_MANAGER. No worker account (revocation is definitive). */
  async dispatchAuthorizationRevoked(authorizationId: string) {
    const authorization = await prisma.workerAuthorization.findUnique({
      where: { id: authorizationId },
      include: { competenceWorker: { include: { employee: true } }, competenceType: true },
    });
    if (!authorization) return 0;
    const plant = await prisma.plant.findUnique({ where: { id: authorization.plantId } });
    if (!plant) return 0;

    const [departmentRecipients, n3Recipients, n2Recipients] = await Promise.all([
      resolveDepartmentRecipients(authorization.plantId, authorization.competenceWorker.areaId),
      resolveN3Recipients(authorization.plantId),
      resolveN2Recipients(authorization.plantId),
    ]);
    const recipients = mergeRecipients(departmentRecipients, n3Recipients, n2Recipients);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: COMPETENCE_URGENT_CHANNEL,
      build: (recipient) => {
        const content = buildAlertContent({
          alertType: CompetenceAlertType.AUTHORIZATION_REVOKED,
          locale: normalizeMasterDataLocale(recipient.language),
          competenceTypeName: authorization.competenceType.name,
          workerName: authorization.competenceWorker.employee.name,
          reason: authorization.revocationReason,
          plantCode: plant.code,
          competenceWorkerId: authorization.competenceWorkerId,
        });
        return {
          plantId: authorization.plantId,
          plantName: plant.name,
          competenceWorkerId: authorization.competenceWorkerId,
          competenceTypeId: authorization.competenceTypeId,
          authorizationId: authorization.id,
          alertType: CompetenceAlertType.AUTHORIZATION_REVOKED,
          cycleKey: authorization.id,
          ...content,
        };
      },
    });
  },

  /**
   * §7.2, "na alteração de função ou matriz": department responsible +
   * N3_SAFETY. cycleKey = "YYYY-MM" (§7.3 — no authorization backs this one),
   * so re-editing a rule several times the same month only alerts once.
   */
  async dispatchRoleWithoutCompetence(
    plantId: string,
    gaps: Array<{ competenceWorkerId: string; competenceTypeId: string }>,
    referenceDate = new Date(),
  ) {
    let sent = 0;
    const cycleKey = monthlyCycleKey(referenceDate);

    for (const gap of gaps) {
      const context = await loadWorkerTypeContext(plantId, gap.competenceWorkerId, gap.competenceTypeId);
      if (!context) continue;

      const [departmentRecipients, n3Recipients] = await Promise.all([
        resolveDepartmentRecipients(plantId, context.worker.areaId),
        resolveN3Recipients(plantId),
      ]);
      const recipients = mergeRecipients(departmentRecipients, n3Recipients);
      if (recipients.length === 0) continue;

      sent += await dispatchToRecipients({
        recipients,
        notificationChannel: COMPETENCE_ALERT_CHANNEL,
        build: (recipient) => {
          const content = buildAlertContent({
            alertType: CompetenceAlertType.ROLE_WITHOUT_COMPETENCE,
            locale: normalizeMasterDataLocale(recipient.language),
            competenceTypeName: context.competenceType.name,
            workerName: context.worker.employee.name,
            plantCode: context.plant.code,
            competenceWorkerId: gap.competenceWorkerId,
          });
          return {
            plantId,
            plantName: context.plant.name,
            competenceWorkerId: gap.competenceWorkerId,
            competenceTypeId: gap.competenceTypeId,
            authorizationId: null,
            alertType: CompetenceAlertType.ROLE_WITHOUT_COMPETENCE,
            cycleKey,
            ...content,
          };
        },
      });
    }

    return sent;
  },

  /**
   * The daily job (§7.2 table): EXPIRING_90/60/30/7 + EXPIRY_DAY from the
   * freshly recomputed states (§3.7(c) — capturing the passage of time is
   * this job's own responsibility, not just writes); MISSING_DOCUMENT for
   * ACTIVE authorizations with no signed PDF; AWAITING_ASSESSMENT only on
   * the designated weekly day ("resumo semanal, não diário" — the monthly
   * cycleKey then caps it to once a month regardless of how many Mondays
   * see the same gap); ROLE_WITHOUT_COMPETENCE for every required-but-MISSING
   * cell (item 13 — writes already dispatch this on the spot, but the daily
   * job is what actually sees gaps that were never touched by a write).
   *
   * crit 4: a failure resolving one row (network blip, pool exhaustion) must
   * not cost every other row in the plant its alert for the day, and must
   * not skip MISSING_DOCUMENT / ROLE_WITHOUT_COMPETENCE, which only run once
   * per plant after the loop — each gets logged and isolated on its own.
   */
  async runDailyAlerts(
    plantId: string,
    computedStates: Array<{ competenceWorkerId: string; competenceTypeId: string; computed: ComputedCompetenceCellState }>,
    referenceDate = new Date(),
  ) {
    const zonedNow = toZonedTime(referenceDate, ACTION_ALERT_TIMEZONE);
    const isWeeklyAssessmentDay = zonedNow.getDay() === 1;
    const roleWithoutCompetenceGaps: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    const awaitingAssessmentRows: Array<{ competenceWorkerId: string; competenceTypeId: string }> = [];
    let sent = 0;

    // item 16: loaded once for the whole plant/run, not once per cell.
    const context = await loadDailyAlertContext(plantId, computedStates, referenceDate);
    if (!context) return 0;

    for (const row of computedStates) {
      try {
        const { computed } = row;
        // item 11: EXPIRED with a positive daysToExpiry means the training
        // certificate lapsed (§5 step 8), not the authorization itself — an
        // "expiring soon" email would be reassuring and wrong, and would
        // burn the band's cycleKey with nothing to show for it.
        if (
          (computed.state === CompetenceCellState.VALID || computed.state === CompetenceCellState.EXPIRING)
          && computed.currentAuthorizationId
          && typeof computed.daysToExpiry === "number"
        ) {
          const alertType = pickExpiryAlertType(computed.daysToExpiry);
          if (alertType) {
            sent += await CompetenceAlertService.dispatchExpiryAlert({
              context,
              competenceWorkerId: row.competenceWorkerId,
              competenceTypeId: row.competenceTypeId,
              authorizationId: computed.currentAuthorizationId,
              alertType,
              daysToExpiry: computed.daysToExpiry,
              validUntil: computed.validUntil,
            });
          }
        }

        if (computed.state === CompetenceCellState.AWAITING_ASSESSMENT) {
          awaitingAssessmentRows.push({ competenceWorkerId: row.competenceWorkerId, competenceTypeId: row.competenceTypeId });
        }

        if (computed.isRequired && computed.state === CompetenceCellState.MISSING) {
          roleWithoutCompetenceGaps.push({ competenceWorkerId: row.competenceWorkerId, competenceTypeId: row.competenceTypeId });
        }
      } catch (error) {
        logger.error(
          { error, plantId, competenceWorkerId: row.competenceWorkerId, competenceTypeId: row.competenceTypeId },
          "failed_to_process_competence_alert_row",
        );
      }
    }

    if (isWeeklyAssessmentDay && awaitingAssessmentRows.length > 0) {
      try {
        sent += await CompetenceAlertService.dispatchAwaitingAssessmentSummary(plantId, awaitingAssessmentRows, context, referenceDate);
      } catch (error) {
        logger.error({ error, plantId }, "failed_to_dispatch_competence_awaiting_assessment_summary");
      }
    }

    try {
      sent += await CompetenceAlertService.dispatchMissingDocuments(plantId, referenceDate, context);
    } catch (error) {
      logger.error({ error, plantId }, "failed_to_dispatch_competence_missing_documents");
    }

    if (roleWithoutCompetenceGaps.length > 0) {
      try {
        sent += await CompetenceAlertService.dispatchRoleWithoutCompetence(plantId, roleWithoutCompetenceGaps, referenceDate);
      } catch (error) {
        logger.error({ error, plantId }, "failed_to_dispatch_competence_role_without_competence");
      }
    }

    return sent;
  },

  /**
   * §7.2: department responsible + N3_SAFETY (+ N2_PLANT_MANAGER for
   * EXPIRY_DAY only). cycleKey = authorizationId. item 16: resolves worker,
   * competence type and recipients from the shared context instead of a
   * fresh loadWorkerTypeContext + recipient lookups per call.
   */
  async dispatchExpiryAlert(input: {
    context: DailyAlertContext;
    competenceWorkerId: string;
    competenceTypeId: string;
    authorizationId: string;
    alertType: CompetenceAlertType;
    daysToExpiry: number;
    validUntil: Date | null;
  }) {
    const { context } = input;
    const worker = context.workersById.get(input.competenceWorkerId);
    const competenceType = context.competenceTypesById.get(input.competenceTypeId);
    if (!worker || !competenceType) return 0;

    const departmentRecipients = worker.areaId ? context.recipientsByAreaId.get(worker.areaId) ?? [] : [];
    const n2Recipients = input.alertType === CompetenceAlertType.EXPIRY_DAY ? context.n2Recipients : [];
    const recipients = mergeRecipients(departmentRecipients, context.n3Recipients, n2Recipients);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: COMPETENCE_ALERT_CHANNEL,
      deliveredKeys: context.deliveredKeys,
      build: (recipient) => {
        const content = buildAlertContent({
          alertType: input.alertType,
          locale: normalizeMasterDataLocale(recipient.language),
          competenceTypeName: competenceType.name,
          workerName: worker.employee.name,
          validUntil: input.validUntil,
          daysToExpiry: input.daysToExpiry,
          plantCode: context.plant.code,
          competenceWorkerId: input.competenceWorkerId,
        });
        return {
          plantId: context.plant.id,
          plantName: context.plant.name,
          competenceWorkerId: input.competenceWorkerId,
          competenceTypeId: input.competenceTypeId,
          authorizationId: input.authorizationId,
          alertType: input.alertType,
          cycleKey: input.authorizationId,
          ...content,
        };
      },
    });
  },

  /**
   * §7.2: department responsible, weekly summary (item 14). One
   * notification and one email per recipient, listing every pending
   * (worker, competence) pair in their department(s) — previously one of
   * each PER PAIR per recipient, so a department with 80 pending
   * assessments meant 80 emails the same morning. cycleKey is the ISO week
   * ("YYYY-Www", Europe/Lisbon): the old monthly key suppressed every
   * Monday after the first one in a month, so "weekly" never actually
   * repeated within the month.
   *
   * CompetenceAlertDelivery still needs one (competenceWorkerId,
   * competenceTypeId) pair per row (§3.8) even though one email covers
   * many — the first pair after a deterministic sort is used purely as the
   * idempotency anchor, not as "the" subject of the email.
   */
  async dispatchAwaitingAssessmentSummary(
    plantId: string,
    rows: Array<{ competenceWorkerId: string; competenceTypeId: string }>,
    context: DailyAlertContext,
    referenceDate = new Date(),
  ) {
    if (rows.length === 0) return 0;

    const byRecipientId = new Map<string, {
      recipient: AlertRecipient;
      rows: Array<{ competenceWorkerId: string; competenceTypeId: string; workerName: string; competenceTypeName: string }>;
    }>();

    const sortedRows = [...rows].sort(
      (a, b) => a.competenceWorkerId.localeCompare(b.competenceWorkerId) || a.competenceTypeId.localeCompare(b.competenceTypeId),
    );

    for (const row of sortedRows) {
      const worker = context.workersById.get(row.competenceWorkerId);
      const competenceType = context.competenceTypesById.get(row.competenceTypeId);
      if (!worker || !competenceType) continue;

      // minor fix: a worker with no areaId yet (§2.2) has nowhere to resolve
      // department recipients from — this used to return 0 in complete
      // silence. Logged so a gap in worker data shows up somewhere, instead
      // of the pending assessment just never reaching anyone.
      if (!worker.areaId) {
        logger.info(
          { competenceWorkerId: row.competenceWorkerId, competenceTypeId: row.competenceTypeId },
          "competence_awaiting_assessment_worker_without_area",
        );
      }
      const recipients = worker.areaId ? context.recipientsByAreaId.get(worker.areaId) ?? [] : [];

      for (const recipient of recipients) {
        const entry = byRecipientId.get(recipient.id) ?? { recipient, rows: [] };
        entry.rows.push({
          competenceWorkerId: row.competenceWorkerId,
          competenceTypeId: row.competenceTypeId,
          workerName: worker.employee.name,
          competenceTypeName: competenceType.name,
        });
        byRecipientId.set(recipient.id, entry);
      }
    }

    const cycleKey = weeklyCycleKey(referenceDate);
    let sent = 0;

    for (const { recipient, rows: recipientRows } of byRecipientId.values()) {
      const anchor = recipientRows[0];
      const content = buildAwaitingAssessmentSummaryContent({
        locale: normalizeMasterDataLocale(recipient.language),
        plantCode: context.plant.code,
        rows: recipientRows,
      });

      sent += await dispatchToRecipients({
        recipients: [recipient],
        notificationChannel: COMPETENCE_ALERT_CHANNEL,
        build: () => ({
          plantId,
          plantName: context.plant.name,
          competenceWorkerId: anchor.competenceWorkerId,
          competenceTypeId: anchor.competenceTypeId,
          authorizationId: null,
          alertType: CompetenceAlertType.AWAITING_ASSESSMENT,
          cycleKey,
          ...content,
        }),
      });
    }

    return sent;
  },

  /**
   * §7.2: N3_SAFETY only. An ACTIVE authorization with no signed PDF
   * (documentFileKey) is a gap independent of the authorization's own
   * validity window. item 16: the undocumented-authorizations list and
   * N3 recipients come from the shared context, loaded once for the plant.
   */
  async dispatchMissingDocuments(plantId: string, referenceDate: Date, context: DailyAlertContext) {
    if (context.undocumentedAuthorizations.length === 0) return 0;
    if (context.n3Recipients.length === 0) return 0;
    const cycleKeySuffix = monthlyCycleKey(referenceDate);

    let sent = 0;
    for (const authorization of context.undocumentedAuthorizations) {
      const worker = context.workersById.get(authorization.competenceWorkerId);
      const competenceType = context.competenceTypesById.get(authorization.competenceTypeId);
      if (!worker || !competenceType) continue;

      sent += await dispatchToRecipients({
        recipients: context.n3Recipients,
        notificationChannel: COMPETENCE_ALERT_CHANNEL,
        deliveredKeys: context.deliveredKeys,
        build: (recipient) => {
          const content = buildAlertContent({
            alertType: CompetenceAlertType.MISSING_DOCUMENT,
            locale: normalizeMasterDataLocale(recipient.language),
            competenceTypeName: competenceType.name,
            workerName: worker.employee.name,
            plantCode: context.plant.code,
            competenceWorkerId: authorization.competenceWorkerId,
          });
          return {
            plantId,
            plantName: context.plant.name,
            competenceWorkerId: authorization.competenceWorkerId,
            competenceTypeId: authorization.competenceTypeId,
            authorizationId: authorization.id,
            alertType: CompetenceAlertType.MISSING_DOCUMENT,
            // minor fix: authorizationId is not part of the @@unique, so it
            // is folded into the cycleKey — a renewal granted the same
            // month as the old undocumented authorization still alerts.
            cycleKey: `${authorization.id}:${cycleKeySuffix}`,
            ...content,
          };
        },
      });
    }

    return sent;
  },

  /** Polling target for CompetenceUrgentAlert (suspend/revoke only, COMPETENCE_URGENT channel). */
  async listUnreadUrgentAlerts(input: { plantId: string; plantCode: string; userId: string; limit?: number }): Promise<CompetenceUrgentFloatingAlert[]> {
    const rows = await prisma.competenceAlertDelivery.findMany({
      where: {
        userId: input.userId,
        plantId: input.plantId,
        channel: ActionAlertChannel.SOFTWARE,
        alertType: { in: [CompetenceAlertType.AUTHORIZATION_SUSPENDED, CompetenceAlertType.AUTHORIZATION_REVOKED] },
        // minor fix: this delivery log also carries COMPETENCE_ALERT-channel
        // rows (item 15's per-channel query) — without filtering the
        // notification's own channel, a coincidental unread COMPETENCE_ALERT
        // notification could surface here even though it never went through
        // COMPETENCE_URGENT (action-alert-service.ts:412-413 does the same).
        notification: { channel: COMPETENCE_URGENT_CHANNEL, status: "UNREAD" },
      },
      include: { notification: true },
      orderBy: { sentAt: "desc" },
      take: input.limit ?? 10,
    });

    return rows.flatMap((row): CompetenceUrgentFloatingAlert[] => {
      if (!row.notification) return [];
      return [{
        id: row.notification.id,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt.toISOString(),
        actionUrl: `/app/${input.plantCode}/competences/${row.competenceWorkerId}`,
      }];
    });
  },
};
