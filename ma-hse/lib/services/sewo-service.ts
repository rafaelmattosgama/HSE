import { ActionStatus, Prisma, RoleCode, SEWOStatus } from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getLocalizedBodyPartName, getLocalizedInjuryTypeName } from "@/lib/public-report";
import { EmailService } from "@/lib/services/email-service";
import { NotificationService } from "@/lib/services/notification-service";
import { SewoExportService } from "@/lib/services/sewo-export";
import { listSewoReportRecipients, normalizeSewoReportRecipientLanguage } from "@/lib/services/sewo-recipient-service";
import { sendSewoAlertEmail } from "@/src/email/systemEmailHelpers.js";
import {
  SEWO_APPROVED_CHANNEL,
  SEWO_N1_APPROVAL_CHANNEL,
  SEWO_REJECTED_CHANNEL,
  SEWO_STAKEHOLDER_ROLES,
  buildSewoSubmissionTemplateData,
  formatSewoOccurrenceType,
  getSewoTemplateRecord,
  getSifPsifDisplayLabel,
  getSifPsifResultFromTemplateData,
  getUserHighestRoleForSewoPlant,
  isPrioritySifPsif,
  isSewoSubmitterRole,
} from "@/lib/services/sewo-validation-service";
import { getSewoStatusFromLinkedActions } from "@/lib/sewo-status";
import type { ApproveSEWOInput, CreateSEWOInput, ManualCloseSewoInput, ReopenActionInput, UpdateSEWOInput } from "@/lib/validation/dtos";

type SewoApprovedExternalEmailCopy = {
  subject: string;
  greeting: string;
  intro: string;
  plantLabel: string;
  workstationLabel: string;
  occurrenceTypeLabel: string;
  sewoLabel: string;
  sifPsifLabel: string;
  priorityNotice: string;
};

const SEWO_APPROVED_EXTERNAL_EMAIL_COPY: Record<string, SewoApprovedExternalEmailCopy> = {
  pt: {
    subject: "Relatorio S-EWO aprovado",
    greeting: "Ola",
    intro: "O relatorio S-EWO validado pelo nivel N1 Corporate segue em anexo.",
    plantLabel: "Planta",
    workstationLabel: "Posto de trabalho",
    occurrenceTypeLabel: "Tipo de ocorrencia",
    sewoLabel: "S-EWO",
    sifPsifLabel: "Classificacao SIF/PSIF",
    priorityNotice: "Classificacao SIF/PSIF prioritaria. Rever com urgencia.",
  },
  it: {
    subject: "Rapporto S-EWO approvato",
    greeting: "Ciao",
    intro: "In allegato trovi il rapporto S-EWO validato dal livello N1 Corporate.",
    plantLabel: "Stabilimento",
    workstationLabel: "Postazione di lavoro",
    occurrenceTypeLabel: "Tipo di evento",
    sewoLabel: "S-EWO",
    sifPsifLabel: "Classificazione SIF/PSIF",
    priorityNotice: "Classificazione SIF/PSIF prioritaria. Verificare con urgenza.",
  },
  en: {
    subject: "Approved S-EWO report",
    greeting: "Hello",
    intro: "The S-EWO report validated by N1 Corporate is attached.",
    plantLabel: "Plant",
    workstationLabel: "Workstation",
    occurrenceTypeLabel: "Occurrence Type",
    sewoLabel: "S-EWO",
    sifPsifLabel: "SIF/PSIF Classification",
    priorityNotice: "Priority SIF/PSIF classification. Review urgently.",
  },
  pl: {
    subject: "Zatwierdzony raport S-EWO",
    greeting: "Hello",
    intro: "W zalaczniku znajduje sie raport S-EWO zatwierdzony przez poziom N1 Corporate.",
    plantLabel: "Zaklad",
    workstationLabel: "Stanowisko pracy",
    occurrenceTypeLabel: "Typ zdarzenia",
    sewoLabel: "S-EWO",
    sifPsifLabel: "Klasyfikacja SIF/PSIF",
    priorityNotice: "Priorytetowa klasyfikacja SIF/PSIF. Wymaga pilnej analizy.",
  },
  de: {
    subject: "Freigegebener S-EWO-Bericht",
    greeting: "Hallo",
    intro: "Im Anhang finden Sie den vom N1 Corporate freigegebenen S-EWO-Bericht.",
    plantLabel: "Werk",
    workstationLabel: "Arbeitsplatz",
    occurrenceTypeLabel: "Ereignistyp",
    sewoLabel: "S-EWO",
    sifPsifLabel: "SIF/PSIF-Klassifizierung",
    priorityNotice: "Prioritaere SIF/PSIF-Klassifizierung. Bitte dringend pruefen.",
  },
  ro: {
    subject: "Raport S-EWO aprobat",
    greeting: "Buna",
    intro: "In atasament gasiti raportul S-EWO validat de nivelul N1 Corporate.",
    plantLabel: "Fabrica",
    workstationLabel: "Post de lucru",
    occurrenceTypeLabel: "Tipul evenimentului",
    sewoLabel: "S-EWO",
    sifPsifLabel: "Clasificare SIF/PSIF",
    priorityNotice: "Clasificare SIF/PSIF prioritara. Verificati urgent.",
  },
  fr: {
    subject: "Rapport S-EWO approuve",
    greeting: "Bonjour",
    intro: "Le rapport S-EWO valide par le niveau N1 Corporate est joint a cet email.",
    plantLabel: "Usine",
    workstationLabel: "Poste de travail",
    occurrenceTypeLabel: "Type d'evenement",
    sewoLabel: "S-EWO",
    sifPsifLabel: "Classification SIF/PSIF",
    priorityNotice: "Classification SIF/PSIF prioritaire. Merci de verifier rapidement.",
  },
};

