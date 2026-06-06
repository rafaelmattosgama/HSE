import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";

type SafetyCommunicationNotificationUpdateMany = typeof prisma.safetyCommunicationNotification.updateMany;

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
      channel: {
        in: ["REPEATABILITY_ALERT", "SEWO_SUBMITTED", "SEWO_REJECTED", "SAFETY_COMMUNICATION_APPROVED", "SAFETY_COMMUNICATION_N3_ALERT", "ACTION_ALERT"],
      },
      status: "UNREAD",
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "No matching unread alerts were found", 404);
  }

  const runtimePrisma = prisma as typeof prisma & {
    safetyCommunicationNotification?: {
      updateMany: SafetyCommunicationNotificationUpdateMany;
    };
  };

  if (runtimePrisma.safetyCommunicationNotification) {
    await runtimePrisma.safetyCommunicationNotification.updateMany({
      where: {
        notificationId: {
          in: parsed.data.notificationIds,
        },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
  }

  return ok({ updated: result.count });
}
