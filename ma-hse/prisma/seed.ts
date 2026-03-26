import crypto from "node:crypto";
import { addDays, subDays } from "date-fns";
import { hash } from "bcryptjs";
import {
  ActionCategory,
  ActionPriority,
  ActionSourceType,
  ActionStatus,
  AlertRuleTriggerType,
  CommunicationSource,
  CommunicationStatus,
  CommunicationType,
  LeaveClassification,
  PlantAccessTokenType,
  Prisma,
  PrismaClient,
  RoleCode,
  SEWOStatus,
  SeverityPotential,
} from "@prisma/client";

const prisma = new PrismaClient();

const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!";
const TOKEN_PEPPER = process.env.TOKEN_PEPPER ?? "dev-pepper-1234567890123456";
const SEED_TAG = "[SEED-MVP]";

type SeedUserDefinition = {
  email: string;
  name: string;
  language: string;
  roleBindings: Array<{
    plantCode: "pl01" | "pl02";
    role: RoleCode;
  }>;
};

type PlantFixture = {
  areaId: string;
  lineId: string;
  workstationId: string;
  equipmentId: string;
  shiftId: string;
  riskThemeId: string;
  unsafeActTypeId: string;
  unsafeConditionTypeId: string;
  nearMissTypeId: string;
  bodyPartId: string;
  injuryTypeId: string;
};

type PlantActors = {
  n2UserId: string;
  n3UserId: string;
  n4UserId: string;
  n5UserId: string;
  medicoUserId: string;
};

function stableUuid(seed: string) {
  const hex = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function hashAccessToken(token: string) {
  return crypto.createHash("sha256").update(`${token}:${TOKEN_PEPPER}`).digest("hex");
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function calculateLeaveFields(eventDatetime: Date, hasLeave?: boolean | null, returnDate?: Date | null) {
  if (!hasLeave || !returnDate) {
    return {
      lostDays: null,
      classification: null,
    };
  }

  const ms = returnDate.getTime() - eventDatetime.getTime();
  const lostDays = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));

  return {
    lostDays,
    classification: lostDays <= 30 ? LeaveClassification.LE_30 : LeaveClassification.GT_30,
  };
}

const roles: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_QR_REPORTER,
  RoleCode.MEDICO,
];

async function upsertMasterData(plantId: string) {
  const upsertRows = async (
    type:
      | "area"
      | "line"
      | "workstation"
      | "equipment"
      | "shift"
      | "riskTheme"
      | "unsafeActType"
      | "unsafeConditionType"
      | "nearMissType"
      | "bodyPart"
      | "injuryType",
    rows: { code: string; name: string }[],
  ) => {
    for (const row of rows) {
      switch (type) {
        case "area":
          await prisma.area.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "line":
          await prisma.line.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "workstation":
          await prisma.workstation.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "equipment":
          await prisma.equipment.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "shift":
          await prisma.shift.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "riskTheme":
          await prisma.riskTheme.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "unsafeActType":
          await prisma.unsafeActType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "unsafeConditionType":
          await prisma.unsafeConditionType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "nearMissType":
          await prisma.nearMissType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "bodyPart":
          await prisma.bodyPart.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
        case "injuryType":
          await prisma.injuryType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: row,
            create: { plantId, ...row },
          });
          break;
      }
    }
  };

  await upsertRows("area", [
    { code: "A1", name: "Assembly" },
    { code: "A2", name: "Rollforming" },
    { code: "A3", name: "Logistics" },
    { code: "A4", name: "Maintenance"},
    { code: "A5", name: "Quality"},
    { code: "A6", name: "Administrative"},
    { code: "A7", name: "HSE"},
    { code: "A8", name: "Cleaning"},
    { code: "A9", name: "Projects"},
    { code: "A10", name: "External company"}
  ]);
  await upsertRows("line", [
    { code: "L1", name: "Line 1" },
    { code: "L2", name: "Line 2" },
  ]);
  await upsertRows("workstation", [
    { code: "WS01", name: "Press" },
    { code: "WS02", name: "Cutter" },
  ]);
  await upsertRows("equipment", [
    { code: "EQ01", name: "Conveyor" },
    { code: "EQ02", name: "Forklift" },
  ]);
  await upsertRows("shift", [
    { code: "S1", name: "Shift 1" },
    { code: "S2", name: "Shift 2" },
    { code: "S3", name: "Shift 3" },
    { Code: "S4", name: "Central"}
  ]);
  await upsertRows("riskTheme", [
    { code: "RT01", name: "PPE Non-compliance" },
    { code: "RT02", name: "Slip/Trip/Fall" },
  ]);
  await upsertRows("unsafeActType", [
    { code: "UA01", name: "Bypassing Safety" },
    { code: "UA02", name: "Improper Lifting" },
  ]);
  await upsertRows("unsafeConditionType", [
    { code: "UC01", name: "Oil Leak" },
    { code: "UC02", name: "Blocked Exit" },
  ]);
  await upsertRows("nearMissType", [
    { code: "NM01", name: "Dropped Object" },
    { code: "NM02", name: "Near Collision" },
  ]);
  await upsertRows("bodyPart", [
    { code: "BP01", name: "Head" },
    { code: "BP02", name: "Left Eye" },
    { code: "BP03", name: "Right Eye" },
    { code: "BP04", name: "Left Shoulder" },
    { code: "BP05", name: "Right Shoulder" },
    { code: "BP06", name: "Left Arm" },
    { code: "BP07", name: "Right Arm" },
    { code: "BP08", name: "Left Hand" },
    { code: "BP09", name: "Right Hand" },
    { code: "BP10", name: "Chest" },
    { code: "BP11", name: "Upper Back" },
    { code: "BP12", name: "Lower Back" },
    { code: "BP13", name: "Abdomen" },
    { code: "BP14", name: "Left Hip" },
    { code: "BP15", name: "Right Hip" },
    { code: "BP16", name: "Left Leg" },
    { code: "BP17", name: "Right Leg" },
    { code: "BP18", name: "Left Knee" },
    { code: "BP19", name: "Right Knee" },
    { code: "BP20", name: "Left Foot" },
    { code: "BP21", name: "Right Foot" },
  ]);
  await upsertRows("injuryType", [
    { code: "IT01", name: "Cut" },
    { code: "IT02", name: "Bruise" },
  ]);
}

