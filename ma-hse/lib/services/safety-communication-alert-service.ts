import { randomUUID } from "node:crypto";
import {
  CommunicationType,
  CommunicationStatus,
  MasterDataEntityType,
  NotificationStatus,
  Prisma,
  RoleCode,
  SafetyCommunicationAlertType,
  SafetyCommunicationNotificationDeliveryStatus,
  SafetyCommunicationNotificationType,
} from "@prisma/client";
import { getFixedCommunicationLabels } from "@/lib/communication-labels";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/routing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  localizeMasterDataRows,
  normalizeMasterDataLocale,
} from "@/lib/services/master-data-translation-service";
import {
  getSifPsifDisplayLabel,
  getSifPsifResultFromTemplateData,
} from "@/lib/services/sewo-validation-service";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

export const SAFETY_COMMUNICATION_APPROVED_CHANNEL = "SAFETY_COMMUNICATION_APPROVED";
export const SAFETY_COMMUNICATION_N3_CHANNEL = "SAFETY_COMMUNICATION_N3_ALERT";

export class SafetyCommunicationAlertRecipientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SafetyCommunicationAlertRecipientError";
  }
}

export type SafetyCommunicationAlertRecipientRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyCommunicationAlertRecipientUserOption = {
  id: string;
  name: string;
  email: string | null;
};

export type SafetyCommunicationAlertRecipientDepartmentOption = {
  id: string;
  code: string;
  name: string;
};

export type SafetyCommunicationFloatingAlert = {
  id: string;
  communicationId: string;
  title: string;
  body: string;
  createdAt: string;
  actionUrl: string;
};

const SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE =
  "Safety communication alerts are temporarily unavailable because Prisma Client is outdated. Run `npm run db:generate` and restart or redeploy the application.";

type SafetyCommunicationAlertRecipientDelegate = {
  findMany: typeof prisma.safetyCommunicationAlertRecipient.findMany;
  findUnique: typeof prisma.safetyCommunicationAlertRecipient.findUnique;
  upsert: typeof prisma.safetyCommunicationAlertRecipient.upsert;
  updateMany: typeof prisma.safetyCommunicationAlertRecipient.updateMany;
};

type SafetyCommunicationNotificationDelegate = {
  findMany: typeof prisma.safetyCommunicationNotification.findMany;
  upsert: typeof prisma.safetyCommunicationNotification.upsert;
  update: typeof prisma.safetyCommunicationNotification.update;
};

type RawSafetyCommunicationAlertRecipientRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RawSafetyCommunicationAlertRecipientState = {
  id: string;
  isActive: boolean;
};

function getSafetyCommunicationRuntimeClient() {
  return prisma as typeof prisma & {
    safetyCommunicationAlertRecipient?: SafetyCommunicationAlertRecipientDelegate;
    safetyCommunicationNotification?: SafetyCommunicationNotificationDelegate;
  };
}

function logMissingSafetyCommunicationDelegate(
  delegate: "safetyCommunicationAlertRecipient" | "safetyCommunicationNotification",
  context: string,
) {
  logger.error(
    {
      delegate,
      context,
    },
    "safety_communication_prisma_delegate_unavailable",
  );
}

function hasSafetyCommunicationAlertRecipientDelegate() {
  return Boolean(getSafetyCommunicationRuntimeClient().safetyCommunicationAlertRecipient);
}

function isMissingDatabaseObjectError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022");
}

