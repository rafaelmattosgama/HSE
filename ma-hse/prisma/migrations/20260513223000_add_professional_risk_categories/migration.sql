ALTER TABLE "RiskTheme"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';

CREATE INDEX "RiskTheme_plantId_category_idx" ON "RiskTheme"("plantId", "category");
