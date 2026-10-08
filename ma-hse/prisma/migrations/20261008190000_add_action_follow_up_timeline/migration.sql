CREATE TYPE "ActionUpdateKind" AS ENUM ('CREATED', 'COMMENT', 'STATUS_CHANGED', 'CLOSED', 'REOPENED');

CREATE TABLE "ActionUpdate" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "kind" "ActionUpdateKind" NOT NULL,
    "content" TEXT NOT NULL,
    "statusFrom" "ActionStatus",
    "statusTo" "ActionStatus",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionUpdate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ActionEvidenceAttachment" ADD COLUMN "updateId" TEXT;

CREATE INDEX "ActionUpdate_actionId_createdAt_idx" ON "ActionUpdate"("actionId", "createdAt");
CREATE INDEX "ActionEvidenceAttachment_actionId_uploadedAt_idx" ON "ActionEvidenceAttachment"("actionId", "uploadedAt");
CREATE INDEX "ActionEvidenceAttachment_updateId_idx" ON "ActionEvidenceAttachment"("updateId");

ALTER TABLE "ActionUpdate"
    ADD CONSTRAINT "ActionUpdate_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionUpdate"
    ADD CONSTRAINT "ActionUpdate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActionEvidenceAttachment"
    ADD CONSTRAINT "ActionEvidenceAttachment_updateId_fkey"
    FOREIGN KEY ("updateId") REFERENCES "ActionUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ActionUpdate" ("id", "actionId", "kind", "content", "statusTo", "createdAt")
SELECT gen_random_uuid()::text, "id", 'CREATED'::"ActionUpdateKind", 'Ação criada', 'OPEN'::"ActionStatus", "createdAt"
FROM "Action";

INSERT INTO "ActionUpdate" ("id", "actionId", "kind", "content", "statusFrom", "statusTo", "createdById", "createdAt")
SELECT gen_random_uuid()::text, "id", 'CLOSED'::"ActionUpdateKind", COALESCE(NULLIF("closureComment", ''), 'Ação fechada'), "status", "status", "closedBy", COALESCE("closedAt", "updatedAt")
FROM "Action"
WHERE "closedAt" IS NOT NULL;

UPDATE "ActionEvidenceAttachment" AS evidence
SET "updateId" = update_row."id"
FROM "ActionUpdate" AS update_row
WHERE evidence."actionId" = update_row."actionId"
  AND update_row."kind" = 'CLOSED'
  AND evidence."updateId" IS NULL;

INSERT INTO "ActionUpdate" ("id", "actionId", "kind", "content", "statusFrom", "statusTo", "createdById", "createdAt")
SELECT gen_random_uuid()::text, "id", 'REOPENED'::"ActionUpdateKind", COALESCE(NULLIF("reopenReason", ''), 'Ação reaberta'), 'CLOSED'::"ActionStatus", 'OPEN'::"ActionStatus", "reopenedBy", "reopenedAt"
FROM "Action"
WHERE "reopenedAt" IS NOT NULL;