async function getOrCreateRecipientList(input: { name: string; scope: "PLANT" | "CORPORATE"; plantId?: string }) {
  const existing = await prisma.reportRecipientList.findFirst({
    where: {
      name: input.name,
      scope: input.scope,
      plantId: input.plantId ?? null,
    },
  });

  if (existing) {
    return prisma.reportRecipientList.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        scope: input.scope,
        plantId: input.plantId ?? null,
      },
    });
  }

  return prisma.reportRecipientList.create({
    data: {
      name: input.name,
      scope: input.scope,
      plantId: input.plantId ?? null,
    },
  });
}

async function upsertSeedUser(user: SeedUserDefinition, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      language: user.language,
      passwordHash,
      isActive: true,
    },
    create: {
      email: user.email,
      name: user.name,
      language: user.language,
      passwordHash,
      isActive: true,
    },
  });
}

async function upsertN6ReferenceUser(input: { name: string; language: string }) {
  const existing = await prisma.user.findFirst({
    where: {
      email: null,
      name: input.name,
    },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        language: input.language,
        isActive: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: null,
      name: input.name,
      language: input.language,
      isActive: true,
      passwordHash: null,
    },
  });
}

async function ensureUserRole(input: { userId: string; plantId: string; roleId: string }) {
  await prisma.userPlantRole.upsert({
    where: {
      userId_plantId_roleId: {
        userId: input.userId,
        plantId: input.plantId,
        roleId: input.roleId,
      },
    },
    update: {},
    create: {
      userId: input.userId,
      plantId: input.plantId,
      roleId: input.roleId,
    },
  });
}

async function syncUserRoles(
  userId: string,
  targetRoleBindings: Array<{
    plantId: string;
    roleId: string;
  }>,
) {
  for (const binding of targetRoleBindings) {
    await ensureUserRole({
      userId,
      plantId: binding.plantId,
      roleId: binding.roleId,
    });
  }

  if (!targetRoleBindings.length) {
    await prisma.userPlantRole.deleteMany({
      where: { userId },
    });
    return;
  }

  await prisma.userPlantRole.deleteMany({
    where: {
      userId,
      NOT: {
        OR: targetRoleBindings.map((binding) => ({
          plantId: binding.plantId,
          roleId: binding.roleId,
        })),
      },
    },
  });
}

async function getPlantFixture(plantId: string): Promise<PlantFixture> {
  const [area, line, workstation, equipment, shift, riskTheme, unsafeActType, unsafeConditionType, nearMissType, bodyPart, injuryType] =
    await prisma.$transaction([
      prisma.area.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.line.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.workstation.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.equipment.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.shift.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.riskTheme.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.unsafeActType.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.unsafeConditionType.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.nearMissType.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.bodyPart.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
      prisma.injuryType.findFirst({ where: { plantId }, orderBy: { code: "asc" } }),
    ]);

  return {
    areaId: requireValue(area, "Area seed is missing").id,
    lineId: requireValue(line, "Line seed is missing").id,
    workstationId: requireValue(workstation, "Workstation seed is missing").id,
    equipmentId: requireValue(equipment, "Equipment seed is missing").id,
    shiftId: requireValue(shift, "Shift seed is missing").id,
    riskThemeId: requireValue(riskTheme, "Risk theme seed is missing").id,
    unsafeActTypeId: requireValue(unsafeActType, "Unsafe act type seed is missing").id,
    unsafeConditionTypeId: requireValue(unsafeConditionType, "Unsafe condition type seed is missing").id,
    nearMissTypeId: requireValue(nearMissType, "Near miss type seed is missing").id,
    bodyPartId: requireValue(bodyPart, "Body part seed is missing").id,
    injuryTypeId: requireValue(injuryType, "Injury type seed is missing").id,
  };
}

async function upsertCommunication(input: Prisma.CommunicationUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.communication.upsert({
    where: { id: requireValue(id, "Communication id is required for upsert") },
    update: updateData,
    create: input,
  });
}