function logMissingSafetyCommunicationDatabaseObject(error: unknown, context: string) {
  logger.error(
    {
      context,
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    },
    "safety_communication_database_object_unavailable",
  );
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRawRecipientRow(row: RawSafetyCommunicationAlertRecipientRow): SafetyCommunicationAlertRecipientRow {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    departmentId: row.departmentId,
    departmentCode: row.departmentCode,
    departmentName: row.departmentName,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function listRecipientsWithRawSql(plantId: string) {
  const rows = await prisma.$queryRaw<RawSafetyCommunicationAlertRecipientRow[]>`
    SELECT
      recipient.id,
      recipient."userId",
      "user".name AS "userName",
      "user".email AS "userEmail",
      recipient."departmentId",
      department.code AS "departmentCode",
      department.name AS "departmentName",
      recipient."createdAt",
      recipient."updatedAt"
    FROM "SafetyCommunicationAlertRecipient" recipient
    INNER JOIN "User" "user" ON "user".id = recipient."userId"
    INNER JOIN "Area" department ON department.id = recipient."departmentId"
    WHERE recipient."plantId" = ${plantId}
      AND recipient."isActive" = true
      AND "user"."isActive" = true
      AND EXISTS (
        SELECT 1
        FROM "UserPlantRole" user_plant_role
        INNER JOIN "Role" role ON role.id = user_plant_role."roleId"
        WHERE user_plant_role."userId" = "user".id
          AND user_plant_role."plantId" = ${plantId}
          AND role.code = ${RoleCode.N4_SUPERVISOR}::"RoleCode"
      )
    ORDER BY department.name ASC, "user".name ASC, COALESCE("user".email, '') ASC
  `;

  return rows.map(mapRawRecipientRow);
}

async function findRecipientStateWithRawSql(input: {
  plantId: string;
  userId: string;
  departmentId: string;
}) {
  const rows = await prisma.$queryRaw<RawSafetyCommunicationAlertRecipientState[]>`
    SELECT id, "isActive"
    FROM "SafetyCommunicationAlertRecipient"
    WHERE "plantId" = ${input.plantId}
      AND "userId" = ${input.userId}
      AND "departmentId" = ${input.departmentId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function findRecipientRowWithRawSql(input: {
  plantId: string;
  userId: string;
  departmentId: string;
}) {
  const rows = await prisma.$queryRaw<RawSafetyCommunicationAlertRecipientRow[]>`
    SELECT
      recipient.id,
      recipient."userId",
      "user".name AS "userName",
      "user".email AS "userEmail",
      recipient."departmentId",
      department.code AS "departmentCode",
      department.name AS "departmentName",
      recipient."createdAt",
      recipient."updatedAt"
    FROM "SafetyCommunicationAlertRecipient" recipient
    INNER JOIN "User" "user" ON "user".id = recipient."userId"
    INNER JOIN "Area" department ON department.id = recipient."departmentId"
    WHERE recipient."plantId" = ${input.plantId}
      AND recipient."userId" = ${input.userId}
      AND recipient."departmentId" = ${input.departmentId}
    LIMIT 1
  `;

  return rows[0] ? mapRawRecipientRow(rows[0]) : null;
}

async function addRecipientWithRawSql(input: {
  plantId: string;
  userId: string;
  departmentId: string;
  actorUserId: string;
}) {
  const [department, supervisor] = await prisma.$transaction([
    prisma.area.findFirst({
      where: {
        id: input.departmentId,
        plantId: input.plantId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
    prisma.userPlantRole.findFirst({
      where: {
        userId: input.userId,
        plantId: input.plantId,
        role: {
          code: RoleCode.N4_SUPERVISOR,
        },
        user: {
          isActive: true,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!department) {
    throw new SafetyCommunicationAlertRecipientError(
      "DEPARTMENT_NOT_FOUND",
      "Department not found for this plant.",
      404,
    );
  }

  if (!supervisor) {
    throw new SafetyCommunicationAlertRecipientError(
      "SUPERVISOR_NOT_FOUND",
      "Supervisor not found for this plant.",
      404,
    );
  }

  const existingRecipient = await findRecipientStateWithRawSql(input);
  if (existingRecipient?.isActive) {
    throw new SafetyCommunicationAlertRecipientError(
      "DUPLICATE_RECIPIENT",
      "This supervisor is already assigned to the selected department.",
      409,
    );
  }

  await prisma.$executeRaw`
    INSERT INTO "SafetyCommunicationAlertRecipient" (
      id,
      "plantId",
      "userId",
      "departmentId",
      "isActive",
      "createdBy",
      "createdAt",
      "updatedBy",
      "updatedAt"
    )
    VALUES (
      ${existingRecipient?.id ?? randomUUID()},
      ${input.plantId},
      ${input.userId},
      ${input.departmentId},
      true,
      ${input.actorUserId},
      NOW(),
      ${input.actorUserId},
      NOW()
    )
    ON CONFLICT ("plantId", "userId", "departmentId")
    DO UPDATE SET
      "isActive" = true,
      "updatedBy" = ${input.actorUserId},
      "updatedAt" = NOW()
  `;

  const recipient = await findRecipientRowWithRawSql(input);
  if (!recipient) {
    throw new SafetyCommunicationAlertRecipientError(
      "RECIPIENT_NOT_FOUND",
      "Alert recipient not found.",
      404,
    );
  }

  return recipient;
}

async function removeRecipientWithRawSql(input: {
  id: string;
  plantId: string;
  actorUserId: string;
}) {
  const updatedCount = await prisma.$executeRaw`
    UPDATE "SafetyCommunicationAlertRecipient"
    SET
      "isActive" = false,
      "updatedBy" = ${input.actorUserId},
      "updatedAt" = NOW()
    WHERE id = ${input.id}
      AND "plantId" = ${input.plantId}
      AND "isActive" = true
  `;

  return updatedCount > 0;
}

function getSafetyCommunicationAlertRecipientDelegate(): SafetyCommunicationAlertRecipientDelegate;
function getSafetyCommunicationAlertRecipientDelegate(options: {
  allowMissing: true;
  context?: string;
}): SafetyCommunicationAlertRecipientDelegate | null;
function getSafetyCommunicationAlertRecipientDelegate(options?: {
  allowMissing?: boolean;
  context?: string;
}): SafetyCommunicationAlertRecipientDelegate | null {
  const delegate = getSafetyCommunicationRuntimeClient().safetyCommunicationAlertRecipient;
  if (!delegate) {
    if (options?.allowMissing) {
      logMissingSafetyCommunicationDelegate(
        "safetyCommunicationAlertRecipient",
        options.context ?? "unknown",
      );
      return null;
    }

    throw new SafetyCommunicationAlertRecipientError(
      "PRISMA_CLIENT_OUTDATED",
      SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE,
      503,
    );
  }

  return delegate;
}

function getSafetyCommunicationNotificationDelegate(): SafetyCommunicationNotificationDelegate;
function getSafetyCommunicationNotificationDelegate(options: {
  allowMissing: true;
  context?: string;
}): SafetyCommunicationNotificationDelegate | null;
function getSafetyCommunicationNotificationDelegate(options?: {
  allowMissing?: boolean;
  context?: string;
}): SafetyCommunicationNotificationDelegate | null {
  const delegate = getSafetyCommunicationRuntimeClient().safetyCommunicationNotification;
  if (!delegate) {
    if (options?.allowMissing) {
      logMissingSafetyCommunicationDelegate(
        "safetyCommunicationNotification",
        options.context ?? "unknown",
      );
      return null;
    }

    throw new SafetyCommunicationAlertRecipientError(
      "PRISMA_CLIENT_OUTDATED",
      SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE,
      503,
    );
  }

  return delegate;
}

function formatDate(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

function normalizeDepartmentValue(value: string) {
  return value.trim().toLowerCase();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCommunicationDetailPaths(input: {
  plantCode: string;
  communicationId: string;
}) {
  const relativePath = `/app/${input.plantCode}/communications/${input.communicationId}`;
  return {
    relativePath,
    absoluteUrl: new URL(relativePath, env.APP_URL).toString(),
  };
}

function buildApprovedAlertContent(input: {
  plantCode: string;
  communicationId: string;
  typeLabel: string;
  workstation: string;
  occurredAt: Date;
  workerName: string;
  sifPsifLabel: string;
  description: string;
  locale: AppLocale;
}) {
  const copy = safetyAlertCopy[input.locale];
  const { relativePath, absoluteUrl } = buildCommunicationDetailPaths({
    plantCode: input.plantCode,
    communicationId: input.communicationId,
  });
  const title = `${copy.safetyCommunication} - ${input.typeLabel}`;
  const escapedTitle = escapeHtml(title);
  const escapedTypeLabel = escapeHtml(input.typeLabel);
  const escapedWorkstation = escapeHtml(input.workstation);
  const escapedWorkerName = escapeHtml(input.workerName);
  const escapedSifPsifLabel = escapeHtml(input.sifPsifLabel);
  const escapedDescription = escapeHtml(input.description);
  const lines = [
    copy.approved,
    `${copy.occurrenceType}: ${input.typeLabel}`,
    `${copy.workstation}: ${input.workstation}`,
    `${copy.date}: ${formatDate(input.occurredAt)}`,
    `${copy.worker}: ${input.workerName}`,
    `SIF/PSIF: ${input.sifPsifLabel}`,
    `${copy.description}: ${input.description}`,
  ];
  const body = lines.join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#002663;">${escapedTitle}</h2>
      <p>${escapeHtml(copy.approved)}</p>
      <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:640px;">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.occurrenceType)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedTypeLabel}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.workstation)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedWorkstation}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.date)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${formatDate(input.occurredAt)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.worker)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedWorkerName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">SIF / PSIF</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedSifPsifLabel}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.description)}</td><td style="padding:8px;border:1px solid #e2e8f0;white-space:pre-line;">${escapedDescription}</td></tr>
      </table>
      <p style="margin-top:16px;">
        <a href="${escapeHtml(absoluteUrl)}" style="display:inline-block;border-radius:8px;background:#0f766e;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">${escapeHtml(copy.openCommunication)}</a>
      </p>
    </div>
  `;

  return {
    title,
    body,
    html,
    actionUrl: relativePath,
    absoluteUrl,
  };
}

const safetyAlertCopy: Record<AppLocale, {
  safetyCommunication: string;
  approved: string;
  occurrenceType: string;
  communicationType: string;
  workstation: string;
  location: string;
  date: string;
  worker: string;
  description: string;
  reporter: string;
  involvedPerson: string;
  openCommunication: string;
  n3Alert: string;
  newCommunication: string;
}> = {
  en: { safetyCommunication: "Safety Communication", approved: "The communication was approved by level N3.", occurrenceType: "Occurrence type", communicationType: "Communication type", workstation: "Workstation", location: "Location", date: "Date", worker: "Worker involved", description: "Description", reporter: "Reporter", involvedPerson: "Person involved", openCommunication: "Open communication", n3Alert: "N3 alert", newCommunication: "New communication registered" },
  pt: { safetyCommunication: "Comunicação de Segurança", approved: "A comunicação foi aprovada pelo nível N3.", occurrenceType: "Tipo de ocorrência", communicationType: "Tipo de comunicação", workstation: "Posto de trabalho", location: "Local", date: "Data", worker: "Trabalhador envolvido", description: "Descrição", reporter: "Autor da comunicação", involvedPerson: "Pessoa envolvida", openCommunication: "Abrir comunicação", n3Alert: "Alerta N3", newCommunication: "Nova comunicação registada" },
  it: { safetyCommunication: "Comunicazione di sicurezza", approved: "La comunicazione è stata approvata dal livello N3.", occurrenceType: "Tipo di evento", communicationType: "Tipo di comunicazione", workstation: "Postazione di lavoro", location: "Luogo", date: "Data", worker: "Lavoratore coinvolto", description: "Descrizione", reporter: "Segnalatore", involvedPerson: "Persona coinvolta", openCommunication: "Apri comunicazione", n3Alert: "Avviso N3", newCommunication: "Nuova comunicazione registrata" },
  pl: { safetyCommunication: "Zgłoszenie bezpieczeństwa", approved: "Zgłoszenie zostało zatwierdzone przez poziom N3.", occurrenceType: "Typ zdarzenia", communicationType: "Typ zgłoszenia", workstation: "Stanowisko pracy", location: "Lokalizacja", date: "Data", worker: "Zaangażowany pracownik", description: "Opis", reporter: "Zgłaszający", involvedPerson: "Osoba zaangażowana", openCommunication: "Otwórz zgłoszenie", n3Alert: "Alert N3", newCommunication: "Zarejestrowano nowe zgłoszenie" },
  de: { safetyCommunication: "Sicherheitsmeldung", approved: "Die Meldung wurde von Ebene N3 genehmigt.", occurrenceType: "Ereignistyp", communicationType: "Meldungstyp", workstation: "Arbeitsplatz", location: "Ort", date: "Datum", worker: "Betroffener Mitarbeiter", description: "Beschreibung", reporter: "Meldende Person", involvedPerson: "Beteiligte Person", openCommunication: "Meldung öffnen", n3Alert: "N3-Warnung", newCommunication: "Neue Meldung erfasst" },
  ro: { safetyCommunication: "Comunicare de siguranță", approved: "Comunicarea a fost aprobată de nivelul N3.", occurrenceType: "Tipul evenimentului", communicationType: "Tipul comunicării", workstation: "Post de lucru", location: "Locație", date: "Data", worker: "Lucrător implicat", description: "Descriere", reporter: "Raportor", involvedPerson: "Persoană implicată", openCommunication: "Deschide comunicarea", n3Alert: "Alertă N3", newCommunication: "Comunicare nouă înregistrată" },
  fr: { safetyCommunication: "Communication de sécurité", approved: "La communication a été approuvée par le niveau N3.", occurrenceType: "Type d'événement", communicationType: "Type de communication", workstation: "Poste de travail", location: "Lieu", date: "Date", worker: "Travailleur concerné", description: "Description", reporter: "Déclarant", involvedPerson: "Personne concernée", openCommunication: "Ouvrir la communication", n3Alert: "Alerte N3", newCommunication: "Nouvelle communication enregistrée" },
};

function formatCommunicationTypeLabel(type: CommunicationType, locale: AppLocale) {
  return getFixedCommunicationLabels(locale).communicationTypeLabels[type] ?? type;
}

function getN3SoftwareAlertType(type: CommunicationType) {
  if (type === CommunicationType.NEAR_MISS) {
    return SafetyCommunicationAlertType.N3_NEAR_MISS_SOFTWARE_ALERT;
  }

  if (type === CommunicationType.FIRST_AID) {
    return SafetyCommunicationAlertType.N3_FIRST_AID_SOFTWARE_ALERT;
  }

  return null;
}

function joinLocationParts(parts: Array<string | null | undefined>) {
  const location = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" / ");

  return location || "-";
}

type LocalizableAlertMasterData = {
  id: string;
  name: string;
  sourceLanguage?: string | null;
};

async function getLocalizedCommunicationLocation(input: {
  locale: AppLocale;
  area?: LocalizableAlertMasterData | null;
  lineName?: string | null;
  workstation?: LocalizableAlertMasterData | null;
  equipment?: LocalizableAlertMasterData | null;
}) {
  const [areas, workstations, equipment] = await Promise.all([
    localizeMasterDataRows(MasterDataEntityType.AREA, input.area ? [input.area] : [], input.locale),
    localizeMasterDataRows(
      MasterDataEntityType.WORKSTATION,
      input.workstation ? [input.workstation] : [],
      input.locale,
    ),
    localizeMasterDataRows(
      MasterDataEntityType.EQUIPMENT,
      input.equipment ? [input.equipment] : [],
      input.locale,
    ),
  ]);

  return joinLocationParts([
    areas[0]?.name,
    input.lineName,
    workstations[0]?.name,
    equipment[0]?.name,
  ]);
}

function buildN3CommunicationAlertContent(input: {
  plantCode: string;
  communicationId: string;
  communicationType: CommunicationType;
  location: string;
  occurredAt: Date;
  description: string;
  reporterName: string;
  involvedPerson: string;
  locale: AppLocale;
}) {
  const copy = safetyAlertCopy[input.locale];
  const typeLabel = formatCommunicationTypeLabel(input.communicationType, input.locale);
  const { relativePath, absoluteUrl } = buildCommunicationDetailPaths({
    plantCode: input.plantCode,
    communicationId: input.communicationId,
  });
  const lines = [
    `${copy.communicationType}: ${typeLabel}`,
    `${copy.location}: ${input.location}`,
    `${copy.date}: ${formatDate(input.occurredAt)}`,
    `${copy.description}: ${input.description.trim() || "-"}`,
    `${copy.reporter}: ${input.reporterName.trim() || "-"}`,
    `${copy.involvedPerson}: ${input.involvedPerson.trim() || "-"}`,
  ];

  return {
    title: `${copy.n3Alert} - ${typeLabel}`,
    emailTitle: `${copy.newCommunication} - ${typeLabel}`,
    body: lines.join("\n"),
    actionUrl: relativePath,
    absoluteUrl,
  };
}

async function resolveDepartmentByWorkerDept(input: {
  plantId: string;
  workerDept: string;
}) {
  const workerDept = input.workerDept.trim();
  if (!workerDept) {
    return null;
  }

  const normalized = normalizeDepartmentValue(workerDept);
  const departments = await prisma.area.findMany({
    where: {
      plantId: input.plantId,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  return departments.find((department) => {
    return normalizeDepartmentValue(department.code) === normalized
      || normalizeDepartmentValue(department.name) === normalized;
  }) ?? null;
}

/**
 * §7.2 of docs/modulo-competencias-autorizacoes.md: the department's
 * responsible users (N4_SUPERVISOR mapped to an Area via
 * SafetyCommunicationAlertRecipient), extracted so competence-alert-service.ts
 * can reuse the same resolution without a new recipients table or admin
 * screen. dispatchApprovedCommunicationAlerts below now calls this instead
 * of inlining the query — same where/include/orderBy, behavior unchanged.
 */
export async function resolveDepartmentAlertRecipients(input: { plantId: string; departmentId: string }) {
  const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
    allowMissing: true,
    context: "resolveDepartmentAlertRecipients",
  });
  if (!recipientModel) return [];

  return recipientModel.findMany({
    where: {
      plantId: input.plantId,
      departmentId: input.departmentId,
      isActive: true,
      user: {
        isActive: true,
        plantRoles: {
          some: {
            plantId: input.plantId,
            role: { code: RoleCode.N4_SUPERVISOR },
          },
        },
      },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, language: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });
}

async function loadApprovedCommunicationContext(communicationId: string) {
  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      plant: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      workstation: {
        select: {
          id: true,
          name: true,
          sourceLanguage: true,
        },
      },
      targetEmployee: {
        select: {
          id: true,
          name: true,
          employeeNo: true,
          dept: true,
        },
      },
      sewoRecords: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          templateData: true,
        },
      },
    },
  });

  if (!communication) {
    return null;
  }

  let targetEmployee = communication.targetEmployee;
  if (!targetEmployee && communication.targetEmployeeNo) {
    targetEmployee = await prisma.employeeDirectory.findUnique({
      where: {
        plantId_employeeNo: {
          plantId: communication.plantId,
          employeeNo: communication.targetEmployeeNo,
        },
      },
      select: {
        id: true,
        name: true,
        employeeNo: true,
        dept: true,
      },
    });
  }

  return {
    communication,
    targetEmployee,
    sewo: communication.sewoRecords[0] ?? null,
  };
}

