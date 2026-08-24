import { CompetenceAlertService } from "@/lib/services/competence-alert-service";
import { CompetenceService } from "@/lib/services/competence-service";

/**
 * Daily job (§7.2 table): recomputes every WorkerCompetenceState for the
 * plant first — §3.7(c), the third recompute trigger, capturing the passage
 * of time — then dispatches EXPIRING_90/60/30/7, EXPIRY_DAY,
 * MISSING_DOCUMENT and (on the designated weekly day) AWAITING_ASSESSMENT
 * from the freshly computed states.
 */
export async function handleCompetenceExpiry(data: { plantId: string }) {
  const now = new Date();
  const computedStates = await CompetenceService.recomputeAllStates(data.plantId);
  await CompetenceAlertService.runDailyAlerts(data.plantId, computedStates, now);
}
