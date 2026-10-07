CREATE TYPE "PlantTrainingCategory" AS ENUM ('LEGAL_REQUIREMENT', 'IMPROVING_SAFETY', 'SAFETY_CULTURE', 'OTHER');

CREATE TABLE "PlantTrainingTopic" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlantTrainingTopic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlantTrainingTopic_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlantTrainingTopic_plantId_name_key" ON "PlantTrainingTopic"("plantId", "name");

CREATE TABLE "PlantTrainingRecord" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "occurredOn" DATE NOT NULL,
  "category" "PlantTrainingCategory" NOT NULL,
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" > 0),
  "traineeId" TEXT,
  "traineeName" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantTrainingRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlantTrainingRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlantTrainingRecord_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "PlantTrainingTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlantTrainingRecord_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "EmployeeDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PlantTrainingRecord_plantId_occurredOn_idx" ON "PlantTrainingRecord"("plantId", "occurredOn");
CREATE INDEX "PlantTrainingRecord_plantId_topicId_category_idx" ON "PlantTrainingRecord"("plantId", "topicId", "category");

CREATE TABLE "PlantTrainingTrainer" (
  "recordId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "PlantTrainingTrainer_pkey" PRIMARY KEY ("recordId", "employeeId"),
  CONSTRAINT "PlantTrainingTrainer_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PlantTrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlantTrainingTrainer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeDirectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
