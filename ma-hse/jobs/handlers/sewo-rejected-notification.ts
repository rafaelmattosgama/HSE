import { SewaService } from "@/lib/services/sewo-service";

export type SewoRejectedNotificationJob = {
  sewoId: string;
  actorUserId: string;
  approvalComment: string;
};

export async function handleSewoRejectedNotification(data: SewoRejectedNotificationJob) {
  if (!data || typeof data.sewoId !== "string" || !data.sewoId.trim()) {
    throw new Error("Invalid S-EWO rejected notification job payload");
  }

  await SewaService.sendRejectedNotifications(data.sewoId, data.actorUserId, data.approvalComment);
}
