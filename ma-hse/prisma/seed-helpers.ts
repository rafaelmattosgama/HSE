// Seed helpers shared by prisma/seed.ts and prisma/demo-seed.ts (moved verbatim from seed.ts).
import crypto from "node:crypto";
import {
  LeaveClassification,
  Prisma,
  PrismaClient,
  RoleCode,
} from "@prisma/client";
import { DEFAULT_FIRE_EQUIPMENT_TYPES } from "../lib/defaults/fire-equipment-types";
import { DEFAULT_NEAR_MISS_TYPES } from "../lib/defaults/near-miss-types";
import { DEFAULT_PROFESSIONAL_RISKS } from "../lib/defaults/professional-risks";
import { DEFAULT_UNSAFE_ACT_TYPES } from "../lib/defaults/unsafe-act-types";
import { DEFAULT_UNSAFE_CONDITION_TYPES, LEGACY_DEFAULT_UNSAFE_CONDITION_TYPES } from "../lib/defaults/unsafe-condition-types";

export const prisma = new PrismaClient();

export type SeedUserDefinition = {
  email: string;
  name: string;
  language: string;
  roleBindings: Array<{
    plantCode: "pl01" | "pl02" | "pl1" | null;
    role: RoleCode;
  }>;
};

export type PlantFixture = {
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

export type PlantActors = {
  n2UserId: string;
  n3UserId: string;
  n4UserId: string;
  n5UserId: string;
};

export function stableUuid(seed: string) {
  const hex = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function requireValue<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

export function calculateLeaveFields(eventDatetime: Date, hasLeave?: boolean | null, returnDate?: Date | null) {
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
    classification: lostDays < 30 ? LeaveClassification.MINOR : LeaveClassification.SERIOUS,
  };
}

export async function upsertMasterData(plantId: string) {
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
    rows: { code: string; name: string; category?: string }[],
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
            create: { plantId, category: row.category ?? "General", ...row },
          });
          break;
        case "unsafeActType":
          await prisma.unsafeActType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: { category: row.category ?? "General", name: row.name, isActive: true },
            create: { plantId, category: row.category ?? "General", ...row },
          });
          break;
        case "unsafeConditionType":
          await prisma.unsafeConditionType.upsert({
            where: { plantId_code: { plantId, code: row.code } },
            update: { category: row.category ?? "General", name: row.name, isActive: true },
            create: { plantId, category: row.category ?? "General", ...row },
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
    { code: "S4", name: "Central"}
  ]);
  await upsertRows("riskTheme", [
    { code: "RT01", category: "General", name: "PPE Non-compliance" },
    { code: "RT02", category: "General", name: "Slip/Trip/Fall" },
    ...DEFAULT_PROFESSIONAL_RISKS,
  ]);
  await upsertRows("unsafeActType", [
    ...DEFAULT_UNSAFE_ACT_TYPES,
  ]);
  await upsertRows("unsafeConditionType", [...DEFAULT_UNSAFE_CONDITION_TYPES]);
  await prisma.unsafeConditionType.updateMany({
    where: {
      plantId,
      OR: LEGACY_DEFAULT_UNSAFE_CONDITION_TYPES.map((row) => ({
        code: row.code,
        name: row.name,
      })),
    },
    data: {
      isActive: false,
    },
  });
  await upsertRows("nearMissType", [...DEFAULT_NEAR_MISS_TYPES]);
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

/**
 * Competence & Authorizations catalog seed — phase 1 (§3.1). All four types
 * ship with a 12-month validity and a mandatory practical assessment; per-type
 * periodicities are deferred to the catalog management screen in a later phase.
 *
 * §2.7: this is a development fixture, only ever called for the demo plants
 * (pl01, pl02, pl1) — see the call site below — alongside the fictional
 * communications and S-EWO seed data. A real plant's catalog is created from
 * scratch by its N3_SAFETY; this must never be wired into
 * app/api/corporate/plants/route.ts's plant-creation flow.
 */
