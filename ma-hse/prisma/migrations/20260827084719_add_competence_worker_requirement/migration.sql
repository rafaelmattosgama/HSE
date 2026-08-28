-- CreateTable
CREATE TABLE "CompetenceWorkerRequirement" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "competenceWorkerId" TEXT NOT NULL,
    "competenceTypeId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "setById" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetenceWorkerRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetenceWorkerRequirement_plantId_isRequired_idx" ON "CompetenceWorkerRequirement"("plantId", "isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenceWorkerRequirement_competenceWorkerId_competenceTy_key" ON "CompetenceWorkerRequirement"("competenceWorkerId", "competenceTypeId");

-- AddForeignKey
ALTER TABLE "CompetenceWorkerRequirement" ADD CONSTRAINT "CompetenceWorkerRequirement_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorkerRequirement" ADD CONSTRAINT "CompetenceWorkerRequirement_competenceWorkerId_fkey" FOREIGN KEY ("competenceWorkerId") REFERENCES "CompetenceWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorkerRequirement" ADD CONSTRAINT "CompetenceWorkerRequirement_competenceTypeId_fkey" FOREIGN KEY ("competenceTypeId") REFERENCES "CompetenceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenceWorkerRequirement" ADD CONSTRAINT "CompetenceWorkerRequirement_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
