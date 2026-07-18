import crypto from "node:crypto";
import { hash } from "bcryptjs";
import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { DEFAULT_SHIFT_MASTER_DATA } from "@/lib/defaults/shifts";
import { DEFAULT_INJURY_TYPES } from "@/lib/defaults/injury-types";
import { DEFAULT_NEAR_MISS_TYPES } from "@/lib/defaults/near-miss-types";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { DEFAULT_UNSAFE_ACT_TYPES } from "@/lib/defaults/unsafe-act-types";
import { DEFAULT_UNSAFE_CONDITION_TYPES } from "@/lib/defaults/unsafe-condition-types";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import { scheduleMasterDataTranslations } from "@/lib/services/master-data-translation-service";
import { getRoleAssignmentPlantId } from "@/lib/rbac/user-management";
import { createCorporatePlantInput, updateCorporatePlantLanguageInput } from "@/lib/validation/dtos";

const DEFAULT_MASTER_DATA = {
  areas: [
    { code: "A1", name: "Assembly" },
    { code: "A2", name: "Packaging" },
  ],
  lines: [
    { code: "L1", name: "Line 1" },
    { code: "L2", name: "Line 2" },
  ],
  workstations: [
    { code: "WS1", name: "Station 1" },
    { code: "WS2", name: "Station 2" },
  ],
  equipments: [
    { code: "EQ1", name: "Equipment 1" },
  ],
  shifts: DEFAULT_SHIFT_MASTER_DATA,
  riskThemes: DEFAULT_PROFESSIONAL_RISKS,
  unsafeActTypes: DEFAULT_UNSAFE_ACT_TYPES,
  unsafeConditionTypes: DEFAULT_UNSAFE_CONDITION_TYPES,
  nearMissTypes: DEFAULT_NEAR_MISS_TYPES,
  bodyParts: [
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
  ],
  injuryTypes: [
    ...DEFAULT_INJURY_TYPES.map((name, index) => ({
      code: `IT${String(index + 1).padStart(2, "0")}`,
      name,
    })),
  ],
} as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

async function ensureRole(roleCode: RoleCode) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new Error(`Role ${roleCode} not found`);
  }
  return role;
}

async function ensurePlantDefaults(plantId: string) {
  await prisma.$transaction(async (tx) => {
    for (const row of DEFAULT_MASTER_DATA.areas) {
      await tx.area.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, sourceLanguage: "en", isActive: true },
        create: { plantId, ...row, sourceLanguage: "en" },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.lines) {
      await tx.line.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.workstations) {
      await tx.workstation.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, sourceLanguage: "en", isActive: true },
        create: { plantId, ...row, sourceLanguage: "en" },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.equipments) {
      await tx.equipment.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, sourceLanguage: "en", isActive: true },
        create: { plantId, ...row, sourceLanguage: "en" },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.shifts) {
      await tx.shift.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.riskThemes) {
      await tx.riskTheme.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { category: row.category, name: row.name, sourceLanguage: "pt", categorySourceLanguage: "en", isActive: true },
        create: { plantId, ...row, sourceLanguage: "pt", categorySourceLanguage: "en" },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.unsafeActTypes) {
      await tx.unsafeActType.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { category: row.category, name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.unsafeConditionTypes) {
      await tx.unsafeConditionType.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { category: row.category, name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.nearMissTypes) {
      await tx.nearMissType.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.bodyParts) {
      await tx.bodyPart.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }

    for (const row of DEFAULT_MASTER_DATA.injuryTypes) {
      await tx.injuryType.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }
  });

  const [areas, workstations, equipments, riskThemes] = await prisma.$transaction([
    prisma.area.findMany({ where: { plantId }, select: { id: true } }),
    prisma.workstation.findMany({ where: { plantId }, select: { id: true } }),
    prisma.equipment.findMany({ where: { plantId }, select: { id: true } }),
    prisma.riskTheme.findMany({ where: { plantId }, select: { id: true } }),
  ]);
  await Promise.all([
    ...areas.map((row) => scheduleMasterDataTranslations({ entityType: MasterDataEntityType.AREA, entityId: row.id })),
    ...workstations.map((row) => scheduleMasterDataTranslations({ entityType: MasterDataEntityType.WORKSTATION, entityId: row.id })),
    ...equipments.map((row) => scheduleMasterDataTranslations({ entityType: MasterDataEntityType.EQUIPMENT, entityId: row.id })),
    ...riskThemes.map((row) => scheduleMasterDataTranslations({ entityType: MasterDataEntityType.RISK_THEME, entityId: row.id })),
  ]);
}

