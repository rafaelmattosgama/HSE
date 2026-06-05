CREATE TYPE "ActionAlertType" AS ENUM ('NEW_ACTION', 'THREE_DAYS_BEFORE_DUE_DATE', 'OVERDUE_ACTION');

CREATE TYPE "ActionAlertChannel" AS ENUM ('SOFTWARE', 'EMAIL');

CREATE TABLE "ActionAlertDelivery" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertType" "ActionAlertType" NOT NULL,
    "channel" "ActionAlertChannel" NOT NULL,
    "notificationId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionAlertDelivery_actionId_userId_alertType_channel_key" ON "ActionAlertDelivery"("actionId", "userId", "alertType", "channel");
CREATE INDEX "ActionAlertDelivery_userId_alertType_sentAt_idx" ON "ActionAlertDelivery"("userId", "alertType", "sentAt");
CREATE INDEX "ActionAlertDelivery_notificationId_idx" ON "ActionAlertDelivery"("notificationId");

ALTER TABLE "ActionAlertDelivery" ADD CONSTRAINT "ActionAlertDelivery_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionAlertDelivery" ADD CONSTRAINT "ActionAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionAlertDelivery" ADD CONSTRAINT "ActionAlertDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
