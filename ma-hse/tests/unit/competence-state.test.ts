import { AuthorizationStatus, CompetenceAssessmentResult, CompetenceCellState, TrainingResult } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED,
  BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED,
  computeCompetenceCellState,
  type AssessmentForState,
  type AuthorizationForState,
  type ComputeCompetenceCellStateInput,
  type TrainingRecordForState,
} from "@/lib/services/competence-state-service";

const NOW = new Date("2027-01-15T10:00:00.000Z");

function baseInput(overrides: Partial<ComputeCompetenceCellStateInput> = {}): ComputeCompetenceCellStateInput {
  return {
    now: NOW,
    isRequired: true,
    requirementSource: "ALL_WORKERS",
    requiresAssessment: true,
    authorizations: [],
    trainingRecords: [],
    assessments: [],
    expiringThresholdDays: 90,
    medicalFitnessBlocksAuthorization: false,
    medicalFitnessExpired: false,
    ...overrides,
  };
}

function authorization(overrides: Partial<AuthorizationForState> = {}): AuthorizationForState {
  return {
    id: "auth-1",
    status: AuthorizationStatus.ACTIVE,
    validUntil: new Date("2027-06-01T00:00:00.000Z"),
    suspensionReason: null,
    revocationReason: null,
    trainingRecordId: null,
    grantedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

function training(overrides: Partial<TrainingRecordForState> = {}): TrainingRecordForState {
  return {
    id: "training-1",
    result: TrainingResult.PASSED,
    completedAt: new Date("2026-06-01T00:00:00.000Z"),
    certificateExpiresAt: null,
    ...overrides,
  };
}

function assessment(overrides: Partial<AssessmentForState> = {}): AssessmentForState {
  return {
    id: "assessment-1",
    result: CompetenceAssessmentResult.COMPETENT,
    assessedAt: new Date("2026-06-15T00:00:00.000Z"),
    trainingRecordId: null,
    ...overrides,
  };
}

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("computeCompetenceCellState — step 1 (requirement)", () => {
  it("returns NOT_APPLICABLE when not required and there is no active authorization", () => {
    const result = computeCompetenceCellState(baseInput({ isRequired: false, requirementSource: null }));
    expect(result.state).toBe(CompetenceCellState.NOT_APPLICABLE);
    expect(result.currentAuthorizationId).toBeNull();
  });

  it("shows the real state, not NOT_APPLICABLE, when no longer required but an ACTIVE authorization exists", () => {
    const auth = authorization({ validUntil: daysFromNow(200) });
    const result = computeCompetenceCellState(
      baseInput({ isRequired: false, requirementSource: null, authorizations: [auth] }),
    );
    expect(result.state).toBe(CompetenceCellState.VALID);
    expect(result.currentAuthorizationId).toBe(auth.id);
  });
});

describe("computeCompetenceCellState — step 3 (manual suspension)", () => {
  it("returns SUSPENDED with the free-text suspension reason", () => {
    const auth = authorization({ status: AuthorizationStatus.SUSPENDED, suspensionReason: "Queixas de manuseamento inseguro" });
    const result = computeCompetenceCellState(baseInput({ authorizations: [auth] }));
    expect(result.state).toBe(CompetenceCellState.SUSPENDED);
    expect(result.blockedReason).toBe("Queixas de manuseamento inseguro");
    expect(result.currentAuthorizationId).toBe(auth.id);
  });
});

describe("computeCompetenceCellState — step 4 (medical fitness, dead by default)", () => {
  it("returns SUSPENDED for medical reasons when the parameter is on and fitness has expired, carrying over the active authorization", () => {
    const auth = authorization({ validUntil: daysFromNow(200) });
    const result = computeCompetenceCellState(
      baseInput({ authorizations: [auth], medicalFitnessBlocksAuthorization: true, medicalFitnessExpired: true }),
    );
    expect(result.state).toBe(CompetenceCellState.SUSPENDED);
    expect(result.blockedReason).toBe(BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED);
    expect(result.currentAuthorizationId).toBe(auth.id);
  });

  it("fires even without any authorization at all, per the literal step order", () => {
    const result = computeCompetenceCellState(
      baseInput({ medicalFitnessBlocksAuthorization: true, medicalFitnessExpired: true }),
    );
    expect(result.state).toBe(CompetenceCellState.SUSPENDED);
    expect(result.blockedReason).toBe(BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED);
    expect(result.currentAuthorizationId).toBeNull();
  });

  it("stays dead (no effect) while the parameter is off, even if fitness has expired", () => {
    const auth = authorization({ validUntil: daysFromNow(200) });
    const result = computeCompetenceCellState(
      baseInput({ authorizations: [auth], medicalFitnessBlocksAuthorization: false, medicalFitnessExpired: true }),
    );
    expect(result.state).toBe(CompetenceCellState.VALID);
  });
});

describe("computeCompetenceCellState — step 5 (active authorization)", () => {
  it("returns EXPIRED when the supporting training certificate has lapsed, even though the authorization stays ACTIVE", () => {
    const trainingRecord = training({ certificateExpiresAt: daysFromNow(-10) });
    const auth = authorization({ trainingRecordId: trainingRecord.id, validUntil: daysFromNow(200) });
    const result = computeCompetenceCellState(
      baseInput({ authorizations: [auth], trainingRecords: [trainingRecord] }),
    );
    expect(result.state).toBe(CompetenceCellState.EXPIRED);
    expect(result.blockedReason).toBe(BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED);
    expect(result.validUntil).toEqual(auth.validUntil);
  });

  it("returns EXPIRED when validUntil is in the past", () => {
    const auth = authorization({ validUntil: daysFromNow(-1) });
    const result = computeCompetenceCellState(baseInput({ authorizations: [auth] }));
    expect(result.state).toBe(CompetenceCellState.EXPIRED);
    expect(result.blockedReason).toBeNull();
    expect(result.daysToExpiry).toBe(-1);
  });

  it.each([
    [0, CompetenceCellState.EXPIRING],
    [1, CompetenceCellState.EXPIRING],
    [90, CompetenceCellState.EXPIRING],
    [91, CompetenceCellState.VALID],
  ])("classifies a %i-day-to-expiry authorization as %s (90-day threshold)", (days, expectedState) => {
    const auth = authorization({ validUntil: daysFromNow(days) });
    const result = computeCompetenceCellState(baseInput({ authorizations: [auth], expiringThresholdDays: 90 }));
    expect(result.state).toBe(expectedState);
    expect(result.daysToExpiry).toBe(days);
  });

  it("returns VALID well before expiry", () => {
    const auth = authorization({ validUntil: daysFromNow(200) });
    const result = computeCompetenceCellState(baseInput({ authorizations: [auth] }));
    expect(result.state).toBe(CompetenceCellState.VALID);
    expect(result.currentAuthorizationId).toBe(auth.id);
  });
});

describe("computeCompetenceCellState — step 6 (revoked)", () => {
  it("returns REVOKED with the revocation reason when it is the most recent authorization overall", () => {
    const auth = authorization({
      id: "auth-revoked",
      status: AuthorizationStatus.REVOKED,
      revocationReason: "Incidente com equipamento",
      grantedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const result = computeCompetenceCellState(baseInput({ authorizations: [auth] }));
    expect(result.state).toBe(CompetenceCellState.REVOKED);
    expect(result.blockedReason).toBe("Incidente com equipamento");
    expect(result.currentAuthorizationId).toBe(auth.id);
  });

  it("does not fire when a later (superseded) authorization exists, falling through instead", () => {
    const revoked = authorization({
      id: "auth-revoked",
      status: AuthorizationStatus.REVOKED,
      grantedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const superseded = authorization({
      id: "auth-superseded",
      status: AuthorizationStatus.SUPERSEDED,
      grantedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const result = computeCompetenceCellState(baseInput({ authorizations: [revoked, superseded] }));
    expect(result.state).not.toBe(CompetenceCellState.REVOKED);
  });
});

describe("computeCompetenceCellState — step 7 (competent assessment awaiting authorization)", () => {
  it("returns AWAITING_AUTHORIZATION when the most recent COMPETENT assessment has a valid supporting training", () => {
    const trainingRecord = training();
    const assessed = assessment({ trainingRecordId: trainingRecord.id });
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [trainingRecord], assessments: [assessed] }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_AUTHORIZATION);
  });

  it("falls through to the training branch when the supporting training's certificate has expired", () => {
    const trainingRecord = training({ certificateExpiresAt: daysFromNow(-5) });
    const assessed = assessment({ trainingRecordId: trainingRecord.id });
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [trainingRecord], assessments: [assessed] }),
    );
    expect(result.state).toBe(CompetenceCellState.EXPIRED);
  });

  it("counts a competent assessment with no linked training as valid support — nothing to check an expiry date against (§5 fix, item 5)", () => {
    const assessed = assessment({ trainingRecordId: null });
    const result = computeCompetenceCellState(baseInput({ assessments: [assessed] }));
    expect(result.state).toBe(CompetenceCellState.AWAITING_AUTHORIZATION);
  });

  it("takes precedence over a separate passed training record: an unlinked COMPETENT assessment never falls back to AWAITING_ASSESSMENT (item 5)", () => {
    const passedTraining = training();
    const assessed = assessment({ trainingRecordId: null });
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [passedTraining], assessments: [assessed], requiresAssessment: true }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_AUTHORIZATION);
  });
});

describe("computeCompetenceCellState — step 8 (passed training)", () => {
  it("returns AWAITING_ASSESSMENT when the competence requires a practical assessment", () => {
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [training()], requiresAssessment: true }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_ASSESSMENT);
  });

  it("returns AWAITING_AUTHORIZATION when no assessment is required", () => {
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [training()], requiresAssessment: false }),
    );
    expect(result.state).toBe(CompetenceCellState.AWAITING_AUTHORIZATION);
  });

  it("returns EXPIRED when the training passed but its certificate has already lapsed", () => {
    const result = computeCompetenceCellState(
      baseInput({ trainingRecords: [training({ certificateExpiresAt: daysFromNow(-1) })] }),
    );
    expect(result.state).toBe(CompetenceCellState.EXPIRED);
    expect(result.blockedReason).toBe(BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED);
  });
});

