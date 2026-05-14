-- AlterTable
ALTER TABLE "SmatAudit" ADD COLUMN     "communicationId" TEXT;

-- CreateTable
CREATE TABLE "SmatAuditAttachment" (
    "id" TEXT NOT NULL,
    "smatAuditId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "SmatAuditAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmatAuditActionLink" (
    "id" TEXT NOT NULL,
    "smatAuditId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmatAuditActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmatAuditAttachment_smatAuditId_idx" ON "SmatAuditAttachment"("smatAuditId");

-- CreateIndex
CREATE INDEX "SmatAuditActionLink_actionId_idx" ON "SmatAuditActionLink"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "SmatAuditActionLink_smatAuditId_actionId_key" ON "SmatAuditActionLink"("smatAuditId", "actionId");

-- CreateIndex
CREATE INDEX "SmatAudit_communicationId_idx" ON "SmatAudit"("communicationId");

-- AddForeignKey
ALTER TABLE "SmatAudit" ADD CONSTRAINT "SmatAudit_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmatAuditAttachment" ADD CONSTRAINT "SmatAuditAttachment_smatAuditId_fkey" FOREIGN KEY ("smatAuditId") REFERENCES "SmatAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmatAuditAttachment" ADD CONSTRAINT "SmatAuditAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmatAuditActionLink" ADD CONSTRAINT "SmatAuditActionLink_smatAuditId_fkey" FOREIGN KEY ("smatAuditId") REFERENCES "SmatAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmatAuditActionLink" ADD CONSTRAINT "SmatAuditActionLink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