async function ensureUserWithRole(input: {
  email: string;
  name: string;
  language: string;
  plantId: string;
  roleCode: RoleCode;
}) {
  const email = normalizeEmail(input.email);
  const role = await ensureRole(input.roleCode);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  const generatedPassword = !existingUser?.passwordHash ? generateTemporaryPassword() : null;
  const passwordHash = generatedPassword ? await hash(generatedPassword, 12) : existingUser?.passwordHash ?? null;

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: input.name.trim(),
          language: input.language,
          isActive: true,
          ...(generatedPassword ? { passwordHash, forcePasswordChange: true } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          name: input.name.trim(),
          language: input.language,
          isActive: true,
          passwordHash,
          forcePasswordChange: Boolean(generatedPassword),
        },
      });

  const rolePlantId = getRoleAssignmentPlantId(input.roleCode, input.plantId);
  const existingRole = await prisma.userPlantRole.findFirst({
    where: {
      userId: user.id,
      plantId: rolePlantId,
      roleId: role.id,
    },
  });

  if (!existingRole) {
    await prisma.userPlantRole.create({
      data: {
        userId: user.id,
        plantId: rolePlantId,
        roleId: role.id,
      },
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: input.roleCode,
    generatedPassword,
  };
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const canManagePlants = auth.session.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );
  if (!canManagePlants) {
    return fail("FORBIDDEN", "Corporate or admin role required", 403);
  }

  const parsed = await parseBody(request, createCorporatePlantInput);
  if ("error" in parsed) return parsed.error;

  const code = parsed.data.code.trim().toLowerCase();
  const plant = await prisma.plant.upsert({
    where: { code },
    update: {
      name: parsed.data.name.trim(),
      timezone: parsed.data.timezone.trim(),
      defaultLanguage: parsed.data.defaultLanguage,
      isActive: true,
    },
    create: {
      code,
      name: parsed.data.name.trim(),
      timezone: parsed.data.timezone.trim(),
      defaultLanguage: parsed.data.defaultLanguage,
      isActive: true,
    },
  });

  await ensurePlantDefaults(plant.id);

  const n1 = await ensureUserWithRole({
    email: parsed.data.n1.email,
    name: parsed.data.n1.name,
    language: parsed.data.n1.language ?? "en",
    plantId: plant.id,
    roleCode: RoleCode.N1_CORPORATE,
  });
  const n2 = await ensureUserWithRole({
    email: parsed.data.n2.email,
    name: parsed.data.n2.name,
    language: parsed.data.n2.language ?? parsed.data.defaultLanguage,
    plantId: plant.id,
    roleCode: RoleCode.N2_PLANT_MANAGER,
  });
  const n3 = await ensureUserWithRole({
    email: parsed.data.n3.email,
    name: parsed.data.n3.name,
    language: parsed.data.n3.language ?? parsed.data.defaultLanguage,
    plantId: plant.id,
    roleCode: RoleCode.N3_SAFETY,
  });

  return ok(
    {
      plant,
      users: [n1, n2, n3],
      generatedPasswords: [n1, n2, n3]
        .filter((entry) => entry.generatedPassword)
        .map((entry) => ({
          role: entry.role,
          email: entry.email,
          password: entry.generatedPassword,
        })),
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const isAdmin = auth.session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  if (!isAdmin) {
    return fail("FORBIDDEN", "Admin role required", 403);
  }

  const parsed = await parseBody(request, updateCorporatePlantLanguageInput);
  if ("error" in parsed) return parsed.error;

  const plant = await prisma.plant.update({
    where: { id: parsed.data.plantId },
    data: {
      defaultLanguage: parsed.data.defaultLanguage,
    },
  });

  return ok({ plant });
}
