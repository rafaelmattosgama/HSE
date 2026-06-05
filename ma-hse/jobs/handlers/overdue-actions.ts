import { ActionAlertService } from "@/lib/services/action-alert-service";

export async function handleOverdueActions(data: { plantId?: string } = {}) {
  await ActionAlertService.sendThreeDaysBeforeDueDateAlerts({ plantId: data.plantId });
  await ActionAlertService.sendOverdueActionAlerts({ plantId: data.plantId });
}
