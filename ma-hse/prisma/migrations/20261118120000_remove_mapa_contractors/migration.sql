-- Removes the MAPA and Contractors modules and the Communication.isContractor field.
-- Irreversible: all MAPA (MapDocument/MapLayer/MapFeature) and contractor (External*) data is dropped.

-- DropForeignKey
ALTER TABLE "ExternalCompany" DROP CONSTRAINT "ExternalCompany_plantId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompany" DROP CONSTRAINT "ExternalCompany_sponsorEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompany" DROP CONSTRAINT "ExternalCompany_sponsorUserId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanyInvitation" DROP CONSTRAINT "ExternalCompanyInvitation_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanyInvitation" DROP CONSTRAINT "ExternalCompanyInvitation_plantId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanyInvitation" DROP CONSTRAINT "ExternalCompanyInvitation_sponsorUserId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanySession" DROP CONSTRAINT "ExternalCompanySession_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanyDocument" DROP CONSTRAINT "ExternalCompanyDocument_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalCompanyDocument" DROP CONSTRAINT "ExternalCompanyDocument_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalWorker" DROP CONSTRAINT "ExternalWorker_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalWorkerDocument" DROP CONSTRAINT "ExternalWorkerDocument_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalWorkerDocument" DROP CONSTRAINT "ExternalWorkerDocument_workerId_fkey";

-- DropForeignKey
ALTER TABLE "MapDocument" DROP CONSTRAINT "MapDocument_plantId_fkey";

-- DropForeignKey
ALTER TABLE "MapLayer" DROP CONSTRAINT "MapLayer_documentId_fkey";

-- DropForeignKey
ALTER TABLE "MapLayer" DROP CONSTRAINT "MapLayer_plantId_fkey";

-- DropForeignKey
ALTER TABLE "MapFeature" DROP CONSTRAINT "MapFeature_areaId_fkey";

-- DropForeignKey
ALTER TABLE "MapFeature" DROP CONSTRAINT "MapFeature_communicationId_fkey";

-- DropForeignKey
ALTER TABLE "MapFeature" DROP CONSTRAINT "MapFeature_layerId_fkey";

-- DropForeignKey
ALTER TABLE "MapFeature" DROP CONSTRAINT "MapFeature_plantId_fkey";

-- DropForeignKey
ALTER TABLE "MapFeature" DROP CONSTRAINT "MapFeature_workstationId_fkey";

-- AlterTable
ALTER TABLE "Communication" DROP COLUMN "isContractor";

-- DropTable
DROP TABLE "ExternalCompany";

-- DropTable
DROP TABLE "ExternalCompanyInvitation";

-- DropTable
DROP TABLE "ExternalCompanySession";

-- DropTable
DROP TABLE "ExternalCompanyDocument";

-- DropTable
DROP TABLE "ExternalWorker";

-- DropTable
DROP TABLE "ExternalWorkerDocument";

-- DropTable
DROP TABLE "MapDocument";

-- DropTable
DROP TABLE "MapLayer";

-- DropTable
DROP TABLE "MapFeature";

-- DropEnum
DROP TYPE "ExternalCompanyApprovalStatus";

-- DropEnum
DROP TYPE "ExternalCompanyDocumentType";

-- DropEnum
DROP TYPE "ExternalWorkerDocumentType";

-- DropEnum
DROP TYPE "MapSourceFileType";

-- DropEnum
DROP TYPE "MapLayerSourceType";

-- DropEnum
DROP TYPE "MapFeatureType";

