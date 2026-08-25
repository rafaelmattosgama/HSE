-- CreateEnum
CREATE TYPE "FireEquipmentTagType" AS ENUM ('NFC_AND_QR', 'QR_ONLY');

-- CreateTable
CREATE TABLE "FireEquipmentTagAssignment" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "tagType" "FireEquipmentTagType" NOT NULL DEFAULT 'NFC_AND_QR',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "unassignedAt" TIMESTAMP(3),
    "unassignReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FireEquipmentTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FireEquipmentTagAssignment_fireEquipmentId_isActive_idx" ON "FireEquipmentTagAssignment"("fireEquipmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentTagAssignment_tagCode_key" ON "FireEquipmentTagAssignment"("tagCode");

-- AddForeignKey
ALTER TABLE "FireEquipmentTagAssignment" ADD CONSTRAINT "FireEquipmentTagAssignment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentTagAssignment" ADD CONSTRAINT "FireEquipmentTagAssignment_fireEquipmentId_fkey" FOREIGN KEY ("fireEquipmentId") REFERENCES "FireEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentTagAssignment" ADD CONSTRAINT "FireEquipmentTagAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