async function upsertAction(input: Prisma.ActionUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.action.upsert({
    where: { id: requireValue(id, "Action id is required for upsert") },
    update: updateData,
    create: input,
  });
}

async function upsertCommunicationAttachment(input: Prisma.CommunicationAttachmentUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.communicationAttachment.upsert({
    where: { id: requireValue(id, "Communication attachment id is required for upsert") },
    update: updateData,
    create: input,
  });
}

async function upsertActionEvidenceAttachment(input: Prisma.ActionEvidenceAttachmentUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.actionEvidenceAttachment.upsert({
    where: { id: requireValue(id, "Action evidence attachment id is required for upsert") },
    update: updateData,
    create: input,
  });
}

async function upsertSEWO(input: Prisma.SEWOUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.sEWO.upsert({
    where: { id: requireValue(id, "SEWO id is required for upsert") },
    update: updateData,
    create: input,
  });
}

async function syncActionCoOwners(actionId: string, userIds: string[]) {
  await prisma.actionCoOwner.deleteMany({
    where: {
      actionId,
      userId: {
        notIn: userIds,
      },
    },
  });

  for (const userId of userIds) {
    await prisma.actionCoOwner.upsert({
      where: {
        actionId_userId: {
          actionId,
          userId,
        },
      },
      update: {},
      create: {
        actionId,
        userId,
      },
    });
  }
}

