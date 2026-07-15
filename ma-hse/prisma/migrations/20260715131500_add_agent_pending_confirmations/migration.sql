-- CreateEnum
CREATE TYPE "AgentPendingConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AgentPendingConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantCode" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "allowedRoles" "RoleCode"[] NOT NULL,
    "status" "AgentPendingConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPendingConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPendingConfirmation_userId_status_expiresAt_idx" ON "AgentPendingConfirmation"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentPendingConfirmation_plantId_status_expiresAt_idx" ON "AgentPendingConfirmation"("plantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentPendingConfirmation_toolName_status_idx" ON "AgentPendingConfirmation"("toolName", "status");

-- AddForeignKey
ALTER TABLE "AgentPendingConfirmation" ADD CONSTRAINT "AgentPendingConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPendingConfirmation" ADD CONSTRAINT "AgentPendingConfirmation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