function getSewoApprovedExternalEmailCopy(locale: string) {
  return SEWO_APPROVED_EXTERNAL_EMAIL_COPY[normalizeSewoReportRecipientLanguage(locale)]
    ?? SEWO_APPROVED_EXTERNAL_EMAIL_COPY.en;
}

async function notifySewoSubmitted(input: {
  sewoId: string;
  actorRole: RoleCode | null;
}) {
  if (!isSewoSubmitterRole(input.actorRole)) return;

  const sewo = await prisma.sEWO.findUniqueOrThrow({
    where: { id: input.sewoId },
    include: {
      plant: true,
      communication: true,
    },
  });
  const recipients = await getRoleRecipients(sewo.plantId, [RoleCode.N1_CORPORATE]);
  if (!recipients.userIds.length && !recipients.emails.length) return;

  const summary = buildSewoNotificationSummary(sewo);
  const priorityPrefix = summary.isPriority ? `[${summary.sifPsifLabel}] ` : "";
  const title = `${priorityPrefix}S-EWO pendente de aprovação N1`;
  const body = [
    `Planta: ${summary.plantLabel}`,
    `Tipo de ocorrência: ${summary.occurrenceType}`,
    "Estado: Submitted",
    summary.isPriority ? `Classificação SIF/PSIF: ${summary.sifPsifLabel}` : null,
  ].filter(Boolean).join(" | ");

  await NotificationService.notify({
    plantId: sewo.plantId,
    userIds: recipients.userIds,
    title,
    body,
    html: buildSewoEmailHtml({
      title,
      intro: "Existe um S-EWO pendente de aprovação do nível N1.",
      plantLabel: summary.plantLabel,
      occurrenceType: summary.occurrenceType,
      statusLabel: "Submitted",
      sifPsifLabel: summary.sifPsifLabel,
      isPriority: summary.isPriority,
    }),
    channel: SEWO_N1_APPROVAL_CHANNEL,
  });

  if (recipients.emails.length) {
    const detailUrl = new URL(`/app/${sewo.plant.code}/sewo?sewoId=${sewo.id}`, env.APP_URL).toString();
    await sendSewoAlertEmail({
      to: recipients.emails,
      tipoAlerta: "S-EWO pending N1 approval",
      descricao: summary.occurrenceType,
      prioridade: summary.isPriority ? summary.sifPsifLabel : "Normal",
      dataHora: sewo.analysisDate,
      recipientName: "N1 Corporate",
      sewoCode: sewo.id,
      plantName: summary.plantLabel,
      sewoStatus: "Submitted",
      sewoUrl: detailUrl,
    });
  }
}

