ALTER TABLE "Communication" DROP CONSTRAINT "Communication_riskThemeId_fkey";

ALTER TABLE "Communication" ALTER COLUMN "riskThemeId" DROP NOT NULL;

ALTER TABLE "Communication" ADD CONSTRAINT "Communication_riskThemeId_fkey"
  FOREIGN KEY ("riskThemeId") REFERENCES "RiskTheme"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
