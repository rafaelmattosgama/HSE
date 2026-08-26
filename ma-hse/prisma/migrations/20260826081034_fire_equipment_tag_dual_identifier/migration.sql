-- CreateEnum
CREATE TYPE "FireTagBindingMode" AS ENUM ('FULL', 'UID_ONLY', 'CODE_ONLY');

-- AlterTable
ALTER TABLE "FireEquipmentTagAssignment" ADD COLUMN     "bindingMode" "FireTagBindingMode" NOT NULL DEFAULT 'CODE_ONLY',
ADD COLUMN     "chipType" TEXT,
ADD COLUMN     "tagUid" TEXT,
ADD COLUMN     "writtenAt" TIMESTAMP(3),
ALTER COLUMN "tagCode" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FireEquipmentTagAssignment_tagUid_key" ON "FireEquipmentTagAssignment"("tagUid");

