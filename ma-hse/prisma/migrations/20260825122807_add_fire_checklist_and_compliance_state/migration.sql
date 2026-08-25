-- CreateEnum
CREATE TYPE "FireChecklistFrequency" AS ENUM ('QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FireChecklistItemResponseType" AS ENUM ('OK_NOK', 'OK_NOK_NA', 'NUMERIC', 'TEXT');

-- CreateEnum
CREATE TYPE "FireChecklistResult" AS ENUM ('PASSED', 'PASSED_WITH_OBSERVATIONS', 'FAILED');

-- CreateEnum
CREATE TYPE "FireChecklistItemValue" AS ENUM ('OK', 'NOK', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FireComplianceCellState" AS ENUM ('VALID', 'DUE_SOON', 'OVERDUE', 'NEVER_DONE', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "FireChecklistTemplate" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentTypeId" TEXT NOT NULL,
    "frequency" "FireChecklistFrequency" NOT NULL,
    "name" TEXT NOT NULL,
    "legalReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireChecklistItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "responseType" "FireChecklistItemResponseType" NOT NULL DEFAULT 'OK_NOK',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FireChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireChecklistExecution" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" "FireChecklistFrequency" NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedByUserId" TEXT NOT NULL,
    "performedViaTag" BOOLEAN NOT NULL DEFAULT false,
    "externalProviderName" TEXT,
    "externalCertificateFileKey" TEXT,
    "overallResult" "FireChecklistResult" NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireChecklistExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireChecklistItemResponse" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "value" "FireChecklistItemValue" NOT NULL,
    "numericValue" DECIMAL(8,2),
    "textValue" TEXT,
    "notes" TEXT,

    CONSTRAINT "FireChecklistItemResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireChecklistExecutionAttachment" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireChecklistExecutionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireEquipmentComplianceState" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentId" TEXT NOT NULL,
    "quarterlyState" "FireComplianceCellState" NOT NULL,
    "quarterlyDueDate" TIMESTAMP(3),
    "quarterlyLastExecutionId" TEXT,
    "annualState" "FireComplianceCellState" NOT NULL,
    "annualDueDate" TIMESTAMP(3),
    "annualLastExecutionId" TEXT,
    "hasOpenNonConformity" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireEquipmentComplianceState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FireChecklistTemplate_plantId_fireEquipmentTypeId_frequency_idx" ON "FireChecklistTemplate"("plantId", "fireEquipmentTypeId", "frequency", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FireChecklistTemplate_plantId_fireEquipmentTypeId_frequency_key" ON "FireChecklistTemplate"("plantId", "fireEquipmentTypeId", "frequency");

-- CreateIndex
CREATE INDEX "FireChecklistItem_templateId_isActive_displayOrder_idx" ON "FireChecklistItem"("templateId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FireChecklistItem_templateId_code_key" ON "FireChecklistItem"("templateId", "code");

-- CreateIndex
CREATE INDEX "FireChecklistExecution_fireEquipmentId_frequency_performedA_idx" ON "FireChecklistExecution"("fireEquipmentId", "frequency", "performedAt");

-- CreateIndex
CREATE INDEX "FireChecklistExecution_plantId_overallResult_performedAt_idx" ON "FireChecklistExecution"("plantId", "overallResult", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FireChecklistItemResponse_executionId_itemId_key" ON "FireChecklistItemResponse"("executionId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentComplianceState_fireEquipmentId_key" ON "FireEquipmentComplianceState"("fireEquipmentId");

-- CreateIndex
CREATE INDEX "FireEquipmentComplianceState_plantId_quarterlyState_idx" ON "FireEquipmentComplianceState"("plantId", "quarterlyState");

-- CreateIndex
CREATE INDEX "FireEquipmentComplianceState_plantId_annualState_idx" ON "FireEquipmentComplianceState"("plantId", "annualState");

-- AddForeignKey
ALTER TABLE "FireChecklistTemplate" ADD CONSTRAINT "FireChecklistTemplate_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistTemplate" ADD CONSTRAINT "FireChecklistTemplate_fireEquipmentTypeId_fkey" FOREIGN KEY ("fireEquipmentTypeId") REFERENCES "FireEquipmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistItem" ADD CONSTRAINT "FireChecklistItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FireChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistExecution" ADD CONSTRAINT "FireChecklistExecution_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistExecution" ADD CONSTRAINT "FireChecklistExecution_fireEquipmentId_fkey" FOREIGN KEY ("fireEquipmentId") REFERENCES "FireEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistExecution" ADD CONSTRAINT "FireChecklistExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FireChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistExecution" ADD CONSTRAINT "FireChecklistExecution_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistItemResponse" ADD CONSTRAINT "FireChecklistItemResponse_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "FireChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistItemResponse" ADD CONSTRAINT "FireChecklistItemResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FireChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireChecklistExecutionAttachment" ADD CONSTRAINT "FireChecklistExecutionAttachment_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "FireChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentComplianceState" ADD CONSTRAINT "FireEquipmentComplianceState_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentComplianceState" ADD CONSTRAINT "FireEquipmentComplianceState_fireEquipmentId_fkey" FOREIGN KEY ("fireEquipmentId") REFERENCES "FireEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
