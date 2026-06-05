import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import {
  ACTION_ALERT_NOTIFICATION_CHANNEL,
  ActionAlertService,
} from "@/lib/services/action-alert-service";

const acknowledgeActionAlertsInput = z.object({
  notificationIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const alerts = await ActionAlertService.listUnreadSoftwareAlerts({
    userId: auth.session.user.id,
  });

  return ok(alerts);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, acknowledgeActionAlertsInput);
  if ("error" in parsed) return parsed.error;

  const result = await prisma.notification.updateMany({
    where: {
      id: {
        in: parsed.data.notificationIds,
      },
      userId: auth.session.user.id,
      channel: ACTION_ALERT_NOTIFICATION_CHANNEL,
      status: "UNREAD",
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "No matching unread action alerts were found", 404);
  }

  return ok({ updated: result.count });
}
