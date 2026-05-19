/*
  Warnings:

  - You are about to drop the `OccupationalHealthWorker` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OccupationalHealthWorker" DROP CONSTRAINT "OccupationalHealthWorker_plantId_fkey";

-- DropForeignKey
ALTER TABLE "OccupationalHealthWorker" DROP CONSTRAINT "OccupationalHealthWorker_workstationId_fkey";

-- DropTable
DROP TABLE "OccupationalHealthWorker";
