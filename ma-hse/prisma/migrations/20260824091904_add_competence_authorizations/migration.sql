-- CreateEnum
CREATE TYPE "CompetenceCategory" AS ENUM ('EQUIPMENT_OPERATION', 'HIGH_RISK_ACTIVITY', 'SAFETY_ROLE', 'LEGAL_MANDATORY', 'OTHER');

-- CreateEnum
CREATE TYPE "CompetenceRequirementScope" AS ENUM ('ROLE', 'AREA', 'WORKSTATION', 'ALL_WORKERS');

-- CreateEnum
CREATE TYPE "CompetenceCellState" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED', 'MISSING', 'AWAITING_ASSESSMENT', 'AWAITING_AUTHORIZATION', 'SUSPENDED', 'REVOKED', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "OccupationalHealthWorker" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CompetenceType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CompetenceCategory" NOT NULL DEFAULT 'EQUIPMENT_OPERATION',
    "requiresTraining" BOOLEAN NOT NULL DEFAULT true,
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT true,
    "requiresAuthorization" BOOLEAN NOT NULL DEFAULT true,
    "validityMonths" INTEGER NOT NULL DEFAULT 12,
    "refresherMonths" INTEGER,
    "legalReference" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceLanguage" TEXT,

    CONSTRAINT "CompetenceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetenceRequirement" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "scopeType" "CompetenceRequirementScope" NOT NULL,
    "scopeRoleName" TEXT,
    "scopeAreaId" TEXT,
    "scopeWorkstationId" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "CompetenceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetenceWorker" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "employeeDirectoryId" TEXT NOT NULL,
    "areaId" TEXT,
    "roleName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetenceWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCompetenceState" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "requirementSource" TEXT,
    "state" "CompetenceCellState" NOT NULL,
    "validUntil" TIMESTAMP(3),
    "daysToExpiry" INTEGER,
    "currentAuthorizationId" TEXT,
    "blockedReason" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCompetenceState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetenceType_plantId_isActive_displayOrder_idx" ON "CompetenceType"("plantId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenceType_plantId_code_key" ON "CompetenceType"("plantId", "code");

-- CreateIndex
CREATE INDEX "CompetenceRequirement_plantId_competenceTypeId_isActive_idx" ON "CompetenceRequirement"("plantId", "competenceTypeId", "isActive");

-- CreateIndex
CREATE INDEX "CompetenceWorker_plantId_isActive_idx" ON "CompetenceWorker"("plantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenceWorker_plantId_employeeDirectoryId_key" ON "CompetenceWorker"("plantId", "employeeDirectoryId");

-- CreateIndex
CREATE INDEX "WorkerCompetenceState_plantId_state_idx" ON "WorkerCompetenceState"("plantId", "state");

-- CreateIndex
CREATE INDEX "WorkerCompetenceState_plantId_validUntil_idx" ON "WorkerCompetenceState"("plantId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCompetenceState_competenceWorkerId_competenceTypeId_key" ON "WorkerCompetenceState"("competenceWorkerId", "competenceTypeId");

-- AddForeignKey
ALTER TABLE "CompetenceType" ADD CONSTRAINT "CompetenceType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceRequirement" ADD CONSTRAINT "CompetenceRequirement_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceRequirement" ADD CONSTRAINT "CompetenceRequirement_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceRequirement" ADD CONSTRAINT "CompetenceRequirement_scopeAreaId_fkey" FOREIGN KEY ("scopeAreaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceRequirement" ADD CONSTRAINT "CompetenceRequirement_scopeWorkstationId_fkey" FOREIGN KEY ("scopeWorkstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceRequirement" ADD CONSTRAINT "CompetenceRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorker" ADD CONSTRAINT "CompetenceWorker_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorker" ADD CONSTRAINT "CompetenceWorker_employeeDirectoryId_fkey" FOREIGN KEY ("employeeDirectoryId") REFERENCES "EmployeeDirectory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorker" ADD CONSTRAINT "CompetenceWorker_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorker" ADD CONSTRAINT "CompetenceWorker_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCompetenceState" ADD CONSTRAINT "WorkerCompetenceState_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCompetenceState" ADD CONSTRAINT "WorkerCompetenceState_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
