import { NotificationStatus } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireAuth } from "@/lib/rbac/guards";
import { ProfileAlertService } from "@/lib/services/profile-alert-service";

const updateProfileAlertsInput = z.object({
  notificationIds: z.array(z.string().uuid()).min(1),
  status: z.enum([NotificationStatus.READ, NotificationStatus.UNREAD]),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!ProfileAlertService.canUseAlerts(auth.session.user)) {
    return fail("FORBIDDEN", "Alert access is restricted to N3 and N4 users", 403);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "count") {
    return ok({
      unreadCount: await ProfileAlertService.countUnreadForUser(auth.session.user),
    });
  }

  const [alerts, unreadCount] = await Promise.all([
    ProfileAlertService.listForUser(auth.session.user),
    ProfileAlertService.countUnreadForUser(auth.session.user),
  ]);

  return ok({
    alerts,
    unreadCount,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!ProfileAlertService.canUseAlerts(auth.session.user)) {
    return fail("FORBIDDEN", "Alert access is restricted to N3 and N4 users", 403);
  }

  const parsed = await parseBody(request, updateProfileAlertsInput);
  if ("error" in parsed) return parsed.error;

  const result = await ProfileAlertService.updateStatusForUser({
    user: auth.session.user,
    notificationIds: parsed.data.notificationIds,
    status: parsed.data.status,
  });

  return ok(result);
}
