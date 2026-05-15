import { Prisma, RoleCode, SEWOStatus } from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLocalizedBodyPartName, getLocalizedInjuryTypeName } from "@/lib/public-report";
import { NotificationService } from "@/lib/services/notification-service";
import { SewoExportService } from "@/lib/services/sewo-export";
import {
  SEWO_APPROVED_CHANNEL,
  SEWO_N1_APPROVAL_CHANNEL,
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
import type { ApproveSEWOInput, CreateSEWOInput, UpdateSEWOInput } from "@/lib/validation/dtos";

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
      await notifySewoSubmitted({
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
      await notifySewoSubmitted({
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
      await notifySewoSubmitted({
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
      await notifySewoApproved(updated.id);
    }

    return updated;
  },

  async linkAction(sewoId: string, actionId: string) {
    return prisma.sEWOActionLink.create({
      data: {
        sewoId,
        actionId,
      },
    });
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
