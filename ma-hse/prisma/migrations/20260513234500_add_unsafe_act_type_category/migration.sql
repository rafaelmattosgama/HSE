ALTER TABLE "UnsafeActType" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';

CREATE INDEX "UnsafeActType_plantId_category_idx" ON "UnsafeActType"("plantId", "category");
