ALTER TABLE "UnsafeConditionType" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';

CREATE INDEX "UnsafeConditionType_plantId_category_idx" ON "UnsafeConditionType"("plantId", "category");
CREATE INDEX "Communication_unsafeConditionTypeId_eventDatetime_idx" ON "Communication"("unsafeConditionTypeId", "eventDatetime");

