import {
  AuthorizationStatus,
  CompetenceAssessmentResult,
  CompetenceCellState,
  TrainingResult,
} from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * §5 of docs/modulo-competencias-autorizacoes.md. Evaluated top to bottom,
 * first matching step wins — do not reorder the steps below.
 */
export const COMPETENCE_TIMEZONE = "Europe/Lisbon";

/** Stable codes (not free text) for blockedReason when the algorithm itself
 * generates the explanation, so the UI can localize them. Free-text reasons
 * (suspensionReason / revocationReason, typed by a person) pass through as-is. */
export const BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED = "MEDICAL_FITNESS_EXPIRED";
export const BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED = "TRAINING_CERTIFICATE_EXPIRED";

export type AuthorizationForState = {
  id: string;
  status: AuthorizationStatus;
  validUntil: Date;
  suspensionReason: string | null;
  revocationReason: string | null;
  trainingRecordId: string | null;
  grantedAt: Date;
};

export type TrainingRecordForState = {
  id: string;
  result: TrainingResult;
  completedAt: Date;
  certificateExpiresAt: Date | null;
};

export type AssessmentForState = {
  id: string;
  result: CompetenceAssessmentResult;
  assessedAt: Date;
  trainingRecordId: string | null;
};

export type ComputeCompetenceCellStateInput = {
  now: Date;
  isRequired: boolean;
  requirementSource: string | null;
  requiresAssessment: boolean;
  authorizations: AuthorizationForState[];
  trainingRecords: TrainingRecordForState[];
  assessments: AssessmentForState[];
  expiringThresholdDays: number;
  medicalFitnessBlocksAuthorization: boolean;
  medicalFitnessExpired: boolean;
};

export type ComputedCompetenceCellState = {
  state: CompetenceCellState;
  isRequired: boolean;
  requirementSource: string | null;
  validUntil: Date | null;
  daysToExpiry: number | null;
  currentAuthorizationId: string | null;
  blockedReason: string | null;
};

function daysUntil(target: Date, zonedToday: Date): number {
  return differenceInCalendarDays(toZonedTime(target, COMPETENCE_TIMEZONE), zonedToday);
}

function isBeforeToday(target: Date, zonedToday: Date): boolean {
  return daysUntil(target, zonedToday) < 0;
}

function latestBy<T>(items: T[], getDate: (item: T) => Date): T | null {
  return items.reduce<T | null>((latest, item) => {
    if (!latest || getDate(item).getTime() > getDate(latest).getTime()) return item;
    return latest;
  }, null);
}

