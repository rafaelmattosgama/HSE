-- CreateTable
CREATE TABLE "SmatAudit" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "auditorUserId" TEXT,
    "auditorName" TEXT NOT NULL,
    "auditDate" TIMESTAMP(3) NOT NULL,
    "startTimeText" TEXT,
    "endTimeText" TEXT,
    "areaExamined" TEXT,
    "locationExamined" TEXT,
    "peopleObservedCount" INTEGER NOT NULL DEFAULT 0,
    "peopleInvolvedCount" INTEGER NOT NULL DEFAULT 0,
    "peopleSafeCount" INTEGER NOT NULL DEFAULT 0,
    "peopleUnsafeCount" INTEGER NOT NULL DEFAULT 0,
    "workConditionsSafeCount" INTEGER NOT NULL DEFAULT 0,
    "workConditionsUnsafeCount" INTEGER NOT NULL DEFAULT 0,
    "reactionsPositiveCount" INTEGER NOT NULL DEFAULT 0,
    "reactionsNegativeCount" INTEGER NOT NULL DEFAULT 0,
    "safeActs" JSONB NOT NULL,
    "safeConditions" JSONB NOT NULL,
    "unsafeActs" JSONB NOT NULL,
    "unsafeConditions" JSONB NOT NULL,
    "answer1" TEXT,
    "answer2" TEXT,
    "answer3" TEXT,
    "answer4" TEXT,
    "answer5" TEXT,
    "answer6" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmatAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmatAudit_plantId_auditDate_idx" ON "SmatAudit"("plantId", "auditDate");

-- CreateIndex
CREATE INDEX "SmatAudit_auditorUserId_createdAt_idx" ON "SmatAudit"("auditorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "SmatAudit" ADD CONSTRAINT "SmatAudit_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmatAudit" ADD CONSTRAINT "SmatAudit_auditorUserId_fkey" FOREIGN KEY ("auditorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
