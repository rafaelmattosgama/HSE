import { Prisma, SEWOStatus } from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import type { ApproveSEWOInput, CreateSEWOInput } from "@/lib/validation/dtos";

export const SewaService = {
  async create(input: {
    plantId: string;
    actorUserId: string;
    payload: CreateSEWOInput;
  }) {
    const sewo = await prisma.sEWO.create({
      data: {
        plantId: input.plantId,
        communicationId: input.payload.communicationId,
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
        templateData: input.payload.templateData as Prisma.InputJsonValue | undefined,
        status: input.payload.status ?? SEWOStatus.DRAFT,
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

    return sewo;
  },

  async submitForApproval(sewoId: string, actorUserId: string) {
    const before = await prisma.sEWO.findUniqueOrThrow({ where: { id: sewoId } });
    const updated = await prisma.sEWO.update({
      where: { id: sewoId },
      data: {
        status: SEWOStatus.IN_APPROVAL,
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

    const [communication, catalog] = await prisma.$transaction([
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
        whatText: communication.injuryType?.name ?? communication.description,
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
          bodyPart: communication.bodyPart?.name ?? null,
        },
      },
    });
  },
};
