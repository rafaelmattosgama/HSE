-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "IncidentKnowledgeSourceType" AS ENUM ('HISTORICAL_PDF', 'CURRENT_SEWO');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeExtractionStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'PENDING_REVIEW', 'APPROVED', 'INDEXING', 'INDEXED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeCauseAssessment" AS ENUM ('CONFIRMED', 'REJECTED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeActionStatus" AS ENUM ('UNKNOWN', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeEvidenceStatus" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentKnowledgeBatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateTable
CREATE TABLE "IncidentKnowledgeImportBatch" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "status" "IncidentKnowledgeBatchStatus" NOT NULL DEFAULT 'QUEUED',
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeDocument" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "sourceType" "IncidentKnowledgeSourceType" NOT NULL DEFAULT 'HISTORICAL_PDF',
    "sourceReference" TEXT,
    "sourceSewoId" TEXT,
    "originalFilename" TEXT,
    "originalFileKey" TEXT,
    "fileHash" CHAR(64),
    "fileSize" BIGINT,
    "mimeType" TEXT,
    "documentVersion" INTEGER NOT NULL DEFAULT 1,
    "incidentDate" DATE,
    "incidentType" TEXT,
    "documentLanguage" VARCHAR(10),
    "extractionStatus" "IncidentKnowledgeExtractionStatus" NOT NULL DEFAULT 'UPLOADED',
    "reviewStatus" "IncidentKnowledgeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "indexedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "lastError" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeRecord" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "incidentCode" TEXT,
    "incidentDate" DATE,
    "department" TEXT,
    "workstation" TEXT,
    "equipment" TEXT,
    "shift" TEXT,
    "operationType" TEXT,
    "occurrenceDescription" TEXT,
    "occurrenceMechanism" TEXT,
    "injuryType" TEXT,
    "bodyPart" TEXT,
    "consequence" TEXT,
    "immediateCorrectiveAction" TEXT,
    "lessonsLearned" TEXT,
    "previousRelatedOccurrences" TEXT,
    "sifPsifClassification" TEXT,
    "extractionConfidence" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeEvidence" (
    "id" TEXT NOT NULL,
    "incidentRecordId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "extractedValue" TEXT,
    "supportingExcerpt" TEXT,
    "sourcePage" INTEGER,
    "sourceSection" TEXT,
    "confidence" DOUBLE PRECISION,
    "validationStatus" "IncidentKnowledgeEvidenceStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeCause" (
    "id" TEXT NOT NULL,
    "incidentRecordId" TEXT NOT NULL,
    "originalCauseCode" TEXT,
    "originalCauseLabel" TEXT,
    "originalTaxonomyVersion" TEXT,
    "normalizedCauseCode" TEXT,
    "normalizedCategory" TEXT,
    "description" TEXT,
    "assessmentStatus" "IncidentKnowledgeCauseAssessment" NOT NULL DEFAULT 'UNCERTAIN',
    "sourcePage" INTEGER,
    "sourceSection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeCause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeAction" (
    "id" TEXT NOT NULL,
    "incidentRecordId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionType" TEXT,
    "responsible" TEXT,
    "plannedClosureDate" DATE,
    "actualClosureDate" DATE,
    "status" "IncidentKnowledgeActionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sourcePage" INTEGER,
    "sourceSection" TEXT,
    "linkedActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentKnowledgeAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "sectionName" TEXT,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "content" TEXT NOT NULL,
    "sanitizedContent" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "embedding" vector(1536),
    "embeddingModel" TEXT,
    "embeddingDimensions" INTEGER NOT NULL DEFAULT 1536,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentKnowledgeAudit" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "documentId" TEXT,
    "importBatchId" TEXT,
    "actorUserId" TEXT,
    "operation" VARCHAR(80) NOT NULL,
    "changes" JSONB,
    "stateBefore" JSONB,
    "stateAfter" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentKnowledgeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentKnowledgeImportBatch_plantId_status_createdAt_idx" ON "IncidentKnowledgeImportBatch"("plantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentKnowledgeDocument_sourceSewoId_key" ON "IncidentKnowledgeDocument"("sourceSewoId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentKnowledgeDocument_originalFileKey_key" ON "IncidentKnowledgeDocument"("originalFileKey");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeDocument_plantId_extractionStatus_createdA_idx" ON "IncidentKnowledgeDocument"("plantId", "extractionStatus", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeDocument_plantId_reviewStatus_createdAt_idx" ON "IncidentKnowledgeDocument"("plantId", "reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeDocument_plantId_incidentDate_incidentType_idx" ON "IncidentKnowledgeDocument"("plantId", "incidentDate", "incidentType");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeDocument_importBatchId_idx" ON "IncidentKnowledgeDocument"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentKnowledgeDocument_plantId_fileHash_key" ON "IncidentKnowledgeDocument"("plantId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentKnowledgeRecord_documentId_key" ON "IncidentKnowledgeRecord"("documentId");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeRecord_plantId_incidentDate_idx" ON "IncidentKnowledgeRecord"("plantId", "incidentDate");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeRecord_plantId_department_incidentDate_idx" ON "IncidentKnowledgeRecord"("plantId", "department", "incidentDate");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeRecord_plantId_equipment_incidentDate_idx" ON "IncidentKnowledgeRecord"("plantId", "equipment", "incidentDate");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeEvidence_incidentRecordId_fieldName_idx" ON "IncidentKnowledgeEvidence"("incidentRecordId", "fieldName");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeCause_incidentRecordId_assessmentStatus_idx" ON "IncidentKnowledgeCause"("incidentRecordId", "assessmentStatus");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeCause_originalCauseCode_originalTaxonomyVe_idx" ON "IncidentKnowledgeCause"("originalCauseCode", "originalTaxonomyVersion");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeCause_normalizedCauseCode_idx" ON "IncidentKnowledgeCause"("normalizedCauseCode");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeAction_incidentRecordId_status_idx" ON "IncidentKnowledgeAction"("incidentRecordId", "status");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeAction_linkedActionId_idx" ON "IncidentKnowledgeAction"("linkedActionId");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeChunk_plantId_documentId_idx" ON "IncidentKnowledgeChunk"("plantId", "documentId");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeChunk_plantId_contentHash_idx" ON "IncidentKnowledgeChunk"("plantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentKnowledgeChunk_documentId_chunkIndex_key" ON "IncidentKnowledgeChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeAudit_plantId_createdAt_idx" ON "IncidentKnowledgeAudit"("plantId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeAudit_documentId_createdAt_idx" ON "IncidentKnowledgeAudit"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentKnowledgeAudit_importBatchId_createdAt_idx" ON "IncidentKnowledgeAudit"("importBatchId", "createdAt");

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeImportBatch" ADD CONSTRAINT "IncidentKnowledgeImportBatch_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeImportBatch" ADD CONSTRAINT "IncidentKnowledgeImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeDocument" ADD CONSTRAINT "IncidentKnowledgeDocument_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeDocument" ADD CONSTRAINT "IncidentKnowledgeDocument_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "IncidentKnowledgeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeDocument" ADD CONSTRAINT "IncidentKnowledgeDocument_sourceSewoId_fkey" FOREIGN KEY ("sourceSewoId") REFERENCES "SEWO"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeDocument" ADD CONSTRAINT "IncidentKnowledgeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeDocument" ADD CONSTRAINT "IncidentKnowledgeDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeRecord" ADD CONSTRAINT "IncidentKnowledgeRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IncidentKnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeRecord" ADD CONSTRAINT "IncidentKnowledgeRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeEvidence" ADD CONSTRAINT "IncidentKnowledgeEvidence_incidentRecordId_fkey" FOREIGN KEY ("incidentRecordId") REFERENCES "IncidentKnowledgeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeCause" ADD CONSTRAINT "IncidentKnowledgeCause_incidentRecordId_fkey" FOREIGN KEY ("incidentRecordId") REFERENCES "IncidentKnowledgeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAction" ADD CONSTRAINT "IncidentKnowledgeAction_incidentRecordId_fkey" FOREIGN KEY ("incidentRecordId") REFERENCES "IncidentKnowledgeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAction" ADD CONSTRAINT "IncidentKnowledgeAction_linkedActionId_fkey" FOREIGN KEY ("linkedActionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeChunk" ADD CONSTRAINT "IncidentKnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IncidentKnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeChunk" ADD CONSTRAINT "IncidentKnowledgeChunk_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAudit" ADD CONSTRAINT "IncidentKnowledgeAudit_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAudit" ADD CONSTRAINT "IncidentKnowledgeAudit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IncidentKnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAudit" ADD CONSTRAINT "IncidentKnowledgeAudit_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "IncidentKnowledgeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentKnowledgeAudit" ADD CONSTRAINT "IncidentKnowledgeAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
