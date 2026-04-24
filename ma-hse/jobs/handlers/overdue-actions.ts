import { ActionService } from "@/lib/services/action-service";

export async function handleOverdueActions() {
  await ActionService.sendDueDateNotifications();
  await ActionService.sendOverdueNotifications();
}