describe("computeCompetenceCellState — step 9 (missing)", () => {
  it("returns MISSING when there is no record of any kind", () => {
    const result = computeCompetenceCellState(baseInput());
    expect(result.state).toBe(CompetenceCellState.MISSING);
  });

  it("returns MISSING when the only records are a failed training and a not-yet-competent assessment", () => {
    const result = computeCompetenceCellState(
      baseInput({
        trainingRecords: [training({ result: TrainingResult.FAILED })],
        assessments: [assessment({ result: CompetenceAssessmentResult.NOT_YET_COMPETENT })],
      }),
    );
    expect(result.state).toBe(CompetenceCellState.MISSING);
  });
});

describe("computeCompetenceCellState — DST transitions (Europe/Lisbon)", () => {
  it("counts exactly 2 calendar days across the March 2026 spring-forward (29th)", () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const validUntil = new Date("2026-03-30T00:00:00.000Z");
    const auth = authorization({ validUntil });

    const expiring = computeCompetenceCellState(
      baseInput({ now, authorizations: [auth], expiringThresholdDays: 2 }),
    );
    expect(expiring.daysToExpiry).toBe(2);
    expect(expiring.state).toBe(CompetenceCellState.EXPIRING);

    const valid = computeCompetenceCellState(
      baseInput({ now, authorizations: [auth], expiringThresholdDays: 1 }),
    );
    expect(valid.state).toBe(CompetenceCellState.VALID);
  });

  it("counts exactly 2 calendar days across the October 2026 fall-back (25th)", () => {
    const now = new Date("2026-10-24T00:00:00.000Z");
    const validUntil = new Date("2026-10-26T00:00:00.000Z");
    const auth = authorization({ validUntil });

    const expiring = computeCompetenceCellState(
      baseInput({ now, authorizations: [auth], expiringThresholdDays: 2 }),
    );
    expect(expiring.daysToExpiry).toBe(2);
    expect(expiring.state).toBe(CompetenceCellState.EXPIRING);

    const valid = computeCompetenceCellState(
      baseInput({ now, authorizations: [auth], expiringThresholdDays: 1 }),
    );
    expect(valid.state).toBe(CompetenceCellState.VALID);
  });
});
