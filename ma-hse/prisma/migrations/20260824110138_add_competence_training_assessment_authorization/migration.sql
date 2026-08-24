-- CreateEnum
CREATE TYPE "TrainingResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompetenceAssessmentMethod" AS ENUM ('PRACTICAL_TEST', 'OBSERVATION', 'THEORY_TEST', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "CompetenceAssessmentResult" AS ENUM ('COMPETENT', 'NOT_YET_COMPETENT');

-- CreateEnum
CREATE TYPE "AuthorizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeDirectoryId" TEXT;

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "provider" TEXT,
    "trainerName" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "durationHours" DECIMAL(5,2),
    "certificateNumber" TEXT,
    "certificateExpiresAt" TIMESTAMP(3),
    "result" "TrainingResult" NOT NULL DEFAULT 'PASSED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecordAttachment" (
    "id" TEXT NOT NULL,
    "trainingRecordId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "TrainingRecordAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetenceAssessment" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "trainingRecordId" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "assessorUserId" TEXT,
    "assessorName" TEXT,
    "method" "CompetenceAssessmentMethod" NOT NULL DEFAULT 'PRACTICAL_TEST',
    "result" "CompetenceAssessmentResult" NOT NULL,
    "score" INTEGER,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "CompetenceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetenceAssessmentAttachment" (
    "id" TEXT NOT NULL,
    "competenceAssessmentId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "CompetenceAssessmentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAuthorization" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "trainingRecordId" TEXT,
    "assessmentId" TEXT,
    "sequenceNumber" INTEGER,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedByUserId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "restrictions" TEXT,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentFileKey" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedByUserId" TEXT,
    "suspensionReason" TEXT,
    "reactivatedAt" TIMESTAMP(3),
    "reactivatedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revocationReason" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingRecord_competenceWorkerId_competenceTypeId_complete_idx" ON "TrainingRecord"("competenceWorkerId", "competenceTypeId", "completedAt");

-- CreateIndex
CREATE INDEX "CompetenceAssessment_competenceWorkerId_competenceTypeId_as_idx" ON "CompetenceAssessment"("competenceWorkerId", "competenceTypeId", "assessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAuthorization_supersededById_key" ON "WorkerAuthorization"("supersededById");

-- CreateIndex
CREATE INDEX "WorkerAuthorization_plantId_status_validUntil_idx" ON "WorkerAuthorization"("plantId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "WorkerAuthorization_competenceWorkerId_competenceTypeId_sta_idx" ON "WorkerAuthorization"("competenceWorkerId", "competenceTypeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAuthorization_plantId_sequenceNumber_key" ON "WorkerAuthorization"("plantId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeDirectoryId_key" ON "User"("employeeDirectoryId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeDirectoryId_fkey" FOREIGN KEY ("employeeDirectoryId") REFERENCES "EmployeeDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecordAttachment" ADD CONSTRAINT "TrainingRecordAttachment_trainingRecordId_fkey" FOREIGN KEY ("trainingRecordId") REFERENCES "TrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecordAttachment" ADD CONSTRAINT "TrainingRecordAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessment" ADD CONSTRAINT "CompetenceAssessment_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessment" ADD CONSTRAINT "CompetenceAssessment_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessment" ADD CONSTRAINT "CompetenceAssessment_trainingRecordId_fkey" FOREIGN KEY ("trainingRecordId") REFERENCES "TrainingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessment" ADD CONSTRAINT "CompetenceAssessment_assessorUserId_fkey" FOREIGN KEY ("assessorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessmentAttachment" ADD CONSTRAINT "CompetenceAssessmentAttachment_competenceAssessmentId_fkey" FOREIGN KEY ("competenceAssessmentId") REFERENCES "CompetenceAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessmentAttachment" ADD CONSTRAINT "CompetenceAssessmentAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_trainingRecordId_fkey" FOREIGN KEY ("trainingRecordId") REFERENCES "TrainingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CompetenceAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_suspendedByUserId_fkey" FOREIGN KEY ("suspendedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_reactivatedByUserId_fkey" FOREIGN KEY ("reactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "WorkerAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

