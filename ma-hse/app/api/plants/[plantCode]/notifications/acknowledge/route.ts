import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";

const acknowledgeNotificationsInput = z.object({
  notificationIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ plantCode: string }> },
) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, acknowledgeNotificationsInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const result = await prisma.notification.updateMany({
    where: {
      id: {
        in: parsed.data.notificationIds,
      },
      userId: auth.session.user.id,
      plantId: plant.id,
      channel: "REPEATABILITY_ALERT",
      status: "UNREAD",
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "No matching unread repeatability alerts were found", 404);
  }

  return ok({ updated: result.count });
}
