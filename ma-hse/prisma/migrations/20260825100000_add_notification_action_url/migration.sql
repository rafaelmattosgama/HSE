-- Menores review: "alerta in-app sem link" — competence-alert-service.ts already
-- computes an actionUrl per alert, but it only ever reached the email (Notification
-- had nowhere to store it). Nullable, so every existing Notification creator is
-- unaffected and simply leaves it null.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "actionUrl" TEXT;
