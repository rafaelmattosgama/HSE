import { SEWOStatus } from "@prisma/client";
import { incidentKnowledgeSewoSyncQueue } from "@/jobs/queues";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can synchronize approved S-EWO records.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const sewoRecords = await prisma.sEWO.findMany({
    where: {
      plantId: plant.id,
      deletedAt: null,
      status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
      OR: [{ approvedAt: { not: null } }, { approvedByUserId: { not: null } }],
    },
    select: { id: true, approvedByUserId: true, updatedAt: true },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
  });

  try {
    if (sewoRecords.length) {
      await incidentKnowledgeSewoSyncQueue.addBulk(sewoRecords.map((sewo) => ({
        name: "sync-approved-sewo",
        data: { sewoId: sewo.id, plantId: plant.id, actorUserId: auth.session.user.id },
        opts: {
          jobId: `incident-knowledge-sewo-sync:${sewo.id}:${sewo.updatedAt.getTime()}`,
          attempts: 3,
          backoff: { type: "exponential" as const, delay: 3_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      })));
    }
  } catch {
    await prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        actorUserId: auth.session.user.id,
        operation: "CURRENT_SEWO_BACKFILL_QUEUE_FAILED",
        changes: { eligibleCount: sewoRecords.length },
        error: "The current S-EWO synchronization queue was unavailable.",
      },
    });
    return fail("QUEUE_UNAVAILABLE", "The S-EWO synchronization queue is unavailable. Try again later.", 503);
  }

  await prisma.incidentKnowledgeAudit.create({
    data: {
      plantId: plant.id,
      actorUserId: auth.session.user.id,
      operation: "CURRENT_SEWO_BACKFILL_QUEUED",
      changes: { queuedCount: sewoRecords.length, source: "HSE_BACKFILL" },
    },
  });
  return ok({ queuedCount: sewoRecords.length });
}
