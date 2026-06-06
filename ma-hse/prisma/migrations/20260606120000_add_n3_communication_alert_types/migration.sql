CREATE TYPE "SafetyCommunicationAlertType" AS ENUM (
  'N4_APPROVED_COMMUNICATION',
  'N3_NEAR_MISS_SOFTWARE_ALERT',
  'N3_FIRST_AID_SOFTWARE_ALERT',
  'N3_COMMUNICATION_EMAIL_ALERT'
);

ALTER TABLE "SafetyCommunicationNotification"
  ADD COLUMN "alertType" "SafetyCommunicationAlertType" NOT NULL DEFAULT 'N4_APPROVED_COMMUNICATION',
  ALTER COLUMN "departmentId" DROP NOT NULL;

DROP INDEX "SafetyCommunicationNotification_communicationId_recipientUserId_notificationType_key";

CREATE UNIQUE INDEX "SafetyCommunicationNotification_communicationId_recipientUserId_alertType_notificationType_key"
  ON "SafetyCommunicationNotification"("communicationId", "recipientUserId", "alertType", "notificationType");
