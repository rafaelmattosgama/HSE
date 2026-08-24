-- CreateEnum
CREATE TYPE "CompetenceAlertType" AS ENUM ('EXPIRING_90', 'EXPIRING_60', 'EXPIRING_30', 'EXPIRING_7', 'EXPIRY_DAY', 'MISSING_DOCUMENT', 'AUTHORIZATION_SUSPENDED', 'AUTHORIZATION_REVOKED', 'ROLE_WITHOUT_COMPETENCE', 'AWAITING_ASSESSMENT');

-- CreateTable
CREATE TABLE "CompetenceAlertDelivery" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "userId" TEXT NOT NULL,
    "alertType" "CompetenceAlertType" NOT NULL,
    "channel" "ActionAlertChannel" NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "notificationId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetenceAlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetenceAlertDelivery_userId_alertType_sentAt_idx" ON "CompetenceAlertDelivery"("userId", "alertType", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenceAlertDelivery_competenceWorkerId_competenceTypeId_key" ON "CompetenceAlertDelivery"("competenceWorkerId", "competenceTypeId", "userId", "alertType", "channel", "cycleKey");

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "WorkerAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