export async function upsertCompetenceTypes(plantId: string) {
  const competenceTypes: Array<{
    code: string;
    name: string;
    category: "EQUIPMENT_OPERATION" | "HIGH_RISK_ACTIVITY";
    displayOrder: number;
  }> = [
    { code: "FORKLIFT", name: "Empilhador", category: "EQUIPMENT_OPERATION", displayOrder: 0 },
    { code: "MEWP", name: "Plataforma elevatória", category: "EQUIPMENT_OPERATION", displayOrder: 1 },
    { code: "OVERHEAD_CRANE", name: "Ponte rolante", category: "EQUIPMENT_OPERATION", displayOrder: 2 },
    { code: "WORK_AT_HEIGHT", name: "Trabalhos em altura", category: "HIGH_RISK_ACTIVITY", displayOrder: 3 },
  ];

  for (const type of competenceTypes) {
    await prisma.competenceType.upsert({
      where: { plantId_code: { plantId, code: type.code } },
      update: {
        name: type.name,
        category: type.category,
        displayOrder: type.displayOrder,
        requiresAssessment: true,
        validityMonths: 12,
        isActive: true,
      },
      create: {
        plantId,
        code: type.code,
        name: type.name,
        category: type.category,
        displayOrder: type.displayOrder,
        requiresTraining: true,
        requiresAssessment: true,
        requiresAuthorization: true,
        validityMonths: 12,
        refresherMonths: null,
        sourceLanguage: "pt",
      },
    });
  }
}

/**
 * Fire Safety Equipment catalog seed — phase 1 (§3.1). legalReference is left
 * null: the specification's own §14 flags those references as unverified
 * against HSE/legal, so nothing from this draft ships to an admin screen
 * without that review.
 *
 * The 5-type list itself lives in lib/defaults/fire-equipment-types.ts — it's
 * a fixed, universal taxonomy provisioned into every plant (demo and real),
 * not something each plant customizes the way the Competence catalog is.
 * FIRE_PANEL (superseded by the more granular ALARM_BUTTON/SMOKE_DETECTOR
 * split) is deactivated rather than removed, since its two checklist
 * templates below still resolve against the row by code either way.
 */
export async function upsertFireEquipmentTypes(plantId: string) {
  for (const type of DEFAULT_FIRE_EQUIPMENT_TYPES) {
    await prisma.fireEquipmentType.upsert({
      where: { plantId_code: { plantId, code: type.code } },
      update: {
        name: type.name,
        category: type.category,
        codePrefix: type.codePrefix,
        displayOrder: type.displayOrder,
        isActive: true,
      },
      create: {
        plantId,
        code: type.code,
        name: type.name,
        category: type.category,
        codePrefix: type.codePrefix,
        displayOrder: type.displayOrder,
        legalReference: null,
        sourceLanguage: "pt",
      },
    });
  }

  await prisma.fireEquipmentType.updateMany({
    where: { plantId, code: "FIRE_PANEL" },
    data: { isActive: false },
  });
}

export type FireChecklistItemSeed = {
  code: string;
  label: string;
  responseType: "OK_NOK" | "OK_NOK_NA" | "NUMERIC" | "TEXT";
  isCritical: boolean;
};

export type FireChecklistTemplateSeed = {
  typeCode: "EXTINGUISHER" | "HOSE_REEL" | "EMERGENCY_LIGHT" | "FIRE_PANEL";
  frequency: "QUARTERLY" | "ANNUAL";
  name: string;
  items: FireChecklistItemSeed[];
};

/**
 * §3.4 example checklists — a starting point to validate with HSE, not a
 * normative list (the spec says so explicitly). isCritical is only set on
 * the three items the phase-2 brief calls out by name: extinguisher weight,
 * the emergency light's full autonomy test, and an attached external
 * certificate/report — everything else defaults to non-critical.
 */
