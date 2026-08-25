-- CreateEnum
CREATE TYPE "FireExtinguishingAgent" AS ENUM ('CO2', 'ABC', 'ABF', 'WATER');

-- AlterTable
ALTER TABLE "FireEquipment" ADD COLUMN     "extinguishingAgent" "FireExtinguishingAgent",
ADD COLUMN     "locationPhotoFileKey" TEXT;
