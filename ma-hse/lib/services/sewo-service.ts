import { ActionStatus, Prisma, RoleCode, SEWOStatus } from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getLocalizedBodyPartName, getLocalizedInjuryTypeName } from "@/lib/public-report";
import { NotificationService } from "@/lib/services/notification-service";
import { SewoExportService } from "@/lib/services/sewo-export";
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
import type { ApproveSEWOInput, CreateSEWOInput, ManualCloseSewoInput, UpdateSEWOInput } from "@/lib/validation/dtos";

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
    emailTo: recipients.emails,
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
}

async function notifySewoApproved(sewoId: string) {
  const sewo = await prisma.sEWO.findUniqueOrThrow({
    where: { id: sewoId },
    include: {
      plant: true,
      communication: true,
    },
  });
  const recipients = await getRoleRecipients(sewo.plantId, [...SEWO_STAKEHOLDER_ROLES]);
  if (!recipients.userIds.length && !recipients.emails.length) return;

  const summary = buildSewoNotificationSummary(sewo);
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

async function safeNotifySewoApproved(sewoId: string) {
  try {
    await notifySewoApproved(sewoId);
  } catch (error) {
    logger.error(
      {
        error,
        sewoId,
      },
      "failed_to_notify_sewo_approved",
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

function buildSewoNotificationSummary(sewo: {
  plant: { code: string; name: string };
  communication: { type: string } | null;
  templateData: Prisma.JsonValue | null;
  eventClassification: string;
}) {
  const templateData = getSewoTemplateRecord(sewo.templateData);
  const sifPsifResult = getSifPsifResultFromTemplateData(sewo.templateData);

  return {
    plantLabel: `${sewo.plant.name} (${sewo.plant.code.toUpperCase()})`,
    occurrenceType: formatSewoOccurrenceType({
      communicationType: sewo.communication?.type,
      templateEventType: templateData.eventType,
      eventClassification: sewo.eventClassification,
    }),
    sifPsifLabel: getSifPsifDisplayLabel(sifPsifResult),
    isPriority: isPrioritySifPsif(sifPsifResult),
  };
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
      await safeNotifySewoApproved(updated.id);
      return this.syncStatusWithActions(updated.id);
    }

    await safeNotifySewoRejected({
      sewoId: updated.id,
      actorUserId: input.actorUserId,
      approvalComment: input.payload.approvalComment,
    });

    return updated;
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