export const FIRE_CHECKLIST_TEMPLATES: FireChecklistTemplateSeed[] = [
  {
    typeCode: "EXTINGUISHER",
    frequency: "QUARTERLY",
    name: "Verificação trimestral — Extintores",
    items: [
      { code: "LOCATION_ACCESS", label: "Localização e acessibilidade desimpedidas", responseType: "OK_NOK", isCritical: false },
      { code: "SIGNAGE_VISIBLE", label: "Sinalética visível", responseType: "OK_NOK", isCritical: false },
      { code: "SEAL_INTACT", label: "Selo/lacre intacto", responseType: "OK_NOK", isCritical: false },
      { code: "PRESSURE_GAUGE", label: "Manómetro na zona verde", responseType: "NUMERIC", isCritical: false },
      { code: "NO_CORROSION", label: "Sem corrosão ou danos visíveis", responseType: "OK_NOK", isCritical: false },
      { code: "HOSE_CONDITION", label: "Mangueira/difusor em bom estado", responseType: "OK_NOK", isCritical: false },
      { code: "LABEL_LEGIBLE", label: "Ficha de identificação/etiqueta legível", responseType: "OK_NOK", isCritical: false },
    ],
  },
  {
    typeCode: "EXTINGUISHER",
    frequency: "ANNUAL",
    name: "Manutenção anual — Extintores",
    items: [
      { code: "LOCATION_ACCESS", label: "Localização e acessibilidade desimpedidas", responseType: "OK_NOK", isCritical: false },
      { code: "SIGNAGE_VISIBLE", label: "Sinalética visível", responseType: "OK_NOK", isCritical: false },
      { code: "SEAL_INTACT", label: "Selo/lacre intacto", responseType: "OK_NOK", isCritical: false },
      { code: "PRESSURE_GAUGE", label: "Manómetro na zona verde", responseType: "NUMERIC", isCritical: false },
      { code: "NO_CORROSION", label: "Sem corrosão ou danos visíveis", responseType: "OK_NOK", isCritical: false },
      { code: "HOSE_CONDITION", label: "Mangueira/difusor em bom estado", responseType: "OK_NOK", isCritical: false },
      { code: "LABEL_LEGIBLE", label: "Ficha de identificação/etiqueta legível", responseType: "OK_NOK", isCritical: false },
      { code: "WEIGHT_CHECK", label: "Peso conferido", responseType: "NUMERIC", isCritical: true },
      { code: "VALVE_TRIGGER_TEST", label: "Válvula e mecanismo de disparo testados", responseType: "OK_NOK", isCritical: false },
      { code: "AGENT_REPLACED", label: "Substituição de agente extintor, se aplicável", responseType: "OK_NOK_NA", isCritical: false },
      { code: "CERTIFICATE_ATTACHED", label: "Relatório da entidade certificadora anexado", responseType: "OK_NOK", isCritical: true },
    ],
  },
  {
    typeCode: "HOSE_REEL",
    frequency: "QUARTERLY",
    name: "Verificação trimestral — Carretéis de incêndio",
    items: [
      { code: "ACCESS_SIGNAGE", label: "Acessibilidade e sinalética", responseType: "OK_NOK", isCritical: false },
      { code: "VALVE_NO_LEAKS", label: "Válvula sem fugas", responseType: "OK_NOK", isCritical: false },
      { code: "HOSE_NO_CRACKS", label: "Mangueira sem fissuras", responseType: "OK_NOK", isCritical: false },
      { code: "NOZZLE_FUNCTIONAL", label: "Lança/agulheta funcional", responseType: "OK_NOK", isCritical: false },
      { code: "CABINET_CLOSES", label: "Caixa/armário fecha corretamente", responseType: "OK_NOK", isCritical: false },
    ],
  },
  {
    typeCode: "HOSE_REEL",
    frequency: "ANNUAL",
    name: "Manutenção anual — Carretéis de incêndio",
    items: [
      { code: "ACCESS_SIGNAGE", label: "Acessibilidade e sinalética", responseType: "OK_NOK", isCritical: false },
      { code: "VALVE_NO_LEAKS", label: "Válvula sem fugas", responseType: "OK_NOK", isCritical: false },
      { code: "HOSE_NO_CRACKS", label: "Mangueira sem fissuras", responseType: "OK_NOK", isCritical: false },
      { code: "NOZZLE_FUNCTIONAL", label: "Lança/agulheta funcional", responseType: "OK_NOK", isCritical: false },
      { code: "CABINET_CLOSES", label: "Caixa/armário fecha corretamente", responseType: "OK_NOK", isCritical: false },
      { code: "PRESSURE_FLOW_TEST", label: "Ensaio de pressão e caudal", responseType: "NUMERIC", isCritical: false },
      { code: "HOSE_INTERNAL_STATE", label: "Estado interno da mangueira desenrolada por completo", responseType: "OK_NOK", isCritical: false },
    ],
  },
  {
    typeCode: "EMERGENCY_LIGHT",
    frequency: "QUARTERLY",
    name: "Verificação trimestral — Blocos autónomos de emergência",
    items: [
      { code: "CHARGE_INDICATOR_ON", label: "Indicador luminoso de carga aceso", responseType: "OK_NOK", isCritical: false },
      { code: "QUICK_SWITCHOVER_TEST", label: "Teste funcional rápido (comutação para bateria)", responseType: "OK_NOK", isCritical: false },
      { code: "DIFFUSER_CLEAN_VISIBLE", label: "Sinalética/difusor limpo e visível", responseType: "OK_NOK", isCritical: false },
    ],
  },
  {
    typeCode: "EMERGENCY_LIGHT",
    frequency: "ANNUAL",
    name: "Manutenção anual — Blocos autónomos de emergência",
    items: [
      { code: "FULL_AUTONOMY_TEST", label: "Ensaio de autonomia completo (60 minutos, conforme NP EN 62034)", responseType: "NUMERIC", isCritical: true },
      { code: "BATTERY_REPLACED", label: "Substituição de bateria, se necessário", responseType: "OK_NOK_NA", isCritical: false },
    ],
  },
  {
    typeCode: "FIRE_PANEL",
    frequency: "QUARTERLY",
    name: "Verificação trimestral — Central de deteção e alarme de incêndio",
    items: [
      { code: "NO_ACTIVE_FAULTS", label: "Ausência de avarias ativas no painel", responseType: "OK_NOK", isCritical: false },
      { code: "ZONE_SAMPLE_TEST", label: "Teste de uma zona/detetor por amostragem", responseType: "OK_NOK", isCritical: false },
      { code: "EVENT_LOG_OPERATIONAL", label: "Impressora/registo de eventos operacional", responseType: "OK_NOK", isCritical: false },
      { code: "ARC_COMMUNICATION", label: "Comunicação com a central de receção de alarmes confirmada, se aplicável", responseType: "OK_NOK_NA", isCritical: false },
    ],
  },
  {
    typeCode: "FIRE_PANEL",
    frequency: "ANNUAL",
    name: "Manutenção anual — Central de deteção e alarme de incêndio",
    items: [
      { code: "ALL_ZONES_TEST", label: "Teste funcional de todas as zonas", responseType: "OK_NOK", isCritical: false },
      { code: "BACKUP_BATTERY_VOLTAGE", label: "Verificação de baterias de backup (tensão)", responseType: "NUMERIC", isCritical: false },
      { code: "CERTIFICATE_ATTACHED", label: "Relatório da entidade certificadora anexado", responseType: "OK_NOK", isCritical: true },
    ],
  },
];

