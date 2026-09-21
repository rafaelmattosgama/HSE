ALTER TABLE "UserPlantRole" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "UserPlantRole_departmentId_idx" ON "UserPlantRole"("departmentId");

ALTER TABLE "UserPlantRole" ADD CONSTRAINT "UserPlantRole_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
