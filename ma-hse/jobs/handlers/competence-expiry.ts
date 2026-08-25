import { AuthorizationStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { CompetenceAlertService } from "@/lib/services/competence-alert-service";
import { CompetenceService } from "@/lib/services/competence-service";
import { COMPETENCE_TIMEZONE } from "@/lib/services/competence-state-service";

/**
 * Daily job (§7.2 table): materializes AuthorizationStatus.EXPIRED for every
 * ACTIVE row whose validUntil has already passed (item 7 — the status was
 * never written anywhere before this, so an expired authorization stayed
 * ACTIVE forever and could still be "suspended" as a cautionary measure,
 * masking the expiry behind it); recomputes every WorkerCompetenceState for
 * the plant next — §3.7(c), the third recompute trigger, capturing the
 * passage of time — then dispatches EXPIRING_90/60/30/7, EXPIRY_DAY,
 * MISSING_DOCUMENT, ROLE_WITHOUT_COMPETENCE and (on the designated weekly
 * day) AWAITING_ASSESSMENT from the freshly computed states.
 */
export async function handleCompetenceExpiry(data: { plantId: string }) {
  const now = new Date();
  const startOfTodayLisbon = fromZonedTime(startOfDay(toZonedTime(now, COMPETENCE_TIMEZONE)), COMPETENCE_TIMEZONE);

  await prisma.workerAuthorization.updateMany({
    where: {
      plantId: data.plantId,
      status: AuthorizationStatus.ACTIVE,
      validUntil: { lt: startOfTodayLisbon },
    },
    data: { status: AuthorizationStatus.EXPIRED },
  });

  const computedStates = await CompetenceService.recomputeAllStates(data.plantId);
  await CompetenceAlertService.runDailyAlerts(data.plantId, computedStates, now);
}