/**
 * §3.4 checklist catalog seed — phase 2. Faithful to §3.4 rule 3: this only
 * ever upserts by (templateId, code), so re-running the seed against a
 * template that already has real responses just updates the row in place
 * (label/order/critical flag) rather than duplicating it — the "deactivate
 * and recreate with a new code" rule only applies once an admin edits an
 * item that already has answers, which this seed never does.
 */
export async function upsertFireChecklistTemplates(plantId: string) {
  const types = await prisma.fireEquipmentType.findMany({
    where: { plantId },
    select: { id: true, code: true },
  });
  const typeIdByCode = new Map(types.map((type) => [type.code, type.id]));

  for (const template of FIRE_CHECKLIST_TEMPLATES) {
    const fireEquipmentTypeId = typeIdByCode.get(template.typeCode);
    if (!fireEquipmentTypeId) continue;

    const templateRow = await prisma.fireChecklistTemplate.upsert({
      where: {
        plantId_fireEquipmentTypeId_frequency: {
          plantId,
          fireEquipmentTypeId,
          frequency: template.frequency,
        },
      },
      update: {
        name: template.name,
        isActive: true,
      },
      create: {
        plantId,
        fireEquipmentTypeId,
        frequency: template.frequency,
        name: template.name,
        legalReference: null,
        sourceLanguage: "pt",
      },
    });

    for (const [index, item] of template.items.entries()) {
      await prisma.fireChecklistItem.upsert({
        where: {
          templateId_code: {
            templateId: templateRow.id,
            code: item.code,
          },
        },
        update: {
          label: item.label,
          responseType: item.responseType,
          isCritical: item.isCritical,
          displayOrder: index,
          isActive: true,
        },
        create: {
          templateId: templateRow.id,
          code: item.code,
          label: item.label,
          responseType: item.responseType,
          isCritical: item.isCritical,
          displayOrder: index,
        },
      });
    }
  }
}

