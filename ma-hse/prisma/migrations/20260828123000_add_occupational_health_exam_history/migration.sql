-- Keep the existing worker profile and document tables intact.  The new
-- examination history is additive and the legacy profile values are copied to
-- one initial examination per worker below.
ALTER TABLE "OccupationalHealthWorker"
  ADD COLUMN "employeeDirectoryId" TEXT;

ALTER TABLE "OccupationalHealthWorker"
  ALTER COLUMN "examDate" DROP NOT NULL;

-- Resolve the Admin relation once by the current employee number.  Subsequent
-- Admin number changes retain this stable foreign key.
UPDATE "OccupationalHealthWorker" ohw
SET "employeeDirectoryId" = ed."id"
FROM "EmployeeDirectory" ed
WHERE ed."plantId" = ohw."plantId"
  AND ed."employeeNo" = ohw."employeeNo";

CREATE UNIQUE INDEX "OccupationalHealthWorker_employeeDirectoryId_key"
  ON "OccupationalHealthWorker"("employeeDirectoryId");
CREATE INDEX "OccupationalHealthWorker_plantId_employeeDirectoryId_idx"
  ON "OccupationalHealthWorker"("plantId", "employeeDirectoryId");

ALTER TABLE "OccupationalHealthWorker"
  ADD CONSTRAINT "OccupationalHealthWorker_employeeDirectoryId_fkey"
  FOREIGN KEY ("employeeDirectoryId") REFERENCES "EmployeeDirectory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OccupationalHealthExam" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "occupationalHealthWorkerId" TEXT NOT NULL,
  "examDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OccupationalHealthExam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OccupationalHealthExamAttachment" (
  "id" TEXT NOT NULL,
  "occupationalHealthExamId" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedById" TEXT,
  CONSTRAINT "OccupationalHealthExamAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OccupationalHealthExam_occupationalHealthWorkerId_examDate_idx"
  ON "OccupationalHealthExam"("occupationalHealthWorkerId", "examDate");
CREATE INDEX "OccupationalHealthExam_plantId_examDate_idx"
  ON "OccupationalHealthExam"("plantId", "examDate");
CREATE INDEX "OccupationalHealthExamAttachment_occupationalHealthExamId_idx"
  ON "OccupationalHealthExamAttachment"("occupationalHealthExamId");

ALTER TABLE "OccupationalHealthExam"
  ADD CONSTRAINT "OccupationalHealthExam_plantId_fkey"
  FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OccupationalHealthExam"
  ADD CONSTRAINT "OccupationalHealthExam_occupationalHealthWorkerId_fkey"
  FOREIGN KEY ("occupationalHealthWorkerId") REFERENCES "OccupationalHealthWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OccupationalHealthExamAttachment"
  ADD CONSTRAINT "OccupationalHealthExamAttachment_occupationalHealthExamId_fkey"
  FOREIGN KEY ("occupationalHealthExamId") REFERENCES "OccupationalHealthExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OccupationalHealthExamAttachment"
  ADD CONSTRAINT "OccupationalHealthExamAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The previous profile stored one summary examination.  Preserve it as the
-- first history entry.  Legacy status values are mapped to the new clinical
-- vocabulary while the original profile row remains untouched for audit and
-- rollback purposes. A missing validity date is represented by the exam date,
-- which respects the new valid-until validation without discarding the exam.
INSERT INTO "OccupationalHealthExam" (
  "id", "plantId", "occupationalHealthWorkerId", "examDate", "validUntil",
  "status", "createdAt", "updatedAt"
)
SELECT
  'legacy-exam-' || ohw."id",
  ohw."plantId",
  ohw."id",
  ohw."examDate",
  GREATEST(COALESCE(ohw."validUntil", ohw."examDate"), ohw."examDate"),
  CASE ohw."status"
    WHEN 'EXPIRED' THEN 'UNFIT'
    WHEN 'VALID' THEN 'FIT'
    ELSE 'FIT_CONDITIONAL'
  END,
  ohw."createdAt",
  ohw."updatedAt"
FROM "OccupationalHealthWorker" ohw;

-- Do not remove the old attachment rows. Copy their metadata to the migrated
-- legacy examination so documents remain available in the new history table.
INSERT INTO "OccupationalHealthExamAttachment" (
  "id", "occupationalHealthExamId", "fileKey", "fileName", "contentType",
  "createdAt", "uploadedById"
)
SELECT
  'legacy-exam-attachment-' || a."id",
  'legacy-exam-' || a."occupationalHealthWorkerId",
  a."fileKey",
  a."fileName",
  a."contentType",
  a."createdAt",
  a."uploadedById"
FROM "OccupationalHealthWorkerAttachment" a;
