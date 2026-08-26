import type { RoleCode } from "@prisma/client";
import { SewaService } from "@/lib/services/sewo-service";

export type SewoSubmittedNotificationJob = {
  sewoId: string;
  actorRole: RoleCode | null;
};

export async function handleSewoSubmittedNotification(data: SewoSubmittedNotificationJob) {
  if (!data || typeof data.sewoId !== "string" || !data.sewoId.trim()) {
    throw new Error("Invalid S-EWO submitted notification job payload");
  }

  await SewaService.sendSubmittedNotifications(data.sewoId, data.actorRole ?? null);
}