async function loadCreatedCommunicationContext(communicationId: string) {
  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      plant: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      area: {
        select: {
          id: true,
          name: true,
          sourceLanguage: true,
        },
      },
      line: {
        select: {
          name: true,
        },
      },
      workstation: {
        select: {
          id: true,
          name: true,
          sourceLanguage: true,
        },
      },
      equipment: {
        select: {
          id: true,
          name: true,
          sourceLanguage: true,
        },
      },
      targetEmployee: {
        select: {
          name: true,
          employeeNo: true,
        },
      },
    },
  });

  if (!communication) {
    return null;
  }

  let targetEmployee = communication.targetEmployee;
  if (!targetEmployee && communication.targetEmployeeNo) {
    targetEmployee = await prisma.employeeDirectory.findUnique({
      where: {
        plantId_employeeNo: {
          plantId: communication.plantId,
          employeeNo: communication.targetEmployeeNo,
        },
      },
      select: {
        name: true,
        employeeNo: true,
      },
    });
  }

  return {
    communication,
    targetEmployee,
  };
}

async function sendEmailNotification(input: {
  plantId: string;
  plantName?: string;
  communicationId: string;
  recipientUserId: string;
  recipientEmail: string | null;
  recipientName?: string | null;
  recipientLanguage?: string | null;
  departmentId?: string | null;
  alertType: SafetyCommunicationAlertType;
  title: string;
  body: string;
  actionUrl?: string;
}) {
  const notificationModel = getSafetyCommunicationNotificationDelegate();
  const notification = await notificationModel.upsert({
    where: {
      communicationId_recipientUserId_alertType_notificationType: {
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
        alertType: input.alertType,
        notificationType: SafetyCommunicationNotificationType.EMAIL,
      },
    },
    create: {
      plantId: input.plantId,
      communicationId: input.communicationId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId ?? null,
      alertType: input.alertType,
      notificationType: SafetyCommunicationNotificationType.EMAIL,
      status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
    },
    update: {
      plantId: input.plantId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId ?? null,
      errorMessage: null,
    },
  });

  if (
    notification.status === SafetyCommunicationNotificationDeliveryStatus.SENT
    || notification.status === SafetyCommunicationNotificationDeliveryStatus.READ
  ) {
    return;
  }

  if (!input.recipientEmail?.trim()) {
    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: "Recipient user does not have an email configured.",
      },
    });
    return;
  }

  try {
    await sendNotificationEmail({
      user: {
        email: input.recipientEmail,
        name: input.recipientName ?? undefined,
        language: input.recipientLanguage ?? undefined,
      },
      tituloNotificacao: input.title,
      mensagem: input.body,
      dataHora: new Date(),
      plantName: input.plantName ?? input.plantId,
      actionUrl: input.actionUrl,
    });

    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown email delivery error",
      },
    });
    logger.error(
      {
        error,
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
      },
      "failed_to_send_safety_communication_email",
    );
  }
}

