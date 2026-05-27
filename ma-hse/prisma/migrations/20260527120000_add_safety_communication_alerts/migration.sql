-- CreateEnum
CREATE TYPE "SafetyCommunicationNotificationType" AS ENUM ('EMAIL', 'FLOATING_ALERT');

-- CreateEnum
CREATE TYPE "SafetyCommunicationNotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateTable
CREATE TABLE "SafetyCommunicationAlertRecipient" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SafetyCommunicationAlertRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyCommunicationNotification" (
  "id" TEXT NOT NULL,
  "communicationId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "departmentId" TEXT NOT NULL,
  "plantId" TEXT,
  "notificationType" "SafetyCommunicationNotificationType" NOT NULL,
  "status" "SafetyCommunicationNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "notificationId" TEXT,
  "sentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SafetyCommunicationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyCommunicationAlertRecipient_plantId_userId_departmentId_key" ON "SafetyCommunicationAlertRecipient"("plantId", "userId", "departmentId");

-- CreateIndex
CREATE INDEX "SafetyCommunicationAlertRecipient_plantId_departmentId_isActive_idx" ON "SafetyCommunicationAlertRecipient"("plantId", "departmentId", "isActive");

-- CreateIndex
CREATE INDEX "SafetyCommunicationAlertRecipient_userId_isActive_idx" ON "SafetyCommunicationAlertRecipient"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyCommunicationNotification_notificationId_key" ON "SafetyCommunicationNotification"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyCommunicationNotification_communicationId_recipientUserId_notificationType_key" ON "SafetyCommunicationNotification"("communicationId", "recipientUserId", "notificationType");

-- CreateIndex
CREATE INDEX "SafetyCommunicationNotification_recipientUserId_status_createdAt_idx" ON "SafetyCommunicationNotification"("recipientUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyCommunicationNotification_communicationId_createdAt_idx" ON "SafetyCommunicationNotification"("communicationId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyCommunicationNotification_departmentId_createdAt_idx" ON "SafetyCommunicationNotification"("departmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "SafetyCommunicationAlertRecipient" ADD CONSTRAINT "SafetyCommunicationAlertRecipient_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationAlertRecipient" ADD CONSTRAINT "SafetyCommunicationAlertRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationAlertRecipient" ADD CONSTRAINT "SafetyCommunicationAlertRecipient_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationAlertRecipient" ADD CONSTRAINT "SafetyCommunicationAlertRecipient_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationAlertRecipient" ADD CONSTRAINT "SafetyCommunicationAlertRecipient_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationNotification" ADD CONSTRAINT "SafetyCommunicationNotification_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationNotification" ADD CONSTRAINT "SafetyCommunicationNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationNotification" ADD CONSTRAINT "SafetyCommunicationNotification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationNotification" ADD CONSTRAINT "SafetyCommunicationNotification_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunicationNotification" ADD CONSTRAINT "SafetyCommunicationNotification_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