export async function upsertSeedUser(user: SeedUserDefinition, passwordHash: string) {
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

export async function ensureUserRole(input: { userId: string; plantId: string | null; roleId: string }) {
  const existing = await prisma.userPlantRole.findFirst({
    where: {
      userId: input.userId,
      plantId: input.plantId,
      roleId: input.roleId,
    },
  });

  if (existing) {
    return;
  }

  await prisma.userPlantRole.create({
    data: {
      userId: input.userId,
      plantId: input.plantId,
      roleId: input.roleId,
    },
  });
}

export async function syncUserRoles(
  userId: string,
  targetRoleBindings: Array<{
    plantId: string | null;
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

export async function getPlantFixture(plantId: string): Promise<PlantFixture> {
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

export async function upsertCommunication(input: Prisma.CommunicationUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.communication.upsert({
    where: { id: requireValue(id, "Communication id is required for upsert") },
    update: updateData,
    create: input,
  });
}

export async function upsertAction(input: Prisma.ActionUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.action.upsert({
    where: { id: requireValue(id, "Action id is required for upsert") },
    update: updateData,
    create: input,
  });
}

export async function upsertCommunicationAttachment(input: Prisma.CommunicationAttachmentUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.communicationAttachment.upsert({
    where: { id: requireValue(id, "Communication attachment id is required for upsert") },
    update: updateData,
    create: input,
  });
}

export async function upsertActionEvidenceAttachment(input: Prisma.ActionEvidenceAttachmentUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.actionEvidenceAttachment.upsert({
    where: { id: requireValue(id, "Action evidence attachment id is required for upsert") },
    update: updateData,
    create: input,
  });
}

export async function upsertSEWO(input: Prisma.SEWOUncheckedCreateInput) {
  const { id, ...updateData } = input;
  return prisma.sEWO.upsert({
    where: { id: requireValue(id, "SEWO id is required for upsert") },
    update: updateData,
    create: input,
  });
}

export async function syncActionCoOwners(actionId: string, userIds: string[]) {
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

export async function upsertSewoCauseCatalog(): Promise<{ id: string }> {
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

  return catalog;
}
