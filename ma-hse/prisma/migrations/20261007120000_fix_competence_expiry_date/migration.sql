-- Repair the cached date only: retain source training and authorization records.
-- A lapsed certificate must never display the authorization's later expiry date.
UPDATE "WorkerCompetenceState" AS cell_state
SET "validUntil" = LEAST(auth_record."validUntil", training."certificateExpiresAt"),
    "daysToExpiry" =
      (LEAST(auth_record."validUntil", training."certificateExpiresAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Lisbon')::date
      - (cell_state."computedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Lisbon')::date
FROM "WorkerAuthorization" AS auth_record
JOIN "TrainingRecord" AS training ON training.id = auth_record."trainingRecordId"
WHERE cell_state."currentAuthorizationId" = auth_record.id
  AND cell_state."plantId" = auth_record."plantId"
  AND cell_state.state = 'EXPIRED'
  AND cell_state."blockedReason" = 'TRAINING_CERTIFICATE_EXPIRED'
  AND training."certificateExpiresAt" IS NOT NULL;
