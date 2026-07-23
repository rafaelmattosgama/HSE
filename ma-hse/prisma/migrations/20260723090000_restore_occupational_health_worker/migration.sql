CREATE TABLE "OccupationalHealthWorker" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "workstationId" TEXT,
  "gender" TEXT NOT NULL,
  "hireDate" TIMESTAMP(3) NOT NULL,
  "roleStartDate" TIMESTAMP(3) NOT NULL,
  "roleName" TEXT,
  "nationality" TEXT,
  "examDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'VALID',
  "observation" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OccupationalHealthWorker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OccupationalHealthWorker_plantId_employeeNo_key"
ON "OccupationalHealthWorker"("plantId", "employeeNo");

CREATE INDEX "OccupationalHealthWorker_plantId_isActive_examDate_idx"
ON "OccupationalHealthWorker"("plantId", "isActive", "examDate");

ALTER TABLE "OccupationalHealthWorker"
ADD CONSTRAINT "OccupationalHealthWorker_plantId_fkey"
FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OccupationalHealthWorker"
ADD CONSTRAINT "OccupationalHealthWorker_workstationId_fkey"
FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
