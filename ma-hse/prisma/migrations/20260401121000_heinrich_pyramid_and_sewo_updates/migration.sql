ALTER TYPE "LeaveClassification" RENAME VALUE 'LE_30' TO 'MINOR';
ALTER TYPE "LeaveClassification" RENAME VALUE 'GT_30' TO 'SERIOUS';
ALTER TYPE "LeaveClassification" ADD VALUE IF NOT EXISTS 'FATAL';

ALTER TABLE "Communication"
ADD COLUMN "suggestedAction" TEXT,
ADD COLUMN "isFatal" BOOLEAN DEFAULT false,
ADD COLUMN "initialLostDays" INTEGER;

ALTER TABLE "Action"
ADD COLUMN "sequenceNumber" INTEGER;

WITH ordered_actions AS (
  SELECT "id", "plantId", ROW_NUMBER() OVER (PARTITION BY "plantId" ORDER BY "createdAt", "id") AS seq
  FROM "Action"
)
UPDATE "Action"
SET "sequenceNumber" = ordered_actions.seq
FROM ordered_actions
WHERE "Action"."id" = ordered_actions."id";

CREATE UNIQUE INDEX "Action_plantId_sequenceNumber_key" ON "Action"("plantId", "sequenceNumber");

ALTER TABLE "SEWO"
ADD COLUMN "templateData" JSONB,
ADD COLUMN "isAutoCreated" BOOLEAN NOT NULL DEFAULT false;
