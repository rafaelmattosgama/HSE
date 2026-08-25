-- CreateEnum
CREATE TYPE "FireEquipmentCategory" AS ENUM ('PORTABLE_EXTINCTION', 'FIXED_EXTINCTION', 'EMERGENCY_LIGHTING', 'DETECTION_ALARM', 'OTHER');

-- CreateEnum
CREATE TYPE "FireEquipmentStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE', 'DECOMMISSIONED');

-- CreateTable
CREATE TABLE "FireEquipmentType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FireEquipmentCategory" NOT NULL DEFAULT 'OTHER',
    "codePrefix" TEXT NOT NULL,
    "legalReference" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceLanguage" TEXT,

    CONSTRAINT "FireEquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireEquipment" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentTypeId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "internalCode" TEXT NOT NULL,
    "areaId" TEXT,
    "workstationId" TEXT,
    "locationDescription" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "capacity" TEXT,
    "installedAt" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "status" "FireEquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "decommissionedAt" TIMESTAMP(3),
    "decommissionReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "FireEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FireEquipmentType_plantId_isActive_displayOrder_idx" ON "FireEquipmentType"("plantId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentType_plantId_code_key" ON "FireEquipmentType"("plantId", "code");

-- CreateIndex
CREATE INDEX "FireEquipment_plantId_fireEquipmentTypeId_isActive_idx" ON "FireEquipment"("plantId", "fireEquipmentTypeId", "isActive");

-- CreateIndex
CREATE INDEX "FireEquipment_plantId_status_idx" ON "FireEquipment"("plantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipment_plantId_internalCode_key" ON "FireEquipment"("plantId", "internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipment_plantId_fireEquipmentTypeId_sequenceNumber_key" ON "FireEquipment"("plantId", "fireEquipmentTypeId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "FireEquipmentType" ADD CONSTRAINT "FireEquipmentType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipment" ADD CONSTRAINT "FireEquipment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipment" ADD CONSTRAINT "FireEquipment_fireEquipmentTypeId_fkey" FOREIGN KEY ("fireEquipmentTypeId") REFERENCES "FireEquipmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipment" ADD CONSTRAINT "FireEquipment_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipment" ADD CONSTRAINT "FireEquipment_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipment" ADD CONSTRAINT "FireEquipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
