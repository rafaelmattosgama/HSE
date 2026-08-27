-- AlterTable
ALTER TABLE "CompetenceAssessment" ADD COLUMN     "entryGroupId" TEXT;

-- AlterTable
ALTER TABLE "TrainingRecord" ADD COLUMN     "entryGroupId" TEXT;

-- AlterTable
ALTER TABLE "WorkerAuthorization" ADD COLUMN     "entryGroupId" TEXT;

-- CreateIndex
CREATE INDEX "CompetenceAssessment_entryGroupId_idx" ON "CompetenceAssessment"("entryGroupId");

-- CreateIndex
CREATE INDEX "TrainingRecord_entryGroupId_idx" ON "TrainingRecord"("entryGroupId");

-- CreateIndex
CREATE INDEX "WorkerAuthorization_entryGroupId_idx" ON "WorkerAuthorization"("entryGroupId");
