import { ActionCategory, ActionPriority, ActionSourceType, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { createSMATAuditInput } from "@/lib/validation/dtos";
import { ActionService } from "@/lib/services/action-service";

const ALLOWED_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const audits = await prisma.smatAudit.findMany({
    where: { plantId: plant.id },
    include: {
      auditorUser: {
        select: { name: true },
      },
      communication: {
        select: {
          id: true,
          type: true,
          status: true,
          reporterName: true,
        },
      },
      attachments: true,
      actionLinks: {
        include: {
          action: {
            include: {
              ownerUser: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ auditDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return ok(audits);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createSMATAuditInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  if (parsed.data.communicationId) {
    const communication = await prisma.communication.findFirst({
      where: {
        id: parsed.data.communicationId,
        plantId: plant.id,
      },
      select: { id: true },
    });

    if (!communication) {
      return fail("NOT_FOUND", "Communication not found in this plant", 404);
    }
  }

  const audit = await prisma.smatAudit.create({
    data: {
      plantId: plant.id,
      auditorUserId: auth.session.user.id,
      communicationId: parsed.data.communicationId ?? undefined,
      auditorName: parsed.data.auditorName,
      auditDate: parsed.data.auditDate,
      startTimeText: parsed.data.startTimeText,
      endTimeText: parsed.data.endTimeText,
      areaExamined: parsed.data.areaExamined,
      locationExamined: parsed.data.locationExamined,
      peopleObservedCount: parsed.data.peopleObservedCount,
      peopleInvolvedCount: parsed.data.peopleInvolvedCount,
      peopleSafeCount: parsed.data.peopleSafeCount,
      peopleUnsafeCount: parsed.data.peopleUnsafeCount,
      workConditionsSafeCount: parsed.data.workConditionsSafeCount,
      workConditionsUnsafeCount: parsed.data.workConditionsUnsafeCount,
      reactionsPositiveCount: parsed.data.reactionsPositiveCount,
      reactionsNegativeCount: parsed.data.reactionsNegativeCount,
      safeActs: parsed.data.safeActs,
      safeConditions: parsed.data.safeConditions,
      unsafeActs: parsed.data.unsafeActs,
      unsafeConditions: parsed.data.unsafeConditions,
      answer1: parsed.data.answer1,
      answer2: parsed.data.answer2,
      answer3: parsed.data.answer3,
      answer4: parsed.data.answer4,
      answer5: parsed.data.answer5,
      answer6: parsed.data.answer6,
      notes: parsed.data.notes,
      attachments: parsed.data.attachments.length
        ? {
            createMany: {
              data: parsed.data.attachments.map((attachment) => ({
                ...attachment,
                uploadedById: auth.session.user.id,
              })),
            },
          }
        : undefined,
    },
    include: {
      attachments: true,
    },
  });

  if (parsed.data.actionPlans.length > 0) {
    for (const actionPlan of parsed.data.actionPlans) {
      const action = await ActionService.create({
        plantId: plant.id,
        actorUserId: auth.session.user.id,
        payload: {
          sourceType: ActionSourceType.MANUAL,
          category: ActionCategory.CORRECTIVE,
          priority: actionPlan.priority as ActionPriority,
          title: actionPlan.title,
          description: actionPlan.description,
          ownerUserId: actionPlan.ownerUserId,
          dueDate: actionPlan.dueDate,
        },
      });

      await prisma.smatAuditActionLink.create({
        data: {
          smatAuditId: audit.id,
          actionId: action.id,
        },
      });
    }
  }

  return ok(audit, { status: 201 });
}
