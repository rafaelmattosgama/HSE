-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "onboardingVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "onboardingStartedAt" TIMESTAMP(3),
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "currentOnboardingStep" INTEGER NOT NULL DEFAULT 0;
