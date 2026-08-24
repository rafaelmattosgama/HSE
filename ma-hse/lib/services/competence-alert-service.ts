import { ActionAlertChannel, AuthorizationStatus, CompetenceAlertType, CompetenceCellState, RoleCode } from "@prisma/client";
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
}) {
  let created = 0;

  for (const recipient of input.recipients) {
    try {
      const ctx = input.build(recipient);
      if (await createSoftwareAlert(ctx, recipient, input.notificationChannel)) created += 1;
      if (await sendEmailAlert(ctx, recipient)) created += 1;
    } catch (error) {
      logger.error({ error, userId: recipient.id }, "failed_to_dispatch_competence_alert");
    }
  }

  return created;
}

async function loadWorkerTypeContext(plantId: string, competenceWorkerId: string, competenceTypeId: string) {
  const [worker, competenceType, plant] = await Promise.all([
    prisma.competenceWorker.findUnique({ where: { id: competenceWorkerId }, include: { employee: true } }),
    prisma.competenceType.findUnique({ where: { id: competenceTypeId } }),
    prisma.plant.findUnique({ where: { id: plantId } }),
  ]);
  if (!worker || !competenceType || !plant) return null;
  return { worker, competenceType, plant };
}

function pickExpiryAlertType(daysToExpiry: number): CompetenceAlertType | null {
  if (daysToExpiry < 0) return null;
  if (daysToExpiry === 0) return CompetenceAlertType.EXPIRY_DAY;
  if (daysToExpiry <= 7) return CompetenceAlertType.EXPIRING_7;
  if (daysToExpiry <= 30) return CompetenceAlertType.EXPIRING_30;
  if (daysToExpiry <= 60) return CompetenceAlertType.EXPIRING_60;
  if (daysToExpiry <= 90) return CompetenceAlertType.EXPIRING_90;
  return null;
}

