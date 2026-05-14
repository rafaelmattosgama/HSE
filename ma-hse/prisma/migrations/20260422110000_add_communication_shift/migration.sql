ALTER TABLE "Communication"
ADD COLUMN "shiftId" TEXT;

CREATE INDEX "Communication_shiftId_idx" ON "Communication"("shiftId");

ALTER TABLE "Communication"
ADD CONSTRAINT "Communication_shiftId_fkey"
FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
