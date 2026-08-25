-- CreateEnum
CREATE TYPE "FireEquipmentAlertType" AS ENUM ('DUE_SOON', 'OVERDUE', 'TAG_MISSING', 'NON_CONFORMITY_FOUND');

-- CreateTable
CREATE TABLE "FireEquipmentAlertDelivery" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "fireEquipmentId" TEXT NOT NULL,
    "executionId" TEXT,
    "userId" TEXT NOT NULL,
    "alertType" "FireEquipmentAlertType" NOT NULL,
    "channel" "ActionAlertChannel" NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "notificationId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireEquipmentAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FireEquipmentAlertDelivery_userId_alertType_sentAt_idx" ON "FireEquipmentAlertDelivery"("userId", "alertType", "sentAt");

-- CreateIndex
CREATE INDEX "FireEquipmentAlertDelivery_plantId_alertType_sentAt_idx" ON "FireEquipmentAlertDelivery"("plantId", "alertType", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentAlertDelivery_fireEquipmentId_userId_alertType_key" ON "FireEquipmentAlertDelivery"("fireEquipmentId", "userId", "alertType", "channel", "cycleKey");

-- AddForeignKey
ALTER TABLE "FireEquipmentAlertDelivery" ADD CONSTRAINT "FireEquipmentAlertDelivery_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentAlertDelivery" ADD CONSTRAINT "FireEquipmentAlertDelivery_fireEquipmentId_fkey" FOREIGN KEY ("fireEquipmentId") REFERENCES "FireEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentAlertDelivery" ADD CONSTRAINT "FireEquipmentAlertDelivery_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "FireChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentAlertDelivery" ADD CONSTRAINT "FireEquipmentAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireEquipmentAlertDelivery" ADD CONSTRAINT "FireEquipmentAlertDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
