ALTER TABLE "SEWO"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT;

ALTER TABLE "SEWO"
ADD CONSTRAINT "SEWO_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SEWO_plantId_deletedAt_idx" ON "SEWO"("plantId", "deletedAt");

CREATE TABLE "SewoAutoCreationSuppression" (
  "id" TEXT NOT NULL,
  "communicationId" TEXT NOT NULL,
  "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suppressedByUserId" TEXT NOT NULL,
  CONSTRAINT "SewoAutoCreationSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SewoAutoCreationSuppression_communicationId_key"
ON "SewoAutoCreationSuppression"("communicationId");

ALTER TABLE "SewoAutoCreationSuppression"
ADD CONSTRAINT "SewoAutoCreationSuppression_communicationId_fkey"
FOREIGN KEY ("communicationId") REFERENCES "Communication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