async function notifySewoApproved(sewoId: string) {
  const sewo = await prisma.sEWO.findUniqueOrThrow({
    where: { id: sewoId },
    include: {
      plant: true,
      communication: true,
      line: true,
    },
  });
  const [recipients, externalRecipients] = await Promise.all([
    getRoleRecipients(sewo.plantId, [...SEWO_STAKEHOLDER_ROLES]),
    listSewoReportRecipients(sewo.plantId),
  ]);
  if (!recipients.userIds.length && !recipients.emails.length && !externalRecipients.length) return;

  const summary = buildSewoNotificationSummary(sewo);
  const notificationTasks: Promise<unknown>[] = [];

  if (recipients.userIds.length || recipients.emails.length) {
    notificationTasks.push((async () => {
  const title = `S-EWO aprovado e partilhado: ${summary.occurrenceType}`;
  const body = [
    `Planta: ${summary.plantLabel}`,
    `Tipo de ocorrência: ${summary.occurrenceType}`,
    "Estado: Approved",
    summary.isPriority ? `Classificação SIF/PSIF: ${summary.sifPsifLabel}` : null,
  ].filter(Boolean).join(" | ");
  const exported = await SewoExportService.buildExport(sewoId, {
    locale: sewo.plant.defaultLanguage,
  }).catch(() => null);

  await NotificationService.notify({
    plantId: sewo.plantId,
    userIds: recipients.userIds,
    emailTo: recipients.emails,
    title,
    body,
    html: buildSewoEmailHtml({
      title,
      intro: "O S-EWO foi validado pelo nível N1 e fica partilhado com os níveis N1, N2 e N3.",
      plantLabel: summary.plantLabel,
      occurrenceType: summary.occurrenceType,
      statusLabel: "Approved",
      sifPsifLabel: summary.sifPsifLabel,
      isPriority: summary.isPriority,
    }),
    channel: SEWO_APPROVED_CHANNEL,
    attachments: exported
      ? [
          {
            filename: `sewo-${sewo.plant.code}-${sewo.id}.pdf`,
            content: exported.pdf,
            contentType: "application/pdf",
          },
        ]
      : undefined,
  });
    })());
  }

  if (externalRecipients.length) {
    notificationTasks.push(sendSewoApprovedExternalReports({
      sewoId,
      sewo: {
        id: sewo.id,
        plantId: sewo.plantId,
        plant: {
          code: sewo.plant.code,
          name: sewo.plant.name,
        },
      },
      summary,
      recipients: externalRecipients,
    }));
  }

  const results = await Promise.allSettled(notificationTasks);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        {
          error: result.reason,
          sewoId,
          taskIndex: index,
        },
        "failed_to_dispatch_sewo_approved_notification",
      );
    }
  });
}

async function notifySewoRejected(input: {
  sewoId: string;
  actorUserId: string;
  approvalComment: string;
}) {
  const [sewo, actor] = await Promise.all([
    prisma.sEWO.findUniqueOrThrow({
      where: { id: input.sewoId },
      include: {
        plant: true,
        communication: true,
        approvedBy: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { name: true },
    }),
  ]);
  const recipients = await getRoleRecipients(sewo.plantId, [RoleCode.N3_SAFETY]);
  if (!recipients.userIds.length && !recipients.emails.length) return;

  const summary = buildSewoNotificationSummary(sewo);
  const detailPath = `/app/${sewo.plant.code}/sewo?sewoId=${sewo.id}`;
  const detailUrl = new URL(detailPath, env.APP_URL).toString();
  const rejectedAt = sewo.approvedAt ?? new Date();
  const rejectedBy = sewo.approvedBy?.name ?? actor?.name ?? "N1";
  const title = "S-EWO rejeitado pelo N1 — ação necessária";
  const body = [
    "S-EWO rejeitado pelo N1. Por favor, reveja a informação e volte a submeter.",
    `S-EWO: ${sewo.id}`,
    `Planta: ${summary.plantLabel}`,
    `Tipo de ocorrência: ${summary.occurrenceType}`,
    `Data/hora da rejeição: ${rejectedAt.toISOString().replace("T", " ").slice(0, 16)}`,
    `Rejeitado por: ${rejectedBy}`,
    input.approvalComment.trim() ? `Motivo: ${input.approvalComment.trim()}` : null,
    `Abrir S-EWO: ${detailUrl}`,
  ].filter(Boolean).join("\n");

  await NotificationService.notify({
    plantId: sewo.plantId,
    userIds: recipients.userIds,
    emailTo: recipients.emails,
    title,
    body,
    html: buildSewoRejectedEmailHtml({
      title,
      intro: "O S-EWO foi rejeitado na validação N1. Reveja a informação, atualize o registo e submeta novamente.",
      plantLabel: summary.plantLabel,
      occurrenceType: summary.occurrenceType,
      sewoId: sewo.id,
      rejectedAt,
      rejectedBy,
      approvalComment: input.approvalComment,
      detailUrl,
    }),
    channel: SEWO_REJECTED_CHANNEL,
  });
}

const OPEN_LINKED_ACTIONS_MESSAGE = "Não é possível fechar este S-EWO porque existem ações associadas ainda em aberto.";

export class SewoValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SewoValidationError";
  }
}

function collectLinkedActionStatuses(sewo: {
  actions: Array<{ id: string; status: ActionStatus }>;
  actionLinks: Array<{ action: { id: string; status: ActionStatus } }>;
}) {
  const actionStatuses = new Map<string, ActionStatus>();

  sewo.actions.forEach((action) => {
    actionStatuses.set(action.id, action.status);
  });
  sewo.actionLinks.forEach((entry) => {
    actionStatuses.set(entry.action.id, entry.action.status);
  });

  return Array.from(actionStatuses.values());
}

