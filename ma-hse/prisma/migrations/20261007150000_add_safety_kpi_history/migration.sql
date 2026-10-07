CREATE TYPE "SafetyKpiHistorySource" AS ENUM ('HISTORICAL_IMPORT', 'MANUAL_IMPORT', 'SYSTEM_COMPUTED');
CREATE TYPE "SafetyKpiImportBatchStatus" AS ENUM ('PREVIEWED', 'IMPORTED', 'PARTIAL', 'FAILED');
CREATE TYPE "SafetyKpiImportRowStatus" AS ENUM ('NEW', 'INVALID', 'DUPLICATE_FILE', 'EXISTS_DB', 'IMPORTED', 'SKIPPED', 'ERROR');
CREATE TYPE "SafetyKpiImportRowAction" AS ENUM ('CREATE', 'SKIP', 'REPLACE', 'ERROR');

CREATE TABLE "SafetyKpiImportBatch" (
  "id" TEXT NOT NULL, "plantId" TEXT, "originalFileName" TEXT NOT NULL, "fileHash" TEXT NOT NULL,
  "storageKey" TEXT, "status" "SafetyKpiImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  "totalRows" INTEGER NOT NULL DEFAULT 0, "validRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0, "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "metadata" JSONB,
  CONSTRAINT "SafetyKpiImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SafetyKpiHistory" (
  "id" TEXT NOT NULL, "plantId" TEXT NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "hoursWorked" DECIMAL(14,2) NOT NULL, "employees" INTEGER NOT NULL, "accidents" INTEGER NOT NULL DEFAULT 0,
  "lostDays" DECIMAL(10,2) NOT NULL, "seriousInjury" INTEGER NOT NULL DEFAULT 0, "minorInjury" INTEGER NOT NULL DEFAULT 0,
  "firstAids" INTEGER NOT NULL DEFAULT 0, "nearMiss" INTEGER NOT NULL DEFAULT 0,
  "unsafeCondition" INTEGER NOT NULL DEFAULT 0, "unsafeAct" INTEGER NOT NULL DEFAULT 0,
  "sourceFrequencyRate" DECIMAL(16,6), "sourceGravityRate" DECIMAL(16,6),
  "source" "SafetyKpiHistorySource" NOT NULL DEFAULT 'HISTORICAL_IMPORT', "importBatchId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SafetyKpiHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetyKpiHistory_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "SafetyKpiHistory_nonnegative_check" CHECK ("hoursWorked" >= 0 AND "employees" >= 0 AND "accidents" >= 0 AND "lostDays" >= 0 AND "seriousInjury" >= 0 AND "minorInjury" >= 0 AND "firstAids" >= 0 AND "nearMiss" >= 0 AND "unsafeCondition" >= 0 AND "unsafeAct" >= 0)
);
CREATE TABLE "SafetyKpiImportRow" (
  "id" TEXT NOT NULL, "batchId" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL, "recordKey" TEXT,
  "status" "SafetyKpiImportRowStatus" NOT NULL, "action" "SafetyKpiImportRowAction", "rawData" JSONB,
  "normalizedData" JSONB, "messages" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafetyKpiImportRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SafetyKpiHistory_plantId_year_month_key" ON "SafetyKpiHistory"("plantId", "year", "month");
CREATE INDEX "SafetyKpiHistory_plantId_year_idx" ON "SafetyKpiHistory"("plantId", "year");
CREATE INDEX "SafetyKpiHistory_year_month_idx" ON "SafetyKpiHistory"("year", "month");
CREATE INDEX "SafetyKpiImportBatch_createdById_createdAt_idx" ON "SafetyKpiImportBatch"("createdById", "createdAt");
CREATE INDEX "SafetyKpiImportBatch_plantId_createdAt_idx" ON "SafetyKpiImportBatch"("plantId", "createdAt");
CREATE INDEX "SafetyKpiImportBatch_fileHash_idx" ON "SafetyKpiImportBatch"("fileHash");
CREATE INDEX "SafetyKpiImportRow_batchId_status_idx" ON "SafetyKpiImportRow"("batchId", "status");
CREATE INDEX "SafetyKpiImportRow_recordKey_idx" ON "SafetyKpiImportRow"("recordKey");
ALTER TABLE "SafetyKpiImportBatch" ADD CONSTRAINT "SafetyKpiImportBatch_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafetyKpiImportBatch" ADD CONSTRAINT "SafetyKpiImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SafetyKpiHistory" ADD CONSTRAINT "SafetyKpiHistory_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SafetyKpiHistory" ADD CONSTRAINT "SafetyKpiHistory_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SafetyKpiImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafetyKpiHistory" ADD CONSTRAINT "SafetyKpiHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafetyKpiImportRow" ADD CONSTRAINT "SafetyKpiImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SafetyKpiImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