export const CompetenceAlertService = {
  /**
   * §7.2, immediate: department responsible, N3_SAFETY, and the worker's own
   * account if EmployeeDirectory is linked to a User. cycleKey = authorizationId
   * (§7.3) — a renewal creates a new authorization, so the next suspension can
   * always alert again.
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
          cycleKey: authorization.id,
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
   * see the same gap).
   */
  async runDailyAlerts(
    plantId: string,
    computedStates: Array<{ competenceWorkerId: string; competenceTypeId: string; computed: ComputedCompetenceCellState }>,
    referenceDate = new Date(),
  ) {
    const zonedNow = toZonedTime(referenceDate, ACTION_ALERT_TIMEZONE);
    const isWeeklyAssessmentDay = zonedNow.getDay() === 1;
    let sent = 0;

    for (const row of computedStates) {
      const { computed } = row;
      if (computed.currentAuthorizationId && typeof computed.daysToExpiry === "number") {
        const alertType = pickExpiryAlertType(computed.daysToExpiry);
        if (alertType) {
          sent += await this.dispatchExpiryAlert({
            plantId,
            competenceWorkerId: row.competenceWorkerId,
            competenceTypeId: row.competenceTypeId,
            authorizationId: computed.currentAuthorizationId,
            alertType,
            daysToExpiry: computed.daysToExpiry,
            validUntil: computed.validUntil,
          });
        }
      }

      if (isWeeklyAssessmentDay && computed.state === CompetenceCellState.AWAITING_ASSESSMENT) {
        sent += await this.dispatchAwaitingAssessment(plantId, row.competenceWorkerId, row.competenceTypeId, referenceDate);
      }
    }

    sent += await this.dispatchMissingDocuments(plantId, referenceDate);

    return sent;
  },

  /** §7.2: department responsible + N3_SAFETY (+ N2_PLANT_MANAGER for EXPIRY_DAY only). cycleKey = authorizationId. */
  async dispatchExpiryAlert(input: {
    plantId: string;
    competenceWorkerId: string;
    competenceTypeId: string;
    authorizationId: string;
    alertType: CompetenceAlertType;
    daysToExpiry: number;
    validUntil: Date | null;
  }) {
    const context = await loadWorkerTypeContext(input.plantId, input.competenceWorkerId, input.competenceTypeId);
    if (!context) return 0;

    const [departmentRecipients, n3Recipients, n2Recipients] = await Promise.all([
      resolveDepartmentRecipients(input.plantId, context.worker.areaId),
      resolveN3Recipients(input.plantId),
      input.alertType === CompetenceAlertType.EXPIRY_DAY ? resolveN2Recipients(input.plantId) : Promise.resolve([]),
    ]);
    const recipients = mergeRecipients(departmentRecipients, n3Recipients, n2Recipients);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: COMPETENCE_ALERT_CHANNEL,
      build: (recipient) => {
        const content = buildAlertContent({
          alertType: input.alertType,
          locale: normalizeMasterDataLocale(recipient.language),
          competenceTypeName: context.competenceType.name,
          workerName: context.worker.employee.name,
          validUntil: input.validUntil,
          daysToExpiry: input.daysToExpiry,
          plantCode: context.plant.code,
          competenceWorkerId: input.competenceWorkerId,
        });
        return {
          plantId: input.plantId,
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

  /** §7.2: department responsible only, weekly summary. cycleKey = "YYYY-MM". */
  async dispatchAwaitingAssessment(plantId: string, competenceWorkerId: string, competenceTypeId: string, referenceDate = new Date()) {
    const context = await loadWorkerTypeContext(plantId, competenceWorkerId, competenceTypeId);
    if (!context) return 0;

    const recipients = await resolveDepartmentRecipients(plantId, context.worker.areaId);
    if (recipients.length === 0) return 0;

    return dispatchToRecipients({
      recipients,
      notificationChannel: COMPETENCE_ALERT_CHANNEL,
      build: (recipient) => {
        const content = buildAlertContent({
          alertType: CompetenceAlertType.AWAITING_ASSESSMENT,
          locale: normalizeMasterDataLocale(recipient.language),
          competenceTypeName: context.competenceType.name,
          workerName: context.worker.employee.name,
          plantCode: context.plant.code,
          competenceWorkerId,
        });
        return {
          plantId,
          plantName: context.plant.name,
          competenceWorkerId,
          competenceTypeId,
          authorizationId: null,
          alertType: CompetenceAlertType.AWAITING_ASSESSMENT,
          cycleKey: monthlyCycleKey(referenceDate),
          ...content,
        };
      },
    });
  },

  /**
   * §7.2: N3_SAFETY only. An ACTIVE authorization with no signed PDF
   * (documentFileKey) is a gap independent of the authorization's own
   * validity window, so cycleKey = "YYYY-MM" rather than authorizationId —
   * it recurs monthly until someone uploads the document.
   */
  async dispatchMissingDocuments(plantId: string, referenceDate = new Date()) {
    const authorizations = await prisma.workerAuthorization.findMany({
      where: { plantId, status: AuthorizationStatus.ACTIVE, documentFileKey: null },
      select: { id: true, competenceWorkerId: true, competenceTypeId: true },
    });
    if (authorizations.length === 0) return 0;

    const n3Recipients = await resolveN3Recipients(plantId);
    if (n3Recipients.length === 0) return 0;
    const cycleKey = monthlyCycleKey(referenceDate);

    let sent = 0;
    for (const authorization of authorizations) {
      const context = await loadWorkerTypeContext(plantId, authorization.competenceWorkerId, authorization.competenceTypeId);
      if (!context) continue;

      sent += await dispatchToRecipients({
        recipients: n3Recipients,
        notificationChannel: COMPETENCE_ALERT_CHANNEL,
        build: (recipient) => {
          const content = buildAlertContent({
            alertType: CompetenceAlertType.MISSING_DOCUMENT,
            locale: normalizeMasterDataLocale(recipient.language),
            competenceTypeName: context.competenceType.name,
            workerName: context.worker.employee.name,
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
            cycleKey,
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
        notification: { status: "UNREAD" },
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
