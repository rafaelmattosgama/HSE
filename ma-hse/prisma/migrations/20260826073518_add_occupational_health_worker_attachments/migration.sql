-- CreateTable
CREATE TABLE "OccupationalHealthWorkerAttachment" (
    "id" TEXT NOT NULL,
    "occupationalHealthWorkerId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "OccupationalHealthWorkerAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OccupationalHealthWorkerAttachment_occupationalHealthWorker_idx" ON "OccupationalHealthWorkerAttachment"("occupationalHealthWorkerId");

-- AddForeignKey
ALTER TABLE "OccupationalHealthWorkerAttachment" ADD CONSTRAINT "OccupationalHealthWorkerAttachment_occupationalHealthWorke_fkey" FOREIGN KEY ("occupationalHealthWorkerId") REFERENCES "OccupationalHealthWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupationalHealthWorkerAttachment" ADD CONSTRAINT "OccupationalHealthWorkerAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