async function seedPlantScenario(input: {
  plantId: string;
  plantCode: "pl01" | "pl02";
  fixture: PlantFixture;
  actors: PlantActors;
  employeePrimaryNo: string;
  employeeSecondaryNo: string;
  catalogVersionId: string;
}) {
  const now = new Date();
  const employeePrimary = await prisma.employeeDirectory.findUniqueOrThrow({
    where: {
      plantId_employeeNo: {
        plantId: input.plantId,
        employeeNo: input.employeePrimaryNo,
      },
    },
  });

  const employeeSecondary = await prisma.employeeDirectory.findUniqueOrThrow({
    where: {
      plantId_employeeNo: {
        plantId: input.plantId,
        employeeNo: input.employeeSecondaryNo,
      },
    },
  });

  const accidentEventDatetime = subDays(now, 43);
  const accidentReturnDate = subDays(now, 6);
  const leave = calculateLeaveFields(accidentEventDatetime, true, accidentReturnDate);

  const submittedCommunication = await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:submitted`),
    plantId: input.plantId,
    type: CommunicationType.UNSAFE_CONDITION,
    status: CommunicationStatus.SUBMITTED,
    source: CommunicationSource.BACKOFFICE,
    eventDatetime: subDays(now, 2),
    reportedAt: subDays(now, 2),
    reporterName: "Line Operator Reporter",
    reporterEmployeeNo: employeeSecondary.employeeNo,
    reporterUserId: input.actors.n5UserId,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    unsafeConditionTypeId: input.fixture.unsafeConditionTypeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - spilled oil on aisle`,
  });

  const pendingCommunication = await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:pending-validation`),
    plantId: input.plantId,
    type: CommunicationType.NEAR_MISS,
    status: CommunicationStatus.PENDING_VALIDATION,
    source: CommunicationSource.TOKEN_REPORT,
    eventDatetime: subDays(now, 3),
    reportedAt: subDays(now, 3),
    reporterName: "QR Reporter",
    reporterEmployeeNo: employeePrimary.employeeNo,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    nearMissTypeId: input.fixture.nearMissTypeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - forklift near miss at crossing`,
  });

  const validOpenCommunication = await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:valid-open`),
    plantId: input.plantId,
    type: CommunicationType.UNSAFE_ACT,
    status: CommunicationStatus.VALID_OPEN,
    source: CommunicationSource.BACKOFFICE,
    eventDatetime: subDays(now, 7),
    reportedAt: subDays(now, 7),
    reporterName: "Shift Supervisor",
    reporterEmployeeNo: employeePrimary.employeeNo,
    reporterUserId: input.actors.n4UserId,
    targetText: employeeSecondary.name,
    targetEmployeeNo: employeeSecondary.employeeNo,
    targetEmployeeId: employeeSecondary.id,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    unsafeActTypeId: input.fixture.unsafeActTypeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - PPE bypass on operation`,
    validatedBy: input.actors.n3UserId,
    validatedAt: subDays(now, 6),
    validationNotes: "Validated by safety as actionable event.",
  });

  const ongoingCommunication = await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:ongoing-first-aid`),
    plantId: input.plantId,
    type: CommunicationType.FIRST_AID,
    status: CommunicationStatus.ONGOING,
    source: CommunicationSource.BACKOFFICE,
    eventDatetime: subDays(now, 10),
    reportedAt: subDays(now, 10),
    reporterName: "Supervisor Report",
    reporterEmployeeNo: employeePrimary.employeeNo,
    reporterUserId: input.actors.n4UserId,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - first aid hand bruise`,
    severityPotential: SeverityPotential.MED,
    isContractor: false,
    bodyPartId: input.fixture.bodyPartId,
    injuryTypeId: input.fixture.injuryTypeId,
    hasLeave: false,
    validatedBy: input.actors.n3UserId,
    validatedAt: subDays(now, 9),
    validationNotes: "Valid first aid case under follow-up.",
  });

  await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:rejected`),
    plantId: input.plantId,
    type: CommunicationType.UNSAFE_CONDITION,
    status: CommunicationStatus.REJECTED,
    source: CommunicationSource.BACKOFFICE,
    eventDatetime: subDays(now, 12),
    reportedAt: subDays(now, 12),
    reporterName: "Operator Report",
    reporterEmployeeNo: employeeSecondary.employeeNo,
    reporterUserId: input.actors.n5UserId,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    unsafeConditionTypeId: input.fixture.unsafeConditionTypeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - rejected duplicate event`,
    validatedBy: input.actors.n3UserId,
    validatedAt: subDays(now, 11),
    validationNotes: "Rejected: duplicated report from same event.",
    invalidationReason: "Duplicated report.",
  });

  const closedAccidentCommunication = await upsertCommunication({
    id: stableUuid(`communication:${input.plantCode}:closed-accident`),
    plantId: input.plantId,
    type: CommunicationType.ACCIDENT,
    status: CommunicationStatus.CLOSED,
    source: CommunicationSource.BACKOFFICE,
    eventDatetime: accidentEventDatetime,
    reportedAt: subDays(now, 42),
    reporterName: "Plant Manager",
    reporterEmployeeNo: employeePrimary.employeeNo,
    reporterUserId: input.actors.n2UserId,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    workstationId: input.fixture.workstationId,
    equipmentId: input.fixture.equipmentId,
    riskThemeId: input.fixture.riskThemeId,
    description: `${SEED_TAG} ${input.plantCode.toUpperCase()} - closed lost-time injury`,
    severityPotential: SeverityPotential.HIGH,
    isContractor: true,
    bodyPartId: input.fixture.bodyPartId,
    injuryTypeId: input.fixture.injuryTypeId,
    hasLeave: true,
    returnDate: accidentReturnDate,
    lostDays: leave.lostDays,
    classification: leave.classification,
    validatedBy: input.actors.n3UserId,
    validatedAt: subDays(now, 41),
    validationNotes: "Validated by safety after investigation.",
    manuallyClosedBy: input.actors.n3UserId,
    manuallyClosedAt: subDays(now, 5),
    manualCloseReason: "All CAPA completed and verified.",
  });

  await upsertCommunicationAttachment({
    id: stableUuid(`communication-attachment:${input.plantCode}:accident`),
    communicationId: closedAccidentCommunication.id,
    fileKey: `${input.plantCode}/communications/${closedAccidentCommunication.id}/accident-evidence.jpg`,
    fileName: `${input.plantCode}-accident-evidence.jpg`,
    contentType: "image/jpeg",
    uploadedByUserId: input.actors.n3UserId,
  });

  const overdueAction = await upsertAction({
    id: stableUuid(`action:${input.plantCode}:overdue`),
    plantId: input.plantId,
    sourceType: ActionSourceType.COMMUNICATION,
    communicationId: ongoingCommunication.id,
    category: ActionCategory.CORRECTIVE,
    priority: ActionPriority.HIGH,
    title: `${SEED_TAG} ${input.plantCode.toUpperCase()} - install interim guard`,
    description: "Install temporary guard and isolate unsafe area.",
    ownerUserId: input.actors.n4UserId,
    dueDate: subDays(now, 3),
    status: ActionStatus.OPEN,
  });

  await syncActionCoOwners(overdueAction.id, [input.actors.n5UserId, input.actors.n3UserId]);

  const openAction = await upsertAction({
    id: stableUuid(`action:${input.plantCode}:open`),
    plantId: input.plantId,
    sourceType: ActionSourceType.COMMUNICATION,
    communicationId: validOpenCommunication.id,
    category: ActionCategory.PREVENTIVE,
    priority: ActionPriority.MEDIUM,
    title: `${SEED_TAG} ${input.plantCode.toUpperCase()} - retrain on PPE compliance`,
    description: "Conduct toolbox talk and reinforce PPE checks.",
    ownerUserId: input.actors.n5UserId,
    dueDate: addDays(now, 6),
    status: ActionStatus.ONGOING,
  });

  await syncActionCoOwners(openAction.id, [input.actors.n4UserId]);

  const closedAction = await upsertAction({
    id: stableUuid(`action:${input.plantCode}:closed`),
    plantId: input.plantId,
    sourceType: ActionSourceType.COMMUNICATION,
    communicationId: closedAccidentCommunication.id,
    category: ActionCategory.IMPROVEMENT,
    priority: ActionPriority.LOW,
    title: `${SEED_TAG} ${input.plantCode.toUpperCase()} - update safe work instruction`,
    description: "Revise SWI and communicate update to all shifts.",
    ownerUserId: input.actors.n3UserId,
    dueDate: subDays(now, 9),
    status: ActionStatus.CLOSED,
    closedAt: subDays(now, 7),
    closedBy: input.actors.n3UserId,
    closureComment: "Procedure updated and rollout evidence attached.",
  });

  await syncActionCoOwners(closedAction.id, []);

  await upsertActionEvidenceAttachment({
    id: stableUuid(`action-evidence:${input.plantCode}:closed`),
    actionId: closedAction.id,
    fileKey: `${input.plantCode}/actions/${closedAction.id}/procedure-update.pdf`,
    fileName: `${input.plantCode}-procedure-update.pdf`,
    contentType: "application/pdf",
    uploadedById: input.actors.n3UserId,
  });

  const approvedByN2 = input.plantCode === "pl02";
  const sewo = await upsertSEWO({
    id: stableUuid(`sewo:${input.plantCode}:accident`),
    plantId: input.plantId,
    communicationId: closedAccidentCommunication.id,
    eventClassification: `${SEED_TAG} ${input.plantCode.toUpperCase()} RCA`,
    areaId: input.fixture.areaId,
    lineId: input.fixture.lineId,
    shiftId: input.fixture.shiftId,
    analysisDate: subDays(now, 8),
    performedByUserId: input.actors.n3UserId,
    whatText: "Worker slipped while handling material.",
    whereText: "Packing area near pallet station.",
    whoText: employeePrimary.name,
    usualWorkYesNo: true,
    whichText: "Routine handling process",
    howText: "Wet floor plus unavailable absorbent kit.",
    immediateCorrectiveActionText: "Area isolated and floor cleaned.",
    status: approvedByN2 ? SEWOStatus.APPROVED : SEWOStatus.IN_APPROVAL,
    approvedByUserId: approvedByN2 ? input.actors.n2UserId : null,
    approvedAt: approvedByN2 ? subDays(now, 7) : null,
    approvalComment: approvedByN2 ? "Approved after CAPA linkage review." : null,
    causeCatalogVersionId: input.catalogVersionId,
  });

  const causeItems = await prisma.sEWOCauseItem.findMany({
    where: {
      category: {
        versionId: input.catalogVersionId,
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 4,
  });

  await prisma.sEWOCauseSelection.deleteMany({
    where: {
      sewoId: sewo.id,
    },
  });

  for (const [index, causeItem] of causeItems.entries()) {
    await prisma.sEWOCauseSelection.create({
      data: {
        id: stableUuid(`sewo-cause:${sewo.id}:${causeItem.id}`),
        sewoId: sewo.id,
        causeItemId: causeItem.id,
        selected: true,
        isRootCause: index === 0,
        comment: index === 0 ? "Primary root cause selected in seed." : "Contributing factor.",
      },
    });
  }

  await prisma.sEWOActionLink.upsert({
    where: {
      sewoId_actionId: {
        sewoId: sewo.id,
        actionId: openAction.id,
      },
    },
    update: {},
    create: {
      id: stableUuid(`sewo-action-link:${sewo.id}:${openAction.id}`),
      sewoId: sewo.id,
      actionId: openAction.id,
    },
  });

  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = subDays(thisMonth, 1);

  await prisma.safetyKpiMonthlyInput.upsert({
    where: {
      plantId_year_month: {
        plantId: input.plantId,
        year: thisMonth.getFullYear(),
        month: thisMonth.getMonth() + 1,
      },
    },
    update: {
      hoursWorked: new Prisma.Decimal("175000.00"),
    },
    create: {
      id: stableUuid(`kpi-input:${input.plantCode}:${thisMonth.getFullYear()}-${thisMonth.getMonth() + 1}`),
      plantId: input.plantId,
      year: thisMonth.getFullYear(),
      month: thisMonth.getMonth() + 1,
      hoursWorked: new Prisma.Decimal("175000.00"),
    },
  });

  await prisma.safetyKpiMonthlyInput.upsert({
    where: {
      plantId_year_month: {
        plantId: input.plantId,
        year: previousMonth.getFullYear(),
        month: previousMonth.getMonth() + 1,
      },
    },
    update: {
      hoursWorked: new Prisma.Decimal("168000.00"),
    },
    create: {
      id: stableUuid(`kpi-input:${input.plantCode}:${previousMonth.getFullYear()}-${previousMonth.getMonth() + 1}`),
      plantId: input.plantId,
      year: previousMonth.getFullYear(),
      month: previousMonth.getMonth() + 1,
      hoursWorked: new Prisma.Decimal("168000.00"),
    },
  });

  return {
    submittedCommunicationId: submittedCommunication.id,
    pendingCommunicationId: pendingCommunication.id,
    validOpenCommunicationId: validOpenCommunication.id,
    ongoingCommunicationId: ongoingCommunication.id,
    closedAccidentCommunicationId: closedAccidentCommunication.id,
    overdueActionId: overdueAction.id,
    openActionId: openAction.id,
    closedActionId: closedAction.id,
    sewoId: sewo.id,
  };
}

async function main() {
  await Promise.all(
    roles.map((code) =>
      prisma.role.upsert({
        where: { code },
        update: {},
        create: { code },
      }),
    ),
  );

  const plantDefinitions = [
    {
      code: "pl01" as const,
      name: "Turin Plant",
      timezone: "Europe/Rome",
      defaultLanguage: "it",
    },
    {
      code: "pl02" as const,
      name: "Campinas Plant",
      timezone: "America/Sao_Paulo",
      defaultLanguage: "pt",
    },
  ];

  const plants = await Promise.all(
    plantDefinitions.map((plant) =>
      prisma.plant.upsert({
        where: { code: plant.code },
        update: {
          name: plant.name,
          timezone: plant.timezone,
          defaultLanguage: plant.defaultLanguage,
        },
        create: {
          code: plant.code,
          name: plant.name,
          timezone: plant.timezone,
          defaultLanguage: plant.defaultLanguage,
        },
      }),
    ),
  );

  const plantByCode = new Map(plants.map((plant) => [plant.code as "pl01" | "pl02", plant]));

  for (const plant of plants) {
    await upsertMasterData(plant.id);
  }

  const passwordHash = await hash(SEED_DEFAULT_PASSWORD, 12);

  const seedUsers: SeedUserDefinition[] = [
    {
      email: "corporate@ma-hse.local",
      name: "Corporate N1",
      language: "en",
      roleBindings: [
        { plantCode: "pl01", role: RoleCode.N1_CORPORATE },
        { plantCode: "pl02", role: RoleCode.N1_CORPORATE },
      ],
    },
    {
      email: "manager.pl01@ma-hse.local",
      name: "Plant Manager PL01 (N2)",
      language: "it",
      roleBindings: [{ plantCode: "pl01", role: RoleCode.N2_PLANT_MANAGER }],
    },
    {
      email: "manager.pl02@ma-hse.local",
      name: "Plant Manager PL02 (N2)",
      language: "pt",
      roleBindings: [{ plantCode: "pl02", role: RoleCode.N2_PLANT_MANAGER }],
    },
    {
      email: "safety.pl01@ma-hse.local",
      name: "Safety PL01 (N3)",
      language: "it",
      roleBindings: [{ plantCode: "pl01", role: RoleCode.N3_SAFETY }],
    },
    {
      email: "safety.pl02@ma-hse.local",
      name: "Safety PL02 (N3)",
      language: "pt",
      roleBindings: [{ plantCode: "pl02", role: RoleCode.N3_SAFETY }],
    },
    {
      email: "supervisor.pl01@ma-hse.local",
      name: "Supervisor PL01 (N4)",
      language: "it",
      roleBindings: [{ plantCode: "pl01", role: RoleCode.N4_SUPERVISOR }],
    },
    {
      email: "supervisor.pl02@ma-hse.local",
      name: "Supervisor PL02 (N4)",
      language: "pt",
      roleBindings: [{ plantCode: "pl02", role: RoleCode.N4_SUPERVISOR }],
    },
    {
      email: "operator.pl01@ma-hse.local",
      name: "Operator PL01 (N5)",
      language: "it",
      roleBindings: [{ plantCode: "pl01", role: RoleCode.N5_OPERATOR }],
    },
    {
      email: "operator.pl02@ma-hse.local",
      name: "Operator PL02 (N5)",
      language: "pt",
      roleBindings: [{ plantCode: "pl02", role: RoleCode.N5_OPERATOR }],
    },
    {
      email: "doctor.pl01@ma-hse.local",
      name: "Doctor PL01 (MEDICO)",
      language: "it",
      roleBindings: [{ plantCode: "pl01", role: RoleCode.MEDICO }],
    },
    {
      email: "doctor.pl02@ma-hse.local",
      name: "Doctor PL02 (MEDICO)",
      language: "pt",
      roleBindings: [{ plantCode: "pl02", role: RoleCode.MEDICO }],
    },
  ];

  const usersByEmail = new Map<string, Awaited<ReturnType<typeof upsertSeedUser>>>();

  for (const userDef of seedUsers) {
    const user = await upsertSeedUser(userDef, passwordHash);
    usersByEmail.set(userDef.email, user);
  }

  const n6ReferencePl01 = await upsertN6ReferenceUser({
    name: "QR Reporter Reference PL01 (N6)",
    language: "it",
  });

  const n6ReferencePl02 = await upsertN6ReferenceUser({
    name: "QR Reporter Reference PL02 (N6)",
    language: "pt",
  });

  const roleRows = await prisma.role.findMany();
  const roleLookup = new Map(roleRows.map((row) => [row.code, row.id]));

  for (const userDef of seedUsers) {
    const user = requireValue(usersByEmail.get(userDef.email), `Missing user seed for ${userDef.email}`);
    const bindings = userDef.roleBindings.map((roleBinding) => ({
      plantId: requireValue(plantByCode.get(roleBinding.plantCode), `Missing plant ${roleBinding.plantCode}`).id,
      roleId: requireValue(roleLookup.get(roleBinding.role), `Missing role id for ${roleBinding.role}`),
    }));
    await syncUserRoles(user.id, bindings);
  }

  await syncUserRoles(n6ReferencePl01.id, [
    {
      plantId: requireValue(plantByCode.get("pl01"), "Missing plant pl01").id,
      roleId: requireValue(roleLookup.get(RoleCode.N6_QR_REPORTER), "Missing role id for N6"),
    },
  ]);

  await syncUserRoles(n6ReferencePl02.id, [
    {
      plantId: requireValue(plantByCode.get("pl02"), "Missing plant pl02").id,
      roleId: requireValue(roleLookup.get(RoleCode.N6_QR_REPORTER), "Missing role id for N6"),
    },
  ]);

  const fixturePl01 = await getPlantFixture(requireValue(plantByCode.get("pl01"), "Missing plant pl01").id);
  const fixturePl02 = await getPlantFixture(requireValue(plantByCode.get("pl02"), "Missing plant pl02").id);

  const employeeSeed = [
    {
      plantCode: "pl01" as const,
      rows: [
        { employeeNo: "IT1001", name: "Mario Rossi", dept: "Assembly" },
        { employeeNo: "IT1002", name: "Giulia Bianchi", dept: "Packaging" },
      ],
    },
    {
      plantCode: "pl02" as const,
      rows: [
        { employeeNo: "BR2001", name: "Ana Silva", dept: "Assembly" },
        { employeeNo: "BR2002", name: "Carlos Souza", dept: "Packaging" },
      ],
    },
  ];

  for (const entry of employeeSeed) {
    const plant = requireValue(plantByCode.get(entry.plantCode), `Missing plant ${entry.plantCode}`);
    const shiftId = entry.plantCode === "pl01" ? fixturePl01.shiftId : fixturePl02.shiftId;
    for (const row of entry.rows) {
      await prisma.employeeDirectory.upsert({
        where: {
          plantId_employeeNo: {
            plantId: plant.id,
            employeeNo: row.employeeNo,
          },
        },
        update: {
          name: row.name,
          dept: row.dept,
          shiftId,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          employeeNo: row.employeeNo,
          name: row.name,
          dept: row.dept,
          shiftId,
          isActive: true,
        },
      });
    }
  }

  const catalog = await prisma.sEWOCauseCatalogVersion.upsert({
    where: { version: 1 },
    update: { name: "Default RCA Catalog v1", isActive: true },
    create: { version: 1, name: "Default RCA Catalog v1", isActive: true },
  });

  await prisma.sEWOCauseCategory.deleteMany({
    where: {
      versionId: catalog.id,
    },
  });

  const categoryDefinitions = [
    {
      name: "People",
      sortOrder: 1,
      items: ["No standard work", "Training gap", "Human error"],
    },
    {
      name: "Process",
      sortOrder: 2,
      items: ["Procedure missing", "No permit", "Control bypassed"],
    },
    {
      name: "Machine",
      sortOrder: 3,
      items: ["Maintenance overdue", "Guard missing", "Alarm disabled"],
    },
    {
      name: "Environment",
      sortOrder: 4,
      items: ["Poor housekeeping", "Lighting issue", "Ventilation issue"],
    },
  ];

  for (const categoryDefinition of categoryDefinitions) {
    const category = await prisma.sEWOCauseCategory.create({
      data: {
        id: stableUuid(`sewo-category:${catalog.id}:${categoryDefinition.name}`),
        versionId: catalog.id,
        name: categoryDefinition.name,
        sortOrder: categoryDefinition.sortOrder,
      },
    });

    await prisma.sEWOCauseItem.createMany({
      data: categoryDefinition.items.map((label, index) => ({
        id: stableUuid(`sewo-item:${catalog.id}:${categoryDefinition.name}:${label}`),
        categoryId: category.id,
        label,
        sortOrder: index + 1,
      })),
    });
  }

  for (const plant of plants) {
    for (const type of [PlantAccessTokenType.REPORT, PlantAccessTokenType.KIOSK]) {
      const tokenPlain = `${plant.code}-${type.toLowerCase()}-seed-token`;
      const tokenHash = hashAccessToken(tokenPlain);

      await prisma.plantAccessToken.upsert({
        where: {
          plantId_type_tokenHash: {
            plantId: plant.id,
            type,
            tokenHash,
          },
        },
        update: {
          isActive: true,
          revokedAt: null,
        },
        create: {
          id: stableUuid(`plant-token:${plant.code}:${type}`),
          plantId: plant.id,
          type,
          tokenHash,
          isActive: true,
        },
      });
    }
  }

  const corporateUser = requireValue(usersByEmail.get("corporate@ma-hse.local"), "Missing corporate user");
  const safetyPl01 = requireValue(usersByEmail.get("safety.pl01@ma-hse.local"), "Missing safety PL01 user");
  const safetyPl02 = requireValue(usersByEmail.get("safety.pl02@ma-hse.local"), "Missing safety PL02 user");
  const managerPl01 = requireValue(usersByEmail.get("manager.pl01@ma-hse.local"), "Missing manager PL01 user");
  const managerPl02 = requireValue(usersByEmail.get("manager.pl02@ma-hse.local"), "Missing manager PL02 user");

  const plantListPl01 = await getOrCreateRecipientList({
    name: "Plant Main Recipients - PL01",
    scope: "PLANT",
    plantId: requireValue(plantByCode.get("pl01"), "Missing plant pl01").id,
  });

  const plantListPl02 = await getOrCreateRecipientList({
    name: "Plant Main Recipients - PL02",
    scope: "PLANT",
    plantId: requireValue(plantByCode.get("pl02"), "Missing plant pl02").id,
  });

  const corpList = await getOrCreateRecipientList({
    name: "Corporate Recipients",
    scope: "CORPORATE",
  });

  const recipientRows = [
    { listId: plantListPl01.id, email: safetyPl01.email!, name: "Safety PL01" },
    { listId: plantListPl01.id, email: managerPl01.email!, name: "Manager PL01" },
    { listId: plantListPl02.id, email: safetyPl02.email!, name: "Safety PL02" },
    { listId: plantListPl02.id, email: managerPl02.email!, name: "Manager PL02" },
    { listId: corpList.id, email: corporateUser.email!, name: "Corporate N1" },
  ];

  for (const recipient of recipientRows) {
    await prisma.reportRecipient.upsert({
      where: {
        listId_email: {
          listId: recipient.listId,
          email: recipient.email,
        },
      },
      update: {
        name: recipient.name,
        isActive: true,
      },
      create: {
        listId: recipient.listId,
        email: recipient.email,
        name: recipient.name,
        isActive: true,
      },
    });
  }

  for (const plant of plants) {
    const alertRuleId = stableUuid(`alert-rule:${plant.code}:default`);
    await prisma.alertRule.upsert({
      where: { id: alertRuleId },
      update: {
        name: `Default repetitive alert ${plant.code.toUpperCase()}`,
        isActive: true,
        repetitionRule: {
          upsert: {
            create: {
              triggerType: AlertRuleTriggerType.N_IN_X_DAYS,
              thresholdCount: 3,
              windowDays: 30,
              consecutiveCount: null,
              sameWorkstation: true,
              sameEquipment: true,
              sameRiskTheme: true,
              sameWorker: false,
            },
            update: {
              triggerType: AlertRuleTriggerType.N_IN_X_DAYS,
              thresholdCount: 3,
              windowDays: 30,
              consecutiveCount: null,
              sameWorkstation: true,
              sameEquipment: true,
              sameRiskTheme: true,
              sameWorker: false,
            },
          },
        },
      },
      create: {
        id: alertRuleId,
        plantId: plant.id,
        name: `Default repetitive alert ${plant.code.toUpperCase()}`,
        isActive: true,
        repetitionRule: {
          create: {
            triggerType: AlertRuleTriggerType.N_IN_X_DAYS,
            thresholdCount: 3,
            windowDays: 30,
            consecutiveCount: null,
            sameWorkstation: true,
            sameEquipment: true,
            sameRiskTheme: true,
            sameWorker: false,
          },
        },
      },
    });
  }

  await seedPlantScenario({
    plantId: requireValue(plantByCode.get("pl01"), "Missing plant pl01").id,
    plantCode: "pl01",
    fixture: fixturePl01,
    actors: {
      n2UserId: managerPl01.id,
      n3UserId: safetyPl01.id,
      n4UserId: requireValue(usersByEmail.get("supervisor.pl01@ma-hse.local"), "Missing supervisor PL01 user").id,
      n5UserId: requireValue(usersByEmail.get("operator.pl01@ma-hse.local"), "Missing operator PL01 user").id,
      medicoUserId: requireValue(usersByEmail.get("doctor.pl01@ma-hse.local"), "Missing doctor PL01 user").id,
    },
    employeePrimaryNo: "IT1001",
    employeeSecondaryNo: "IT1002",
    catalogVersionId: catalog.id,
  });

  await seedPlantScenario({
    plantId: requireValue(plantByCode.get("pl02"), "Missing plant pl02").id,
    plantCode: "pl02",
    fixture: fixturePl02,
    actors: {
      n2UserId: managerPl02.id,
      n3UserId: safetyPl02.id,
      n4UserId: requireValue(usersByEmail.get("supervisor.pl02@ma-hse.local"), "Missing supervisor PL02 user").id,
      n5UserId: requireValue(usersByEmail.get("operator.pl02@ma-hse.local"), "Missing operator PL02 user").id,
      medicoUserId: requireValue(usersByEmail.get("doctor.pl02@ma-hse.local"), "Missing doctor PL02 user").id,
    },
    employeePrimaryNo: "BR2001",
    employeeSecondaryNo: "BR2002",
    catalogVersionId: catalog.id,
  });

  console.log("Seed complete.");
  console.log(`Default password for credential users: ${SEED_DEFAULT_PASSWORD}`);
  console.log("Credential users by role:");
  console.log("- N1: corporate@ma-hse.local");
  console.log("- N2: manager.pl01@ma-hse.local, manager.pl02@ma-hse.local");
  console.log("- N3: safety.pl01@ma-hse.local, safety.pl02@ma-hse.local");
  console.log("- N4: supervisor.pl01@ma-hse.local, supervisor.pl02@ma-hse.local");
  console.log("- N5: operator.pl01@ma-hse.local, operator.pl02@ma-hse.local");
  console.log("- MEDICO: doctor.pl01@ma-hse.local, doctor.pl02@ma-hse.local");
  console.log("- N6: token-only flow (no email login). Use fixed QR token routes below.");
  console.log("Sample QR tokens:");
  console.log("- pl01 REPORT token: pl01-report-seed-token");
  console.log("- pl01 KIOSK token: pl01-kiosk-seed-token");
  console.log("- pl02 REPORT token: pl02-report-seed-token");
  console.log("- pl02 KIOSK token: pl02-kiosk-seed-token");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
