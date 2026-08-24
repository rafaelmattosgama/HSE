import { CompetenceCellState } from "@prisma/client";
import {
  BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED,
  BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED,
} from "@/lib/services/competence-state-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type CellLike = {
  state: CompetenceCellState | string;
  validUntil: Date | string | null;
  daysToExpiry: number | null;
};

function formatMonthYear(value: Date | string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "2-digit", year: "numeric" });
}

/** §4: cell text is dynamic (date / days), never a static label alone. */
export function formatCompetenceCellText(cell: CellLike, labels: CompetencesUiDictionary): string {
  switch (cell.state) {
    case CompetenceCellState.VALID:
      return cell.validUntil ? labels.cellValidUntil.replace("{date}", formatMonthYear(cell.validUntil)) : labels.stateValid;
    case CompetenceCellState.EXPIRING:
      return cell.daysToExpiry != null
        ? labels.cellExpiringInDays.replace("{days}", String(cell.daysToExpiry))
        : labels.stateExpiring;
    case CompetenceCellState.EXPIRED:
      return cell.validUntil ? labels.cellExpiredOn.replace("{date}", formatMonthYear(cell.validUntil)) : labels.stateExpired;
    case CompetenceCellState.MISSING:
      return labels.stateMissing;
    case CompetenceCellState.AWAITING_ASSESSMENT:
      return labels.stateAwaitingAssessment;
    case CompetenceCellState.AWAITING_AUTHORIZATION:
      return labels.stateAwaitingAuthorization;
    case CompetenceCellState.SUSPENDED:
      return labels.stateSuspended;
    case CompetenceCellState.REVOKED:
      return labels.stateRevoked;
    case CompetenceCellState.NOT_APPLICABLE:
      return labels.stateNotApplicable;
    default:
      return cell.state;
  }
}

/** §2.4: a lapsed training certificate or (dead by default) medical fitness
 * check produce a stable code, not free text — translate it here. Anything
 * else is a person's own suspension/revocation reason and passes through. */
export function formatCompetenceBlockedReason(blockedReason: string | null, labels: CompetencesUiDictionary): string | null {
  if (!blockedReason) return null;
  if (blockedReason === BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED) return labels.cellBlockedTrainingExpired;
  if (blockedReason === BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED) return labels.cellBlockedMedicalExpired;
  return blockedReason;
}