async function sendFloatingAlertNotification(input: {
  plantId: string;
  communicationId: string;
  recipientUserId: string;
  recipientEmail: string | null;
  departmentId?: string | null;
  alertType: SafetyCommunicationAlertType;
  title: string;
  body: string;
  channel?: string;
}) {
  const notificationModel = getSafetyCommunicationNotificationDelegate();
  const notificationLog = await notificationModel.upsert({
    where: {
      communicationId_recipientUserId_alertType_notificationType: {
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
        alertType: input.alertType,
        notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
      },
    },
    create: {
      plantId: input.plantId,
      communicationId: input.communicationId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId ?? null,
      alertType: input.alertType,
      notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
      status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
    },
    update: {
      plantId: input.plantId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId ?? null,
      errorMessage: null,
    },
  });

  if (
    notificationLog.status === SafetyCommunicationNotificationDeliveryStatus.SENT
    || notificationLog.status === SafetyCommunicationNotificationDeliveryStatus.READ
  ) {
    return;
  }

  if (notificationLog.notificationId) {
    const existingNotification = await prisma.notification.findUnique({
      where: {
        id: notificationLog.notificationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingNotification?.status === NotificationStatus.UNREAD) {
      await notificationModel.update({
        where: { id: notificationLog.id },
        data: {
          status: SafetyCommunicationNotificationDeliveryStatus.SENT,
          sentAt: notificationLog.sentAt ?? new Date(),
          errorMessage: null,
        },
      });
      return;
    }
  }

  try {
    const dashboardNotification = await prisma.notification.create({
      data: {
        userId: input.recipientUserId,
        plantId: input.plantId,
        title: input.title,
        body: input.body,
        channel: input.channel ?? SAFETY_COMMUNICATION_APPROVED_CHANNEL,
        status: NotificationStatus.UNREAD,
      },
    });

    await notificationModel.update({
      where: { id: notificationLog.id },
      data: {
        notificationId: dashboardNotification.id,
        status: SafetyCommunicationNotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await notificationModel.update({
      where: { id: notificationLog.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown floating alert error",
      },
    });
    logger.error(
      {
        error,
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
      },
      "failed_to_create_safety_communication_floating_alert",
    );
  }
}

export const SafetyCommunicationAlertService = {
  isRecipientManagementAvailable() {
    return hasSafetyCommunicationAlertRecipientDelegate();
  },

  async listRecipients(plantId: string) {
    try {
      const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
        allowMissing: true,
        context: "listRecipients",
      });
      if (!recipientModel) {
        return await listRecipientsWithRawSql(plantId);
      }

      const rows = await recipientModel.findMany({
        where: {
          plantId,
          isActive: true,
          user: {
            isActive: true,
            plantRoles: {
              some: {
                plantId,
                role: {
                  code: RoleCode.N4_SUPERVISOR,
                },
              },
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          department: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [
          { department: { name: "asc" } },
          { user: { name: "asc" } },
        ],
      });

      return rows.map((row): SafetyCommunicationAlertRecipientRow => ({
        id: row.id,
        userId: row.user.id,
        userName: row.user.name,
        userEmail: row.user.email,
        departmentId: row.department.id,
        departmentCode: row.department.code,
        departmentName: row.department.name,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        logMissingSafetyCommunicationDatabaseObject(error, "listRecipients");
        return [];
      }

      throw error;
    }
  },

  async listRecipientOptions(plantId: string) {
    const [userRows, departments] = await prisma.$transaction([
      prisma.userPlantRole.findMany({
        where: {
          plantId,
          role: {
            code: RoleCode.N4_SUPERVISOR,
          },
          user: {
            isActive: true,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      }),
      prisma.area.findMany({
        where: {
          plantId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: [
          { name: "asc" },
          { code: "asc" },
        ],
      }),
    ]);

    const usersMap = new Map<string, SafetyCommunicationAlertRecipientUserOption>();
    userRows.forEach((row) => {
      usersMap.set(row.user.id, {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
      });
    });

    return {
      users: Array.from(usersMap.values()),
      departments: departments.map((department): SafetyCommunicationAlertRecipientDepartmentOption => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
    };
  },

  async addRecipient(input: {
    plantId: string;
    userId: string;
    departmentId: string;
    actorUserId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
      allowMissing: true,
      context: "addRecipient",
    });
    if (!recipientModel) {
      return addRecipientWithRawSql(input);
    }

    const [department, supervisor, existingRecipient] = await prisma.$transaction([
      prisma.area.findFirst({
        where: {
          id: input.departmentId,
          plantId: input.plantId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      prisma.userPlantRole.findFirst({
        where: {
          userId: input.userId,
          plantId: input.plantId,
          role: {
            code: RoleCode.N4_SUPERVISOR,
          },
          user: {
            isActive: true,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      recipientModel.findUnique({
        where: {
          plantId_userId_departmentId: {
            plantId: input.plantId,
            userId: input.userId,
            departmentId: input.departmentId,
          },
        },
        select: {
          id: true,
          isActive: true,
        },
      }),
    ]);

    if (!department) {
      throw new SafetyCommunicationAlertRecipientError(
        "DEPARTMENT_NOT_FOUND",
        "Department not found for this plant.",
        404,
      );
    }

    if (!supervisor) {
      throw new SafetyCommunicationAlertRecipientError(
        "SUPERVISOR_NOT_FOUND",
        "Supervisor not found for this plant.",
        404,
      );
    }

    if (existingRecipient?.isActive) {
      throw new SafetyCommunicationAlertRecipientError(
        "DUPLICATE_RECIPIENT",
        "This supervisor is already assigned to the selected department.",
        409,
      );
    }

    const row = await recipientModel.upsert({
      where: {
        plantId_userId_departmentId: {
          plantId: input.plantId,
          userId: input.userId,
          departmentId: input.departmentId,
        },
      },
      create: {
        plantId: input.plantId,
        userId: input.userId,
        departmentId: input.departmentId,
        isActive: true,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      update: {
        isActive: true,
        updatedBy: input.actorUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return {
      id: row.id,
      userId: row.user.id,
      userName: row.user.name,
      userEmail: row.user.email,
      departmentId: row.department.id,
      departmentCode: row.department.code,
      departmentName: row.department.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } satisfies SafetyCommunicationAlertRecipientRow;
  },

  async removeRecipient(input: {
    id: string;
    plantId: string;
    actorUserId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
      allowMissing: true,
      context: "removeRecipient",
    });
    if (!recipientModel) {
      return removeRecipientWithRawSql(input);
    }

    const updated = await recipientModel.updateMany({
      where: {
        id: input.id,
        plantId: input.plantId,
        isActive: true,
      },
      data: {
        isActive: false,
        updatedBy: input.actorUserId,
      },
    });

    return updated.count > 0;
  },

  async listUnreadFloatingAlerts(input: {
    plantId: string;
    userId: string;
    channels?: string[];
  }) {
    const notificationModel = getSafetyCommunicationNotificationDelegate({
      allowMissing: true,
      context: "listUnreadFloatingAlerts",
    });
    if (!notificationModel) {
      return [];
    }

    const rows = await notificationModel.findMany({
      where: {
        recipientUserId: input.userId,
        notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
        notification: {
          plantId: input.plantId,
          userId: input.userId,
          channel: {
            in: input.channels?.length
              ? input.channels
              : [SAFETY_COMMUNICATION_APPROVED_CHANNEL, SAFETY_COMMUNICATION_N3_CHANNEL],
          },
          status: NotificationStatus.UNREAD,
        },
      },
      include: {
        notification: true,
        communication: {
          include: {
            plant: {
              select: {
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return rows.flatMap((row): SafetyCommunicationFloatingAlert[] => {
      if (!row.notification) {
        return [];
      }

      return [{
        id: row.notification.id,
        communicationId: row.communicationId,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt.toISOString(),
        actionUrl: buildCommunicationDetailPaths({
          plantCode: row.communication.plant.code,
          communicationId: row.communicationId,
        }).relativePath,
      }];
    });
  },

  async safeDispatchN3CommunicationCreatedAlerts(input: {
    communicationId: string;
  }) {
    try {
      await this.dispatchN3CommunicationCreatedAlerts(input);
    } catch (error) {
      logger.error(
        {
          error,
          communicationId: input.communicationId,
        },
        "failed_to_dispatch_n3_communication_created_alerts",
      );
    }
  },

  async dispatchN3CommunicationCreatedAlerts(input: {
    communicationId: string;
  }) {
    const notificationModel = getSafetyCommunicationNotificationDelegate({
      allowMissing: true,
      context: "dispatchN3CommunicationCreatedAlerts.notifications",
    });
    if (!notificationModel) {
      return;
    }

    const context = await loadCreatedCommunicationContext(input.communicationId);
    if (!context) {
      logger.warn(
        { communicationId: input.communicationId },
        "n3_communication_alert_skipped_communication_not_found",
      );
      return;
    }

    const { communication, targetEmployee } = context;
    const recipients = await prisma.userPlantRole.findMany({
      where: {
        plantId: communication.plantId,
        role: {
          code: RoleCode.N3_SAFETY,
        },
        user: {
          isActive: true,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            language: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    const users = Array.from(
      new Map(recipients.map((entry) => [entry.userId, entry.user])).values(),
    );

    if (!users.length) {
      logger.warn(
        {
          communicationId: communication.id,
          plantId: communication.plantId,
          role: RoleCode.N3_SAFETY,
        },
        "n3_communication_alert_skipped_no_recipients",
      );
      return;
    }

    const involvedPerson = targetEmployee?.name
      ?? communication.targetText
      ?? communication.targetEmployeeNo
      ?? "-";
    const contentByLocale = new Map<AppLocale, Promise<ReturnType<typeof buildN3CommunicationAlertContent>>>();
    const getContent = (locale: AppLocale) => {
      const cached = contentByLocale.get(locale);
      if (cached) return cached;
      const content = getLocalizedCommunicationLocation({
        locale,
        area: communication.area,
        lineName: communication.line?.name,
        workstation: communication.workstation,
        equipment: communication.equipment,
      }).then((location) => buildN3CommunicationAlertContent({
        plantCode: communication.plant.code,
        communicationId: communication.id,
        communicationType: communication.type,
        location,
        occurredAt: communication.eventDatetime,
        description: communication.description,
        reporterName: communication.reporterName,
        involvedPerson,
        locale,
      }));
      contentByLocale.set(locale, content);
      return content;
    };
    const softwareAlertType = getN3SoftwareAlertType(communication.type);

    await Promise.all(
      users.map(async (user) => {
        const content = await getContent(normalizeMasterDataLocale(user.language));
        const deliveries = [
          sendEmailNotification({
            plantId: communication.plantId,
            plantName: communication.plant.name,
            communicationId: communication.id,
            recipientUserId: user.id,
            recipientEmail: user.email,
            recipientName: user.name,
            recipientLanguage: user.language,
            departmentId: null,
            alertType: SafetyCommunicationAlertType.N3_COMMUNICATION_EMAIL_ALERT,
            title: content.emailTitle,
            body: content.body,
            actionUrl: content.absoluteUrl,
          }),
        ];

        if (softwareAlertType) {
          deliveries.push(
            sendFloatingAlertNotification({
              plantId: communication.plantId,
              communicationId: communication.id,
              recipientUserId: user.id,
              recipientEmail: user.email,
              departmentId: null,
              alertType: softwareAlertType,
              title: content.title,
              body: content.body,
              channel: SAFETY_COMMUNICATION_N3_CHANNEL,
            }),
          );
        }

        await Promise.all(deliveries);
      }),
    );

    logger.info(
      {
        communicationId: communication.id,
        plantId: communication.plantId,
        recipients: users.map((user) => user.id),
        softwareAlertType,
      },
      "dispatched_n3_communication_created_alerts",
    );
  },

  async safeDispatchApprovedCommunicationAlerts(input: {
    communicationId: string;
    actorRole?: RoleCode | null;
  }) {
    if (input.actorRole !== RoleCode.N3_SAFETY) {
      return;
    }

    try {
      await this.dispatchApprovedCommunicationAlerts({
        communicationId: input.communicationId,
      });
    } catch (error) {
      logger.error(
        {
          error,
          communicationId: input.communicationId,
          actorRole: input.actorRole,
        },
        "failed_to_dispatch_safety_communication_alerts",
      );
    }
  },

  async dispatchApprovedCommunicationAlerts(input: {
    communicationId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
      allowMissing: true,
      context: "dispatchApprovedCommunicationAlerts.recipients",
    });
    const notificationModel = getSafetyCommunicationNotificationDelegate({
      allowMissing: true,
      context: "dispatchApprovedCommunicationAlerts.notifications",
    });
    if (!recipientModel || !notificationModel) {
      return;
    }

    const context = await loadApprovedCommunicationContext(input.communicationId);
    if (!context) {
      logger.warn(
        { communicationId: input.communicationId },
        "approved_safety_communication_not_found_for_alert_dispatch",
      );
      return;
    }

    const { communication, targetEmployee, sewo } = context;

    if (communication.status !== CommunicationStatus.VALID_OPEN) {
      logger.info(
        {
          communicationId: communication.id,
          status: communication.status,
        },
        "skipping_safety_communication_alert_dispatch_for_non_approved_status",
      );
      return;
    }

    if (!sewo) {
      logger.info(
        { communicationId: communication.id },
        "skipping_safety_communication_alert_dispatch_without_sewo",
      );
      return;
    }

    if (!targetEmployee) {
      logger.warn(
        { communicationId: communication.id },
        "skipping_safety_communication_alert_dispatch_without_target_worker",
      );
      return;
    }

    if (!targetEmployee.dept?.trim()) {
      logger.warn(
        {
          communicationId: communication.id,
          targetEmployeeId: targetEmployee.id,
          employeeNo: targetEmployee.employeeNo,
        },
        "skipping_safety_communication_alert_dispatch_without_worker_department",
      );
      return;
    }

    const department = await resolveDepartmentByWorkerDept({
      plantId: communication.plantId,
      workerDept: targetEmployee.dept,
    });

    if (!department) {
      logger.warn(
        {
          communicationId: communication.id,
          targetEmployeeId: targetEmployee.id,
          workerDept: targetEmployee.dept,
        },
        "skipping_safety_communication_alert_dispatch_without_matching_department",
      );
      return;
    }

    const recipients = await resolveDepartmentAlertRecipients({
      plantId: communication.plantId,
      departmentId: department.id,
    });

    if (!recipients.length) {
      logger.info(
        {
          communicationId: communication.id,
          departmentId: department.id,
        },
        "no_safety_communication_alert_recipients_found",
      );
      return;
    }

    const sifPsifLabel = getSifPsifDisplayLabel(getSifPsifResultFromTemplateData(sewo.templateData));
    const contentByLocale = new Map<AppLocale, Promise<ReturnType<typeof buildApprovedAlertContent>>>();
    const getContent = (locale: AppLocale) => {
      const cached = contentByLocale.get(locale);
      if (cached) return cached;
      const content = localizeMasterDataRows(
        MasterDataEntityType.WORKSTATION,
        communication.workstation ? [communication.workstation] : [],
        locale,
      ).then((workstations) => buildApprovedAlertContent({
        plantCode: communication.plant.code,
        communicationId: communication.id,
        typeLabel: formatCommunicationTypeLabel(communication.type, locale),
        workstation: workstations[0]?.name ?? communication.workstation?.name ?? "-",
        occurredAt: communication.eventDatetime,
        workerName: targetEmployee.name ?? communication.targetText ?? "-",
        sifPsifLabel,
        description: communication.description.trim() || "-",
        locale,
      }));
      contentByLocale.set(locale, content);
      return content;
    };

    await Promise.all(
      recipients.map(async (recipient) => {
        const content = await getContent(normalizeMasterDataLocale(recipient.user.language));
        await Promise.all([
          sendEmailNotification({
            plantId: communication.plantId,
            plantName: communication.plant.name,
            communicationId: communication.id,
            recipientUserId: recipient.user.id,
            recipientEmail: recipient.user.email,
            recipientName: recipient.user.name,
            recipientLanguage: recipient.user.language,
            departmentId: department.id,
            alertType: SafetyCommunicationAlertType.N4_APPROVED_COMMUNICATION,
            title: content.title,
            body: content.body,
            actionUrl: content.absoluteUrl,
          }),
          sendFloatingAlertNotification({
            plantId: communication.plantId,
            communicationId: communication.id,
            recipientUserId: recipient.user.id,
            recipientEmail: recipient.user.email,
            departmentId: department.id,
            alertType: SafetyCommunicationAlertType.N4_APPROVED_COMMUNICATION,
            title: content.title,
            body: content.body,
          }),
        ]);
      }),
    );

    logger.info(
      {
        communicationId: communication.id,
        departmentId: department.id,
        recipients: recipients.map((recipient) => recipient.user.id),
      },
      "dispatched_safety_communication_alerts",
    );
  },
};
