CREATE TABLE "PlantTrainingAttendee" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "PlantTrainingAttendee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlantTrainingAttendee_recordId_idx" ON "PlantTrainingAttendee"("recordId");
CREATE INDEX "PlantTrainingAttendee_employeeId_idx" ON "PlantTrainingAttendee"("employeeId");

ALTER TABLE "PlantTrainingAttendee"
    ADD CONSTRAINT "PlantTrainingAttendee_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "PlantTrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantTrainingAttendee"
    ADD CONSTRAINT "PlantTrainingAttendee_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