function isApprovedLifecycleState(sewo: {
  status: SEWOStatus;
  approvedAt: Date | null;
  approvedByUserId: string | null;
}) {
  return sewo.status === SEWOStatus.APPROVED || Boolean(sewo.approvedAt || sewo.approvedByUserId);
}

async function safeNotifySewoSubmitted(input: {
  sewoId: string;
  actorRole: RoleCode | null;
}) {
  try {
    await notifySewoSubmitted(input);
  } catch (error) {
    logger.error(
      {
        error,
        sewoId: input.sewoId,
        actorRole: input.actorRole,
      },
      "failed_to_notify_sewo_submitted",
    );
  }
}

async function enqueueSewoApprovedNotification(sewoId: string) {
  try {
    const { sewoApprovedNotificationQueue } = await import("@/jobs/queues");
    await sewoApprovedNotificationQueue.add(
      "send-sewo-approved-notification",
      { sewoId },
      {
        jobId: `sewo-approved-notification:${sewoId}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60_000,
        },
        removeOnComplete: {
          age: 7 * 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 30 * 24 * 60 * 60,
          count: 1000,
        },
      },
    );
  } catch (error) {
    logger.error(
      {
        error,
        sewoId,
      },
      "failed_to_enqueue_sewo_approved_notification",
    );
  }
}

async function safeNotifySewoRejected(input: {
  sewoId: string;
  actorUserId: string;
  approvalComment: string;
}) {
  try {
    await notifySewoRejected(input);
  } catch (error) {
    logger.error(
      {
        error,
        sewoId: input.sewoId,
        actorUserId: input.actorUserId,
      },
      "failed_to_notify_sewo_rejected",
    );
  }
}

async function getRoleRecipients(plantId: string, roles: RoleCode[]) {
  const recipients = await prisma.userPlantRole.findMany({
    where: {
      plantId,
      role: {
        code: {
          in: roles,
        },
      },
      user: {
        isActive: true,
      },
    },
    include: {
      user: true,
    },
  });

  return {
    userIds: Array.from(new Set(recipients.map((entry) => entry.userId))),
    emails: Array.from(new Set(recipients.flatMap((entry) => (entry.user.email ? [entry.user.email] : [])))),
  };
}

function getSewoWorkstationValue(sewo: {
  whereText?: string | null;
  line?: { name: string } | null;
}) {
  if (sewo.whereText?.trim()) return sewo.whereText.trim();
  if (sewo.line?.name?.trim()) return sewo.line.name.trim();
  return "-";
}

function buildSewoNotificationSummary(sewo: {
  plant: { code: string; name: string };
  communication: { type: string } | null;
  templateData: Prisma.JsonValue | null;
  eventClassification: string;
  whereText?: string | null;
  line?: { name: string } | null;
}) {
  const templateData = getSewoTemplateRecord(sewo.templateData);
  const sifPsifResult = getSifPsifResultFromTemplateData(sewo.templateData);

  return {
    plantLabel: `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`,
    workstation: getSewoWorkstationValue(sewo),
    occurrenceType: formatSewoOccurrenceType({
      communicationType: sewo.communication?.type,
      templateEventType: templateData.eventType,
      eventClassification: sewo.eventClassification,
    }),
    sifPsifLabel: getSifPsifDisplayLabel(sifPsifResult),
    isPriority: isPrioritySifPsif(sifPsifResult),
  };
}

function buildSewoApprovedExternalEmailContent(input: {
  locale: string;
  recipientName: string;
  plantLabel: string;
  workstation: string;
  occurrenceType: string;
  sewoId: string;
  sifPsifLabel: string;
  isPriority: boolean;
}) {
  const copy = getSewoApprovedExternalEmailCopy(input.locale);
  const salutation = `${copy.greeting}${input.recipientName.trim() ? ` ${input.recipientName.trim()}` : ""},`;
  const sifPsifRow = input.isPriority
    ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.sifPsifLabel)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.sifPsifLabel)}</td></tr>`
    : "";
  const priorityHtml = input.isPriority
    ? `
      <div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#fee2e2;border:1px solid #ef4444;color:#991b1b;">
        <strong style="font-size:16px;">${escapeHtml(input.sifPsifLabel)}</strong>
        <span style="display:block;margin-top:4px;">${escapeHtml(copy.priorityNotice)}</span>
      </div>
    `
    : "";
  const priorityText = input.isPriority ? `${input.sifPsifLabel} - ${copy.priorityNotice}` : null;

  return {
    subject: copy.subject,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
        <p>${escapeHtml(salutation)}</p>
        <p>${escapeHtml(copy.intro)}</p>
        ${priorityHtml}
        <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:560px;">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.plantLabel)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.plantLabel)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.workstationLabel)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.workstation)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.occurrenceTypeLabel)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.occurrenceType)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">${escapeHtml(copy.sewoLabel)}</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.sewoId)}</td></tr>
          ${sifPsifRow}
        </table>
      </div>
    `,
    text: [
      salutation,
      "",
      copy.intro,
      `${copy.plantLabel}: ${input.plantLabel}`,
      `${copy.workstationLabel}: ${input.workstation}`,
      `${copy.occurrenceTypeLabel}: ${input.occurrenceType}`,
      `${copy.sewoLabel}: ${input.sewoId}`,
      input.isPriority ? `${copy.sifPsifLabel}: ${input.sifPsifLabel}` : null,
      priorityText,
    ].filter(Boolean).join("\n"),
  };
}

async function sendSewoApprovedExternalReports(input: {
  sewoId: string;
  sewo: {
    id: string;
    plantId: string;
    plant: {
      code: string;
      name: string;
    };
  };
  summary: {
    plantLabel: string;
    workstation: string;
    occurrenceType: string;
    sifPsifLabel: string;
    isPriority: boolean;
  };
  recipients: Awaited<ReturnType<typeof listSewoReportRecipients>>;
}) {
  const exportPromises = new Map<string, Promise<{ pdf: Buffer }>>();

  const results = await Promise.allSettled(input.recipients.map(async (recipient) => {
    const locale = normalizeSewoReportRecipientLanguage(recipient.language);
    let exportedPromise = exportPromises.get(locale);
    if (!exportedPromise) {
      exportedPromise = SewoExportService.buildExternalSummaryExport(input.sewoId, { locale });
      exportPromises.set(locale, exportedPromise);
    }

    const exported = await exportedPromise;
    const email = buildSewoApprovedExternalEmailContent({
      locale,
      recipientName: recipient.name,
      plantLabel: input.summary.plantLabel,
      workstation: input.summary.workstation,
      occurrenceType: input.summary.occurrenceType,
      sewoId: input.sewo.id,
      sifPsifLabel: input.summary.sifPsifLabel,
      isPriority: input.summary.isPriority,
    });

    await EmailService.sendMail({
      to: recipient.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: `sewo-summary-${input.sewo.plant.code}-${input.sewo.id}.pdf`,
          content: exported.pdf,
          contentType: "application/pdf",
        },
      ],
    });
  }));

  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) {
    logger.error(
      {
        sewoId: input.sewoId,
        failures: failures.map((failure) => failure.reason),
      },
      "failed_to_send_sewo_external_reports",
    );
  }
}

function buildSewoEmailHtml(input: {
  title: string;
  intro: string;
  plantLabel: string;
  occurrenceType: string;
  statusLabel: string;
  sifPsifLabel: string;
  isPriority: boolean;
}) {
  const priorityBlock = input.isPriority
    ? `
      <div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#fee2e2;border:1px solid #ef4444;color:#991b1b;">
        <strong style="font-size:16px;">${escapeHtml(input.sifPsifLabel)}</strong>
        <span style="display:block;margin-top:4px;">Classificação SIF/PSIF prioritária. Rever com urgência.</span>
      </div>
    `
    : "";

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#002663;">${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(input.intro)}</p>
      ${priorityBlock}
      <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:560px;">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Planta</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.plantLabel)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo de ocorrência</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.occurrenceType)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Estado</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.statusLabel)}</td></tr>
      </table>
    </div>
  `;
}

function buildSewoRejectedEmailHtml(input: {
  title: string;
  intro: string;
  plantLabel: string;
  occurrenceType: string;
  sewoId: string;
  rejectedAt: Date;
  rejectedBy: string;
  approvalComment: string;
  detailUrl: string;
}) {
  const rejectionCommentRow = input.approvalComment.trim()
    ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Motivo</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.approvalComment.trim())}</td></tr>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#002663;">${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(input.intro)}</p>
      <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:640px;">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">S-EWO</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.sewoId)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Planta</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.plantLabel)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo de ocorrência</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.occurrenceType)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Data/hora da rejeição</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.rejectedAt.toISOString().replace("T", " ").slice(0, 16))}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Rejeitado por</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(input.rejectedBy)}</td></tr>
        ${rejectionCommentRow}
      </table>
      <p style="margin-top:16px;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;border-radius:8px;background:#0f766e;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Abrir S-EWO</a>
      </p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const SewaService = {
  async create(input: {
    plantId: string;
    actorUserId: string;
    payload: CreateSEWOInput;
  }) {
    const requestedStatus = input.payload.status ?? SEWOStatus.DRAFT;
    const actorRole = requestedStatus === SEWOStatus.IN_APPROVAL
      ? await getUserHighestRoleForSewoPlant(input.actorUserId, input.plantId)
      : null;
    const templateData = requestedStatus === SEWOStatus.IN_APPROVAL
      ? buildSewoSubmissionTemplateData({
          templateData: input.payload.templateData,
          actorUserId: input.actorUserId,
          actorRole,
        })
      : input.payload.templateData as Prisma.InputJsonValue | undefined;

    const sewo = await prisma.sEWO.create({
      data: {
        plantId: input.plantId,
        communicationId: input.payload.communicationId ?? null,
        eventClassification: input.payload.eventClassification,
        areaId: input.payload.areaId,
        lineId: input.payload.lineId,
        shiftId: input.payload.shiftId,
        analysisDate: input.payload.analysisDate,
        performedByUserId: input.actorUserId,
        whatText: input.payload.whatText,
        whereText: input.payload.whereText,
        whoText: input.payload.whoText,
        usualWorkYesNo: input.payload.usualWorkYesNo,
        whichText: input.payload.whichText,
        howText: input.payload.howText,
        immediateCorrectiveActionText: input.payload.immediateCorrectiveActionText,
        templateData,
        status: requestedStatus,
        causeCatalogVersionId: input.payload.causeCatalogVersionId,
        causeSelections: input.payload.causeSelections.length
          ? {
              createMany: {
                data: input.payload.causeSelections,
              },
            }
          : undefined,
        attachments: input.payload.attachments?.length
          ? {
              createMany: {
                data: input.payload.attachments.map((attachment) => ({
                  ...attachment,
                  type: "EVENT_EVIDENCE",
                  uploadedById: input.actorUserId,
                })),
              },
            }
          : undefined,
      },
      include: {
        causeSelections: true,
        attachments: true,
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: sewo.id,
      action: "CREATE",
      actorUserId: input.actorUserId,
      plantId: input.plantId,
      diff: {
        before: null,
        after: sewo as unknown as Record<string, unknown>,
        fieldsChanged: Object.keys(sewo),
      },
    });

    if (sewo.status === SEWOStatus.IN_APPROVAL) {
      await safeNotifySewoSubmitted({
        sewoId: sewo.id,
        actorRole,
      });
    }

    return sewo;
  },

  async update(input: {
    sewoId: string;
    actorUserId: string;
    payload: UpdateSEWOInput;
  }) {
    const before = await prisma.sEWO.findUniqueOrThrow({
      where: { id: input.sewoId },
      include: {
        causeSelections: true,
        attachments: true,
      },
    });
    const requestedStatus = input.payload.status ?? before.status;
    const isNewSubmission = before.status !== SEWOStatus.IN_APPROVAL && requestedStatus === SEWOStatus.IN_APPROVAL;
    const actorRole = isNewSubmission
      ? await getUserHighestRoleForSewoPlant(input.actorUserId, before.plantId)
      : null;
    const templateData = isNewSubmission
      ? buildSewoSubmissionTemplateData({
          templateData: input.payload.templateData,
          actorUserId: input.actorUserId,
          actorRole,
        })
      : input.payload.templateData as Prisma.InputJsonValue | undefined;

    const updated = await prisma.sEWO.update({
      where: { id: input.sewoId },
      data: {
        communicationId: input.payload.communicationId ?? null,
        eventClassification: input.payload.eventClassification,
        areaId: input.payload.areaId ?? null,
        lineId: input.payload.lineId ?? null,
        shiftId: input.payload.shiftId ?? null,
        analysisDate: input.payload.analysisDate,
        whatText: input.payload.whatText,
        whereText: input.payload.whereText,
        whoText: input.payload.whoText,
        usualWorkYesNo: input.payload.usualWorkYesNo,
        whichText: input.payload.whichText ?? null,
        howText: input.payload.howText,
        immediateCorrectiveActionText: input.payload.immediateCorrectiveActionText,
        templateData,
        causeCatalogVersionId: input.payload.causeCatalogVersionId,
        status: requestedStatus,
        causeSelections: {
          deleteMany: {},
          ...(input.payload.causeSelections.length
            ? {
                createMany: {
                  data: input.payload.causeSelections,
                },
              }
            : {}),
        },
        attachments: input.payload.attachments?.length
          ? {
              createMany: {
                data: input.payload.attachments.map((attachment) => ({
                  ...attachment,
                  type: "EVENT_EVIDENCE",
                  uploadedById: input.actorUserId,
                })),
              },
            }
          : undefined,
      },
      include: {
        causeSelections: true,
        attachments: true,
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: input.sewoId,
      action: "UPDATE",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    if (isNewSubmission) {
      await safeNotifySewoSubmitted({
        sewoId: updated.id,
        actorRole,
      });
    }

    return updated;
  },

  async submitForApproval(sewoId: string, actorUserId: string) {
    const before = await prisma.sEWO.findUniqueOrThrow({ where: { id: sewoId } });
    const actorRole = await getUserHighestRoleForSewoPlant(actorUserId, before.plantId);
    const updated = await prisma.sEWO.update({
      where: { id: sewoId },
      data: {
        status: SEWOStatus.IN_APPROVAL,
        templateData: buildSewoSubmissionTemplateData({
          templateData: before.templateData,
          actorUserId,
          actorRole,
        }),
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: sewoId,
      action: "SUBMIT_FOR_APPROVAL",
      actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    if (before.status !== SEWOStatus.IN_APPROVAL) {
      await safeNotifySewoSubmitted({
        sewoId: updated.id,
        actorRole,
      });
    }

    return updated;
  },

  async approve(input: {
    sewoId: string;
    actorUserId: string;
    payload: ApproveSEWOInput;
  }) {
    const before = await prisma.sEWO.findUniqueOrThrow({ where: { id: input.sewoId } });

    const updated = await prisma.sEWO.update({
      where: { id: input.sewoId },
      data: {
        status: input.payload.approved ? SEWOStatus.APPROVED : SEWOStatus.REJECTED,
        approvedByUserId: input.actorUserId,
        approvedAt: new Date(),
        approvalComment: input.payload.approvalComment,
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: input.sewoId,
      action: input.payload.approved ? "APPROVE" : "REJECT",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
    });

    if (input.payload.approved) {
      void enqueueSewoApprovedNotification(updated.id);
      return this.syncStatusWithActions(updated.id);
    }

    await safeNotifySewoRejected({
      sewoId: updated.id,
      actorUserId: input.actorUserId,
      approvalComment: input.payload.approvalComment,
    });

    return updated;
  },

  async sendApprovedNotifications(sewoId: string) {
    await notifySewoApproved(sewoId);
  },

  async manualClose(input: {
    sewoId: string;
    actorUserId: string;
    payload: ManualCloseSewoInput;
  }) {
    const before = await prisma.sEWO.findUniqueOrThrow({
      where: { id: input.sewoId },
      include: {
        actions: {
          select: {
            id: true,
            status: true,
          },
        },
        actionLinks: {
          select: {
            action: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const openLinkedActions = collectLinkedActionStatuses(before).filter(
      (status) => status === ActionStatus.OPEN || status === ActionStatus.ONGOING,
    );

    if (openLinkedActions.length > 0) {
      throw new SewoValidationError("SEWO_HAS_OPEN_ACTIONS", OPEN_LINKED_ACTIONS_MESSAGE);
    }

    const updated = await prisma.sEWO.update({
      where: { id: input.sewoId },
      data: {
        status: SEWOStatus.CLOSED,
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: input.sewoId,
      action: "MANUAL_CLOSE",
      actorUserId: input.actorUserId,
      plantId: updated.plantId,
      diff: {
        ...buildDiff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
        after: {
          ...updated,
          manualCloseReason: input.payload.reason,
        } as unknown as Record<string, unknown>,
      },
    });

    return updated;
  },

  async reopen(input: {
    sewoId: string;
    actorUserId: string;
    payload: ReopenActionInput;
  }) {
    const before = await prisma.sEWO.findUniqueOrThrow({
      where: { id: input.sewoId },
    });

    if (before.status !== SEWOStatus.CLOSED) {
      throw new SewoValidationError("SEWO_NOT_CLOSED", "Only closed S-EWO records can be reopened.", 400);
    }

    const reopenedStatus =
      before.approvedAt || before.approvedByUserId
        ? SEWOStatus.APPROVED
        : SEWOStatus.DRAFT;

    const updated = await prisma.sEWO.update({
      where: { id: input.sewoId },
      data: {
        status: reopenedStatus,
      },
    });

    await writeAuditLog({
      entityType: "SEWO",
      entityId: input.sewoId,
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

  async deleteSewo(input: {
    sewoId: string;
    actorUserId: string;
  }) {
    const before = await prisma.sEWO.findUniqueOrThrow({
      where: { id: input.sewoId },
      include: {
        actions: { select: { id: true } },
      },
    });

    const actionIds = before.actions.map((entry) => entry.id);

    await prisma.$transaction(async (tx) => {
      if (actionIds.length > 0) {
        await tx.actionEvidenceAttachment.deleteMany({
          where: { actionId: { in: actionIds } },
        });
        await tx.actionCoOwner.deleteMany({
          where: { actionId: { in: actionIds } },
        });
        await tx.sEWOActionLink.deleteMany({ where: { sewoId: input.sewoId } });
        await tx.action.deleteMany({
          where: { id: { in: actionIds } },
        });
      }

      await tx.sEWOActionLink.deleteMany({ where: { sewoId: input.sewoId } });
      await tx.sEWOAttachment.deleteMany({ where: { sewoId: input.sewoId } });
      await tx.sEWOCauseSelection.deleteMany({ where: { sewoId: input.sewoId } });
      await tx.sEWO.delete({ where: { id: input.sewoId } });

      await tx.auditLog.create({
        data: {
          entityType: "SEWO",
          entityId: input.sewoId,
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

    return {
      id: input.sewoId,
      deletedLinkedActions: actionIds.length,
    };
  },

  async syncStatusWithActions(sewoId: string) {
    const sewo = await prisma.sEWO.findUniqueOrThrow({
      where: { id: sewoId },
      include: {
        actions: {
          select: {
            id: true,
            status: true,
          },
        },
        actionLinks: {
          select: {
            action: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (sewo.status === SEWOStatus.IN_APPROVAL || sewo.status === SEWOStatus.REJECTED) {
      return prisma.sEWO.findUniqueOrThrow({ where: { id: sewoId } });
    }

    const actionStatuses = collectLinkedActionStatuses(sewo);
    const nextStatus = getSewoStatusFromLinkedActions(actionStatuses, {
      approved: isApprovedLifecycleState(sewo),
    });

    if (!nextStatus || nextStatus === sewo.status) {
      return prisma.sEWO.findUniqueOrThrow({ where: { id: sewoId } });
    }

    return prisma.sEWO.update({
      where: { id: sewoId },
      data: {
        status: nextStatus,
      },
    });
  },

  async linkAction(sewoId: string, actionId: string) {
    const link = await prisma.sEWOActionLink.create({
      data: {
        sewoId,
        actionId,
      },
    });

    await this.syncStatusWithActions(sewoId);

    return link;
  },

  async createProvisionalFromCommunication(input: {
    communicationId: string;
    actorUserId: string;
  }) {
    const existing = await prisma.sEWO.findFirst({
      where: {
        communicationId: input.communicationId,
      },
    });

    if (existing) {
      return existing;
    }

    const [actor, communication, catalog] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { language: true },
      }),
      prisma.communication.findUniqueOrThrow({
        where: { id: input.communicationId },
        include: {
          plant: true,
          area: true,
          line: true,
          shift: true,
          workstation: true,
          targetEmployee: true,
          bodyPart: true,
          injuryType: true,
        },
      }),
      prisma.sEWOCauseCatalogVersion.findFirst({
        where: { isActive: true },
        orderBy: { version: "desc" },
      }),
    ]);

    if (!catalog) {
      throw new Error("No active S-EWO cause catalog found");
    }

    const actorLanguage = actor?.language ?? "en";
    const localizedInjuryType = communication.injuryType
      ? getLocalizedInjuryTypeName(communication.injuryType, actorLanguage)
      : null;
    const localizedBodyPart = communication.bodyPart
      ? getLocalizedBodyPartName(communication.bodyPart, actorLanguage)
      : null;

    return prisma.sEWO.create({
      data: {
        plantId: communication.plantId,
        communicationId: communication.id,
        eventClassification: `${communication.plant.code.toUpperCase()} ${communication.type}`,
        areaId: communication.areaId,
        lineId: communication.lineId,
        shiftId: communication.shiftId,
        analysisDate: new Date(),
        performedByUserId: input.actorUserId,
        whatText: localizedInjuryType ?? communication.description,
        whereText: communication.workstation?.name ?? communication.area?.name ?? "",
        whoText: communication.targetEmployee?.name ?? communication.reporterName,
        usualWorkYesNo: true,
        whichText: communication.type,
        howText: communication.description,
        immediateCorrectiveActionText: communication.suggestedAction ?? "",
        causeCatalogVersionId: catalog.id,
        status: SEWOStatus.DRAFT,
        isAutoCreated: true,
        templateData: {
          plantCode: communication.plant.code.toUpperCase(),
          eventType: communication.type,
          classification: communication.classification,
          lostDays: communication.lostDays,
          initialLostDays: communication.initialLostDays,
          eventDatetime: communication.eventDatetime.toISOString(),
          reporterName: communication.reporterName,
          injuredPerson: communication.targetEmployee?.name ?? communication.targetText ?? null,
          workplace: communication.workstation?.name ?? null,
          area: communication.area?.name ?? null,
          line: communication.line?.name ?? null,
          bodyPart: localizedBodyPart,
        },
      },
    });
  },
};