export function computeCompetenceCellState(input: ComputeCompetenceCellStateInput): ComputedCompetenceCellState {
  const zonedToday = toZonedTime(input.now, COMPETENCE_TIMEZONE);
  const base = { isRequired: input.isRequired, requirementSource: input.requirementSource };

  // Step 1 — deliberate exception: NOT_APPLICABLE is reserved for a
  // competence that is neither required nor has ANY record at all. A worker
  // with a PASSED training and a COMPETENT assessment, but no requirement and
  // no authorization, must not read "Not required" — that hides completed
  // work, which is worse than showing the real (pending) state.
  const hasAnyRecord =
    input.authorizations.length > 0
    || input.trainingRecords.length > 0
    || input.assessments.length > 0;
  if (!input.isRequired && !hasAnyRecord) {
    return {
      ...base,
      state: CompetenceCellState.NOT_APPLICABLE,
      validUntil: null,
      daysToExpiry: null,
      currentAuthorizationId: null,
      blockedReason: null,
    };
  }

  // Step 2
  const currentAuthorization = latestBy(
    input.authorizations.filter((a) => a.status === AuthorizationStatus.ACTIVE || a.status === AuthorizationStatus.SUSPENDED),
    (a) => a.grantedAt,
  );

  // Step 3
  if (currentAuthorization && currentAuthorization.status === AuthorizationStatus.SUSPENDED) {
    return {
      ...base,
      state: CompetenceCellState.SUSPENDED,
      validUntil: currentAuthorization.validUntil,
      daysToExpiry: null,
      currentAuthorizationId: currentAuthorization.id,
      blockedReason: currentAuthorization.suspensionReason,
    };
  }

  // Step 4 — dead while MEDICAL_FITNESS_BLOCKS_AUTHORIZATION defaults to
  // false; kept in exact pseudocode position so enabling the parameter later
  // never requires touching this algorithm.
  if (input.medicalFitnessBlocksAuthorization && input.medicalFitnessExpired) {
    return {
      ...base,
      state: CompetenceCellState.SUSPENDED,
      validUntil: currentAuthorization?.validUntil ?? null,
      daysToExpiry: null,
      currentAuthorizationId: currentAuthorization?.id ?? null,
      blockedReason: BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED,
    };
  }

  // Step 5 — the authorization's own validity governs the cell, but a lapsed
  // supporting training certificate overrides it to EXPIRED even though the
  // authorization row itself stays ACTIVE in the database (§2.4).
  if (currentAuthorization && currentAuthorization.status === AuthorizationStatus.ACTIVE) {
    const supportingTraining = currentAuthorization.trainingRecordId
      ? input.trainingRecords.find((t) => t.id === currentAuthorization.trainingRecordId) ?? null
      : null;

    if (supportingTraining?.certificateExpiresAt && isBeforeToday(supportingTraining.certificateExpiresAt, zonedToday)) {
      return {
        ...base,
        state: CompetenceCellState.EXPIRED,
        validUntil: currentAuthorization.validUntil,
        daysToExpiry: daysUntil(currentAuthorization.validUntil, zonedToday),
        currentAuthorizationId: currentAuthorization.id,
        blockedReason: BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED,
      };
    }

    const daysToExpiry = daysUntil(currentAuthorization.validUntil, zonedToday);

    if (daysToExpiry < 0) {
      return {
        ...base,
        state: CompetenceCellState.EXPIRED,
        validUntil: currentAuthorization.validUntil,
        daysToExpiry,
        currentAuthorizationId: currentAuthorization.id,
        blockedReason: null,
      };
    }

    if (daysToExpiry <= input.expiringThresholdDays) {
      return {
        ...base,
        state: CompetenceCellState.EXPIRING,
        validUntil: currentAuthorization.validUntil,
        daysToExpiry,
        currentAuthorizationId: currentAuthorization.id,
        blockedReason: null,
      };
    }

    return {
      ...base,
      state: CompetenceCellState.VALID,
      validUntil: currentAuthorization.validUntil,
      daysToExpiry,
      currentAuthorizationId: currentAuthorization.id,
      blockedReason: null,
    };
  }

  // Step 6 — "no later authorization" is equivalent to the most recent
  // authorization overall (by grantedAt) being the revoked one.
  const mostRecentOverall = latestBy(input.authorizations, (a) => a.grantedAt);
  if (mostRecentOverall && mostRecentOverall.status === AuthorizationStatus.REVOKED) {
    return {
      ...base,
      state: CompetenceCellState.REVOKED,
      validUntil: mostRecentOverall.validUntil,
      daysToExpiry: null,
      currentAuthorizationId: mostRecentOverall.id,
      blockedReason: mostRecentOverall.revocationReason,
    };
  }

  // Step 7. trainingRecordId is optional on CompetenceAssessment (§3.5) — an
  // assessment without a linked training record is not "unsupported", it
  // simply has nothing to check an expiry date against, so it counts as
  // valid. Requiring the link here would strand an already-competent worker
  // in AWAITING_ASSESSMENT (step 8) forever, since registering another
  // assessment doesn't retroactively add the missing link.
  const competentAssessment = latestBy(
    input.assessments.filter((a) => a.result === CompetenceAssessmentResult.COMPETENT),
    (a) => a.assessedAt,
  );
  if (competentAssessment) {
    const supportingTraining = competentAssessment.trainingRecordId
      ? input.trainingRecords.find((t) => t.id === competentAssessment.trainingRecordId) ?? null
      : null;
    const supportingTrainingValid = supportingTraining
      ? !(supportingTraining.certificateExpiresAt && isBeforeToday(supportingTraining.certificateExpiresAt, zonedToday))
      : true;

    if (supportingTrainingValid) {
      return {
        ...base,
        state: CompetenceCellState.AWAITING_AUTHORIZATION,
        validUntil: null,
        daysToExpiry: null,
        currentAuthorizationId: null,
        blockedReason: null,
      };
    }
  }

  // Step 8
  const passedTraining = latestBy(
    input.trainingRecords.filter((t) => t.result === TrainingResult.PASSED),
    (t) => t.completedAt,
  );
  if (passedTraining) {
    if (passedTraining.certificateExpiresAt && isBeforeToday(passedTraining.certificateExpiresAt, zonedToday)) {
      return {
        ...base,
        state: CompetenceCellState.EXPIRED,
        validUntil: null,
        daysToExpiry: null,
        currentAuthorizationId: null,
        blockedReason: BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED,
      };
    }
    if (input.requiresAssessment) {
      return {
        ...base,
        state: CompetenceCellState.AWAITING_ASSESSMENT,
        validUntil: null,
        daysToExpiry: null,
        currentAuthorizationId: null,
        blockedReason: null,
      };
    }
    return {
      ...base,
      state: CompetenceCellState.AWAITING_AUTHORIZATION,
      validUntil: null,
      daysToExpiry: null,
      currentAuthorizationId: null,
      blockedReason: null,
    };
  }

  // Step 9
  return {
    ...base,
    state: CompetenceCellState.MISSING,
    validUntil: null,
    daysToExpiry: null,
    currentAuthorizationId: null,
    blockedReason: null,
  };
}
