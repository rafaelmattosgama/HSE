/*
  Warnings:

  - You are about to drop the `CompetenceRequirement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_competenceTypeId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_plantId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_scopeAreaId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_scopeWorkstationId_fkey";

-- DropTable
DROP TABLE "CompetenceRequirement";

-- DropEnum
DROP TYPE "CompetenceRequirementScope";
