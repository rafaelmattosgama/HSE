-- AlterEnum
ALTER TYPE "ActionSourceType" ADD VALUE 'COMPETENCE';

-- CreateTable
CREATE TABLE "CompetenceActionLink" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetenceActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetenceActionLink_competenceWorkerId_competenceTypeId_idx" ON "CompetenceActionLink"("competenceWorkerId", "competenceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenceActionLink_actionId_competenceWorkerId_competence_key" ON "CompetenceActionLink"("actionId", "competenceWorkerId", "competenceTypeId");

-- AddForeignKey
ALTER TABLE "CompetenceActionLink" ADD CONSTRAINT "CompetenceActionLink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceActionLink" ADD CONSTRAINT "CompetenceActionLink_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceActionLink" ADD CONSTRAINT "CompetenceActionLink_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
