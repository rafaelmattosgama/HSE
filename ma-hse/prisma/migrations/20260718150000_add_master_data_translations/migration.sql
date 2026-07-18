-- Persist localized Plant Master Data without replacing the original values.
CREATE TYPE "MasterDataEntityType" AS ENUM ('AREA', 'WORKSTATION', 'EQUIPMENT', 'RISK_THEME');
CREATE TYPE "MasterDataTranslationField" AS ENUM ('NAME', 'CATEGORY');
CREATE TYPE "MasterDataTranslationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "Area" ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "Workstation" ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "RiskTheme" ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "RiskTheme" ADD COLUMN "categorySourceLanguage" TEXT;

CREATE TABLE "MasterDataTranslation" (
    "id" TEXT NOT NULL,
    "entityType" "MasterDataEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" "MasterDataTranslationField" NOT NULL DEFAULT 'NAME',
    "locale" TEXT NOT NULL,
    "value" TEXT,
    "sourceHash" TEXT NOT NULL,
    "status" "MasterDataTranslationStatus" NOT NULL DEFAULT 'PENDING',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "translatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterDataTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MasterDataTranslation_entityType_entityId_field_locale_key"
ON "MasterDataTranslation"("entityType", "entityId", "field", "locale");

CREATE INDEX "MasterDataTranslation_entityType_entityId_idx"
ON "MasterDataTranslation"("entityType", "entityId");

CREATE INDEX "MasterDataTranslation_status_updatedAt_idx"
ON "MasterDataTranslation"("status", "updatedAt");
