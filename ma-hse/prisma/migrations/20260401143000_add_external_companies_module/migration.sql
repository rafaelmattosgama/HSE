CREATE TYPE "ExternalCompanyApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "ExternalCompanyDocumentType" AS ENUM ('ANEXO_D', 'RISK_ASSESSMENT', 'WORK_ACCIDENT_INSURANCE', 'CIVIL_LIABILITY_INSURANCE', 'SOCIAL_SECURITY_CLEARANCE', 'TAX_AUTHORITY_CLEARANCE');
CREATE TYPE "ExternalWorkerDocumentType" AS ENUM ('MEDICAL_FITNESS', 'PPE_DELIVERY', 'TRAINING');

CREATE TABLE "ExternalCompany" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "sponsorUserId" TEXT,
  "sponsorEmployeeId" TEXT,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "socialSecurityId" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "approvalStatus" "ExternalCompanyApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalCompanyInvitation" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "sponsorUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "requiredDocuments" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "companyId" TEXT,
  CONSTRAINT "ExternalCompanyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalCompanySession" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCompanySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalCompanyDocument" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "ExternalCompanyDocumentType" NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3),
  "approvalStatus" "ExternalCompanyApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvalComment" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCompanyDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalWorker" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "approvalStatus" "ExternalCompanyApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalWorker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalWorkerDocument" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "type" "ExternalWorkerDocumentType" NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3),
  "approvalStatus" "ExternalCompanyApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvalComment" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalWorkerDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalCompany_email_key" ON "ExternalCompany"("email");
CREATE UNIQUE INDEX "ExternalCompanyInvitation_tokenHash_key" ON "ExternalCompanyInvitation"("tokenHash");
CREATE INDEX "ExternalCompanyInvitation_plantId_email_idx" ON "ExternalCompanyInvitation"("plantId", "email");
CREATE UNIQUE INDEX "ExternalCompanySession_sessionToken_key" ON "ExternalCompanySession"("sessionToken");
CREATE INDEX "ExternalCompanySession_companyId_expiresAt_idx" ON "ExternalCompanySession"("companyId", "expiresAt");
CREATE UNIQUE INDEX "ExternalCompanyDocument_companyId_type_key" ON "ExternalCompanyDocument"("companyId", "type");
CREATE INDEX "ExternalWorker_companyId_isActive_idx" ON "ExternalWorker"("companyId", "isActive");
CREATE UNIQUE INDEX "ExternalWorkerDocument_workerId_type_key" ON "ExternalWorkerDocument"("workerId", "type");

ALTER TABLE "ExternalCompany" ADD CONSTRAINT "ExternalCompany_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCompany" ADD CONSTRAINT "ExternalCompany_sponsorUserId_fkey" FOREIGN KEY ("sponsorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalCompany" ADD CONSTRAINT "ExternalCompany_sponsorEmployeeId_fkey" FOREIGN KEY ("sponsorEmployeeId") REFERENCES "EmployeeDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanyInvitation" ADD CONSTRAINT "ExternalCompanyInvitation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanyInvitation" ADD CONSTRAINT "ExternalCompanyInvitation_sponsorUserId_fkey" FOREIGN KEY ("sponsorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanyInvitation" ADD CONSTRAINT "ExternalCompanyInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ExternalCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanySession" ADD CONSTRAINT "ExternalCompanySession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ExternalCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanyDocument" ADD CONSTRAINT "ExternalCompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ExternalCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCompanyDocument" ADD CONSTRAINT "ExternalCompanyDocument_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalWorker" ADD CONSTRAINT "ExternalWorker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ExternalCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalWorkerDocument" ADD CONSTRAINT "ExternalWorkerDocument_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "ExternalWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalWorkerDocument" ADD CONSTRAINT "ExternalWorkerDocument_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
