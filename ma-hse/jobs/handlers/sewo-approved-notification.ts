import { SewaService } from "@/lib/services/sewo-service";

export type SewoApprovedNotificationJob = {
  sewoId: string;
};

export async function handleSewoApprovedNotification(data: SewoApprovedNotificationJob) {
  if (!data || typeof data.sewoId !== "string" || !data.sewoId.trim()) {
    throw new Error("Invalid S-EWO approved notification job payload");
  }

  await SewaService.sendApprovedNotifications(data.sewoId);
}
