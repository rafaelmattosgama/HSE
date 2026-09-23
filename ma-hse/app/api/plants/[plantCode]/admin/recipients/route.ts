import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { reportRecipientListInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const lists = await prisma.reportRecipientList.findMany({
    where: {
      plantId: plant.id,
      scope: "PLANT",
    },
    include: {
      recipients: true,
    },
  });

  return ok(lists);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, reportRecipientListInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const list = await prisma.$transaction(async (tx) => {
    const existing = parsed.data.listId
      ? await tx.reportRecipientList.findFirst({
          where: { id: parsed.data.listId, plantId: plant.id, scope: "PLANT" },
          include: { recipients: true },
        })
      : null;
    if (parsed.data.listId && !existing) return null;

    const saved = existing
      ? await tx.reportRecipientList.update({
          where: { id: existing.id },
          data: {
            name: parsed.data.listName,
            recipients: { deleteMany: {}, createMany: { data: parsed.data.recipients } },
          },
          include: { recipients: true },
        })
      : await tx.reportRecipientList.create({
          data: {
            plantId: plant.id,
            scope: "PLANT",
            name: parsed.data.listName,
            recipients: { createMany: { data: parsed.data.recipients } },
          },
          include: { recipients: true },
        });
    await writeAuditLog({
      entityType: "ReportRecipientList",
      entityId: saved.id,
      action: existing ? "UPDATE" : "CREATE",
      actorUserId: auth.session.user.id,
      plantId: plant.id,
      diff: buildDiff(existing, saved),
    }, tx);
    return saved;
  });

  if (!list) return fail("RECIPIENT_LIST_NOT_FOUND", "Recipient list not found for this plant.", 404);

  return ok(list);
}
