import { FireEquipmentAlertService } from "@/lib/services/fire-equipment-alert-service";
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";

/**
 * Daily job (§8): recomputes FireEquipmentComplianceState for every active
 * equipment in the plant — §3.6/§6, the periodic recompute trigger this
 * module never had before phase 4 (mirrors handleCompetenceExpiry calling
 * CompetenceService.recomputeAllStates) — then dispatches DUE_SOON/OVERDUE
 * and TAG_MISSING from the freshly computed rows. NON_CONFORMITY_FOUND is
 * not dispatched here: it is immediate, fired at write time from
 * fire-equipment-service.ts's recordExecution.
 */
export async function handleFireEquipmentDueDates(data: { plantId: string }) {
  const now = new Date();
  const computedRows = await FireEquipmentService.recomputeAllComplianceStates(data.plantId);
  await FireEquipmentAlertService.runDailyAlerts(data.plantId, computedRows, now);
}
