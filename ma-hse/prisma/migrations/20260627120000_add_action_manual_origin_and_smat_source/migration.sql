CREATE TYPE "ActionManualOrigin" AS ENUM ('AUDITS', 'EXTERNAL_VERIFICATIONS', 'OTHER');

ALTER TYPE "ActionSourceType" ADD VALUE IF NOT EXISTS 'SMAT';

ALTER TABLE "Action" ADD COLUMN "manualOrigin" "ActionManualOrigin";
