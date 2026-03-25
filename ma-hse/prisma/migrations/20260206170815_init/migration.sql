-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('N1_CORPORATE', 'N2_PLANT_MANAGER', 'N3_SAFETY', 'N4_SUPERVISOR', 'N5_OPERATOR', 'N6_QR_REPORTER', 'MEDICO');

-- CreateEnum
CREATE TYPE "PlantAccessTokenType" AS ENUM ('REPORT', 'KIOSK');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('UNSAFE_ACT', 'UNSAFE_CONDITION', 'NEAR_MISS', 'FIRST_AID', 'ACCIDENT');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('SUBMITTED', 'PENDING_VALIDATION', 'VALID_OPEN', 'ONGOING', 'CLOSED', 'REJECTED', 'INVALID');

-- CreateEnum
CREATE TYPE "SeverityPotential" AS ENUM ('LOW', 'MED', 'HIGH');

-- CreateEnum
CREATE TYPE "LeaveClassification" AS ENUM ('LE_30', 'GT_30');

-- CreateEnum
CREATE TYPE "CommunicationSource" AS ENUM ('BACKOFFICE', 'TOKEN_REPORT', 'TOKEN_KIOSK');

-- CreateEnum
CREATE TYPE "ActionSourceType" AS ENUM ('COMMUNICATION', 'SEWO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActionCategory" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "ActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'ONGOING', 'CLOSED');

-- CreateEnum
CREATE TYPE "SEWOStatus" AS ENUM ('DRAFT', 'IN_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SEWOAttachmentType" AS ENUM ('EVENT_EVIDENCE', 'BEFORE', 'AFTER', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertRuleTriggerType" AS ENUM ('N_IN_X_DAYS', 'CONSECUTIVE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY_DIGEST', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ReportScope" AS ENUM ('PLANT', 'CORPORATE');

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlantRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlantRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAccessToken" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "type" "PlantAccessTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "PlantAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workstation" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskTheme" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RiskTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsafeActType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UnsafeActType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsafeConditionType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UnsafeConditionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NearMissType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NearMissType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyPart" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BodyPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InjuryType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDirectory" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dept" TEXT,
    "shiftId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDirectory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" "CommunicationSource" NOT NULL DEFAULT 'BACKOFFICE',
    "eventDatetime" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reporterName" TEXT NOT NULL,
    "reporterEmployeeNo" TEXT,
    "reporterUserId" TEXT,
    "targetText" TEXT,
    "targetEmployeeNo" TEXT,
    "targetEmployeeId" TEXT,
    "areaId" TEXT,
    "lineId" TEXT,
    "workstationId" TEXT,
    "equipmentId" TEXT,
    "riskThemeId" TEXT NOT NULL,
    "unsafeActTypeId" TEXT,
    "unsafeConditionTypeId" TEXT,
    "nearMissTypeId" TEXT,
    "description" TEXT NOT NULL,
    "severityPotential" "SeverityPotential",
    "isContractor" BOOLEAN DEFAULT false,
    "bodyPartId" TEXT,
    "injuryTypeId" TEXT,
    "hasLeave" BOOLEAN DEFAULT false,
    "returnDate" TIMESTAMP(3),
    "lostDays" INTEGER,
    "classification" "LeaveClassification",
    "validationNotes" TEXT,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "manuallyClosedBy" TEXT,
    "manuallyClosedAt" TIMESTAMP(3),
    "manualCloseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAttachment" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,

    CONSTRAINT "CommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "sourceType" "ActionSourceType" NOT NULL,
    "communicationId" TEXT,
    "sewoId" TEXT,
    "category" "ActionCategory" NOT NULL,
    "priority" "ActionPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closureComment" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCoOwner" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionCoOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionEvidenceAttachment" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "ActionEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyKpiMonthlyInput" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "hoursWorked" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyKpiMonthlyInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRecipientList" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "name" TEXT NOT NULL,
    "scope" "ReportScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRecipientList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRecipient" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepetitionRule" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "triggerType" "AlertRuleTriggerType" NOT NULL,
    "thresholdCount" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "consecutiveCount" INTEGER,
    "sameWorkstation" BOOLEAN NOT NULL DEFAULT true,
    "sameEquipment" BOOLEAN NOT NULL DEFAULT true,
    "sameRiskTheme" BOOLEAN NOT NULL DEFAULT true,
    "sameWorker" BOOLEAN NOT NULL DEFAULT false,
    "manualResetAt" TIMESTAMP(3),

    CONSTRAINT "RepetitionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "communicationId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWO" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "eventClassification" TEXT NOT NULL,
    "areaId" TEXT,
    "lineId" TEXT,
    "shiftId" TEXT,
    "analysisDate" TIMESTAMP(3) NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "whatText" TEXT NOT NULL,
    "whereText" TEXT NOT NULL,
    "whoText" TEXT NOT NULL,
    "usualWorkYesNo" BOOLEAN NOT NULL,
    "whichText" TEXT,
    "howText" TEXT NOT NULL,
    "immediateCorrectiveActionText" TEXT NOT NULL,
    "status" "SEWOStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalComment" TEXT,
    "causeCatalogVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SEWO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOAttachment" (
    "id" TEXT NOT NULL,
    "sewoId" TEXT NOT NULL,
    "type" "SEWOAttachmentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "SEWOAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOCauseCatalogVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SEWOCauseCatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOCauseCategory" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "SEWOCauseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOCauseItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "SEWOCauseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOCauseSelection" (
    "id" TEXT NOT NULL,
    "sewoId" TEXT NOT NULL,
    "causeItemId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "isRootCause" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SEWOCauseSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEWOActionLink" (
    "id" TEXT NOT NULL,
    "sewoId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SEWOActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "plantId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "channel" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemParameter" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "type" "ReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "fileKeys" JSONB NOT NULL,
    "recipients" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diffJson" JSONB NOT NULL,
    "actorUserId" TEXT,
    "plantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "UserPlantRole_plantId_idx" ON "UserPlantRole"("plantId");

-- CreateIndex
CREATE INDEX "UserPlantRole_roleId_idx" ON "UserPlantRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlantRole_userId_plantId_roleId_key" ON "UserPlantRole"("userId", "plantId", "roleId");

-- CreateIndex
CREATE INDEX "PlantAccessToken_plantId_type_isActive_idx" ON "PlantAccessToken"("plantId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlantAccessToken_plantId_type_tokenHash_key" ON "PlantAccessToken"("plantId", "type", "tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Area_plantId_code_key" ON "Area"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Line_plantId_code_key" ON "Line"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_plantId_code_key" ON "Workstation"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_plantId_code_key" ON "Equipment"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_plantId_code_key" ON "Shift"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RiskTheme_plantId_code_key" ON "RiskTheme"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UnsafeActType_plantId_code_key" ON "UnsafeActType"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UnsafeConditionType_plantId_code_key" ON "UnsafeConditionType"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "NearMissType_plantId_code_key" ON "NearMissType"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BodyPart_plantId_code_key" ON "BodyPart"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InjuryType_plantId_code_key" ON "InjuryType"("plantId", "code");

-- CreateIndex
CREATE INDEX "EmployeeDirectory_plantId_name_idx" ON "EmployeeDirectory"("plantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDirectory_plantId_employeeNo_key" ON "EmployeeDirectory"("plantId", "employeeNo");

-- CreateIndex
CREATE INDEX "Communication_plantId_status_eventDatetime_idx" ON "Communication"("plantId", "status", "eventDatetime");

-- CreateIndex
CREATE INDEX "Communication_riskThemeId_eventDatetime_idx" ON "Communication"("riskThemeId", "eventDatetime");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_communicationId_idx" ON "CommunicationAttachment"("communicationId");

-- CreateIndex
CREATE INDEX "Action_plantId_status_dueDate_idx" ON "Action"("plantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCoOwner_actionId_userId_key" ON "ActionCoOwner"("actionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyKpiMonthlyInput_plantId_year_month_key" ON "SafetyKpiMonthlyInput"("plantId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRecipient_listId_email_key" ON "ReportRecipient"("listId", "email");

-- CreateIndex
CREATE INDEX "AlertRule_plantId_isActive_idx" ON "AlertRule"("plantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RepetitionRule_alertRuleId_key" ON "RepetitionRule"("alertRuleId");

-- CreateIndex
CREATE INDEX "AlertEvent_triggeredAt_idx" ON "AlertEvent"("triggeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SEWOCauseCatalogVersion_version_key" ON "SEWOCauseCatalogVersion"("version");

-- CreateIndex
CREATE INDEX "SEWOCauseCategory_versionId_sortOrder_idx" ON "SEWOCauseCategory"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "SEWOCauseItem_categoryId_sortOrder_idx" ON "SEWOCauseItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SEWOCauseSelection_sewoId_causeItemId_key" ON "SEWOCauseSelection"("sewoId", "causeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SEWOActionLink_sewoId_actionId_key" ON "SEWOActionLink"("sewoId", "actionId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_plantId_createdAt_idx" ON "Notification"("plantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemParameter_plantId_key_key" ON "SystemParameter"("plantId", "key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE INDEX "AuditLog_plantId_createdAt_idx" ON "AuditLog"("plantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- AddForeignKey
ALTER TABLE "UserPlantRole" ADD CONSTRAINT "UserPlantRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlantRole" ADD CONSTRAINT "UserPlantRole_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlantRole" ADD CONSTRAINT "UserPlantRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAccessToken" ADD CONSTRAINT "PlantAccessToken_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Line" ADD CONSTRAINT "Line_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskTheme" ADD CONSTRAINT "RiskTheme_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsafeActType" ADD CONSTRAINT "UnsafeActType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsafeConditionType" ADD CONSTRAINT "UnsafeConditionType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NearMissType" ADD CONSTRAINT "NearMissType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyPart" ADD CONSTRAINT "BodyPart_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryType" ADD CONSTRAINT "InjuryType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDirectory" ADD CONSTRAINT "EmployeeDirectory_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDirectory" ADD CONSTRAINT "EmployeeDirectory_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_targetEmployeeId_fkey" FOREIGN KEY ("targetEmployeeId") REFERENCES "EmployeeDirectory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_riskThemeId_fkey" FOREIGN KEY ("riskThemeId") REFERENCES "RiskTheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_unsafeActTypeId_fkey" FOREIGN KEY ("unsafeActTypeId") REFERENCES "UnsafeActType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_unsafeConditionTypeId_fkey" FOREIGN KEY ("unsafeConditionTypeId") REFERENCES "UnsafeConditionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_nearMissTypeId_fkey" FOREIGN KEY ("nearMissTypeId") REFERENCES "NearMissType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_bodyPartId_fkey" FOREIGN KEY ("bodyPartId") REFERENCES "BodyPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_injuryTypeId_fkey" FOREIGN KEY ("injuryTypeId") REFERENCES "InjuryType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_validatedBy_fkey" FOREIGN KEY ("validatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_manuallyClosedBy_fkey" FOREIGN KEY ("manuallyClosedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_sewoId_fkey" FOREIGN KEY ("sewoId") REFERENCES "SEWO"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_reopenedBy_fkey" FOREIGN KEY ("reopenedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCoOwner" ADD CONSTRAINT "ActionCoOwner_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCoOwner" ADD CONSTRAINT "ActionCoOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidenceAttachment" ADD CONSTRAINT "ActionEvidenceAttachment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidenceAttachment" ADD CONSTRAINT "ActionEvidenceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyKpiMonthlyInput" ADD CONSTRAINT "SafetyKpiMonthlyInput_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecipientList" ADD CONSTRAINT "ReportRecipientList_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecipient" ADD CONSTRAINT "ReportRecipient_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ReportRecipientList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepetitionRule" ADD CONSTRAINT "RepetitionRule_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWO" ADD CONSTRAINT "SEWO_causeCatalogVersionId_fkey" FOREIGN KEY ("causeCatalogVersionId") REFERENCES "SEWOCauseCatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOAttachment" ADD CONSTRAINT "SEWOAttachment_sewoId_fkey" FOREIGN KEY ("sewoId") REFERENCES "SEWO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOAttachment" ADD CONSTRAINT "SEWOAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOCauseCategory" ADD CONSTRAINT "SEWOCauseCategory_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SEWOCauseCatalogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOCauseItem" ADD CONSTRAINT "SEWOCauseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SEWOCauseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOCauseSelection" ADD CONSTRAINT "SEWOCauseSelection_sewoId_fkey" FOREIGN KEY ("sewoId") REFERENCES "SEWO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOCauseSelection" ADD CONSTRAINT "SEWOCauseSelection_causeItemId_fkey" FOREIGN KEY ("causeItemId") REFERENCES "SEWOCauseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOActionLink" ADD CONSTRAINT "SEWOActionLink_sewoId_fkey" FOREIGN KEY ("sewoId") REFERENCES "SEWO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEWOActionLink" ADD CONSTRAINT "SEWOActionLink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemParameter" ADD CONSTRAINT "SystemParameter_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
