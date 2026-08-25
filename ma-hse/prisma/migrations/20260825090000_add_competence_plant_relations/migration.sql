-- Menores review: TrainingRecord, CompetenceAssessment, WorkerAuthorization,
-- WorkerCompetenceState and CompetenceAlertDelivery already carried a plain
-- plantId String with no FK, unlike CompetenceType/CompetenceRequirement/
-- CompetenceWorker. Not an active bug (routes always resolve plantId from the
-- URL's plantCode), but nothing in the database enforced that plantId agrees
-- with the row's own competenceWorker.plantId — and WorkerCompetenceState.plantId
-- is what feeds the KPI dashboards' groupBy.

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAssessment" ADD CONSTRAINT "CompetenceAssessment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAuthorization" ADD CONSTRAINT "WorkerAuthorization_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCompetenceState" ADD CONSTRAINT "WorkerCompetenceState_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceAlertDelivery" ADD CONSTRAINT "CompetenceAlertDelivery_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CompetenceAlertDelivery_plantId_alertType_sentAt_idx" ON "CompetenceAlertDelivery"("plantId", "alertType", "sentAt");
