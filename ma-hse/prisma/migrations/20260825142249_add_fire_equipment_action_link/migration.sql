-- AlterEnum
ALTER TYPE "ActionSourceType" ADD VALUE 'FIRE_SAFETY_EQUIPMENT';

-- CreateTable
CREATE TABLE "FireEquipmentActionLink" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fireEquipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireEquipmentActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FireEquipmentActionLink_fireEquipmentId_idx" ON "FireEquipmentActionLink"("fireEquipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentActionLink_actionId_fireEquipmentId_key" ON "FireEquipmentActionLink"("actionId", "fireEquipmentId");

-- AddForeignKey
ALTER TABLE "FireEquipmentActionLink" ADD CONSTRAINT "FireEquipmentActionLink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentActionLink" ADD CONSTRAINT "FireEquipmentActionLink_fireEquipmentId_fkey" FOREIGN KEY ("fireEquipmentId") REFERENCES "FireEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
