-- CreateEnum
CREATE TYPE "MapSourceFileType" AS ENUM ('PDF', 'DWG', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "MapLayerSourceType" AS ENUM ('DWG_IMPORTED', 'AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MapFeatureType" AS ENUM ('AREA', 'WORKSTATION', 'ICON', 'INCIDENT');

-- CreateTable
CREATE TABLE "MapDocument" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileType" "MapSourceFileType" NOT NULL,
    "importedLayerNames" JSONB,
    "selectedLayerNames" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapLayer" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "documentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "icon" TEXT,
    "sourceType" "MapLayerSourceType" NOT NULL DEFAULT 'MANUAL',
    "isVisibleDefault" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapFeature" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "layerId" TEXT,
    "featureType" "MapFeatureType" NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "areaId" TEXT,
    "workstationId" TEXT,
    "communicationId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapDocument_plantId_createdAt_idx" ON "MapDocument"("plantId", "createdAt");

-- CreateIndex
CREATE INDEX "MapLayer_plantId_sortOrder_idx" ON "MapLayer"("plantId", "sortOrder");

-- CreateIndex
CREATE INDEX "MapFeature_plantId_layerId_idx" ON "MapFeature"("plantId", "layerId");

-- AddForeignKey
ALTER TABLE "MapDocument" ADD CONSTRAINT "MapDocument_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapLayer" ADD CONSTRAINT "MapLayer_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapLayer" ADD CONSTRAINT "MapLayer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "MapDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapFeature" ADD CONSTRAINT "MapFeature_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapFeature" ADD CONSTRAINT "MapFeature_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "MapLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapFeature" ADD CONSTRAINT "MapFeature_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapFeature" ADD CONSTRAINT "MapFeature_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapFeature" ADD CONSTRAINT "MapFeature_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
