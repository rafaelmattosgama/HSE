import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { DEFAULT_UNSAFE_ACT_TYPES } from "@/lib/defaults/unsafe-act-types";
import { DEFAULT_UNSAFE_CONDITION_TYPES } from "@/lib/defaults/unsafe-condition-types";
import { DEFAULT_NEAR_MISS_TYPES } from "@/lib/defaults/near-miss-types";
import { DEFAULT_INJURY_TYPES } from "@/lib/defaults/injury-types";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";

export const generalCatalogTypeSchema = z.enum(["unsafeActType", "unsafeConditionType", "nearMissType", "injuryType", "riskTheme"]);
export type GeneralCatalogType = z.infer<typeof generalCatalogTypeSchema>;
const itemSchema = z.object({
  id: z.string().min(1), code: z.string().trim().min(1), name: z.string().trim().min(1),
  category: z.string().default("General"), isActive: z.boolean().default(true),
});
export type GeneralCatalogItem = z.infer<typeof itemSchema>;
export const generalCatalogInput = itemSchema.omit({ isActive: true }).extend({
  id: z.string().min(1).optional(), type: generalCatalogTypeSchema,
});
export const generalCatalogDeleteInput = z.object({
  type: generalCatalogTypeSchema, id: z.string().min(1).optional(), deleteAll: z.boolean().optional(),
}).refine((data) => Boolean(data.id || data.deleteAll), { message: "Select an item." });

const defaults = {
  unsafeActType: DEFAULT_UNSAFE_ACT_TYPES,
  unsafeConditionType: DEFAULT_UNSAFE_CONDITION_TYPES,
  nearMissType: DEFAULT_NEAR_MISS_TYPES,
  injuryType: DEFAULT_INJURY_TYPES.map((name, i) => ({ code: `IT${String(i + 1).padStart(2, "0")}`, name })),
  riskTheme: DEFAULT_PROFESSIONAL_RISKS,
};
export const generalCatalogKey = (type: GeneralCatalogType) => `GENERAL_CATALOG_${type}`;

export async function readStoredGeneralCatalog(type: GeneralCatalogType, tx: Prisma.TransactionClient = prisma) {
  const parameter = await tx.systemParameter.findFirst({ where: { plantId: null, key: generalCatalogKey(type) } });
  return parameter ? z.array(itemSchema).parse(parameter.valueJson) : null;
}

export async function readGeneralCatalog(type: GeneralCatalogType, tx: Prisma.TransactionClient = prisma): Promise<GeneralCatalogItem[]> {
  const stored = await readStoredGeneralCatalog(type, tx);
  if (stored) return stored;
  // Until a common catalogue is saved, retain existing plant entries in the editor.
  // Resolve duplicate codes deterministically, independently of the selected plant.
  const query = { orderBy: [{ plantId: "asc" as const }, { code: "asc" as const }] };
  const rows = type === "unsafeActType" ? await tx.unsafeActType.findMany(query)
    : type === "unsafeConditionType" ? await tx.unsafeConditionType.findMany(query)
    : type === "nearMissType" ? await tx.nearMissType.findMany(query)
    : type === "injuryType" ? await tx.injuryType.findMany(query)
    : await tx.riskTheme.findMany(query);
  const source = rows.length ? rows : defaults[type];
  const byCode = new Map<string, GeneralCatalogItem>();
  for (const row of source) {
    if (!byCode.has(row.code)) byCode.set(row.code, {
      id: row.code, code: row.code, name: row.name,
      category: "category" in row ? String(row.category) : "General",
      isActive: "isActive" in row ? Boolean(row.isActive) : true,
    });
  }
  return [...byCode.values()];
}

async function applyCatalog(tx: Prisma.TransactionClient, type: GeneralCatalogType, rows: GeneralCatalogItem[], plantIds: string[]) {
  if (!plantIds.length) return;
  const excluded = { plantId: { in: plantIds }, code: { notIn: rows.map(row => row.code) } };
  const deactivate = { where: excluded, data: { isActive: false } };
  switch (type) {
    case "unsafeActType": await tx.unsafeActType.updateMany(deactivate); break;
    case "unsafeConditionType": await tx.unsafeConditionType.updateMany(deactivate); break;
    case "nearMissType": await tx.nearMissType.updateMany(deactivate); break;
    case "injuryType": await tx.injuryType.updateMany(deactivate); break;
    case "riskTheme": await tx.riskTheme.updateMany(deactivate); break;
  }
  // Keep existing row IDs: communications and historical reports refer to them.
  for (const row of rows) {
    const data = { code: row.code, name: row.name, isActive: row.isActive };
    const categorized = { ...data, category: row.category };
    const where = { plantId: { in: plantIds }, code: row.code };
    switch (type) {
      case "unsafeActType":
        await tx.unsafeActType.updateMany({ where, data: categorized });
        await tx.unsafeActType.createMany({ data: plantIds.map(plantId => ({ plantId, ...categorized })), skipDuplicates: true });
        break;
      case "unsafeConditionType":
        await tx.unsafeConditionType.updateMany({ where, data: categorized });
        await tx.unsafeConditionType.createMany({ data: plantIds.map(plantId => ({ plantId, ...categorized })), skipDuplicates: true });
        break;
      case "nearMissType":
        await tx.nearMissType.updateMany({ where, data });
        await tx.nearMissType.createMany({ data: plantIds.map(plantId => ({ plantId, ...data })), skipDuplicates: true });
        break;
      case "injuryType":
        await tx.injuryType.updateMany({ where, data });
        await tx.injuryType.createMany({ data: plantIds.map(plantId => ({ plantId, ...data })), skipDuplicates: true });
        break;
      case "riskTheme":
        await tx.riskTheme.updateMany({ where, data: { ...categorized, sourceLanguage: null, categorySourceLanguage: null } });
        await tx.riskTheme.createMany({ data: plantIds.map(plantId => ({ plantId, ...categorized })), skipDuplicates: true });
        break;
    }
  }
}

export class GeneralSettingsError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function mutateGeneralCatalog(
  input: z.infer<typeof generalCatalogInput> | z.infer<typeof generalCatalogDeleteInput>,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize common catalogue edits to avoid losing another administrator's changes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${generalCatalogKey(input.type)}))`;
    const before = await readGeneralCatalog(input.type, tx);
    const existing = input.id ? before.find(row => row.id === input.id) : null;
    if (input.id && !existing) throw new GeneralSettingsError("Item not found.", 404);
    let rows: GeneralCatalogItem[];
    let item: GeneralCatalogItem | undefined;
    if ("name" in input) {
      const duplicate = before.find(row => row.code === input.code && row.id !== input.id);
      if (duplicate && (existing || duplicate.isActive)) throw new GeneralSettingsError("An item with this code already exists.", 409);
      item = { id: existing?.id ?? duplicate?.id ?? randomUUID(), code: input.code, name: input.name, category: input.category || "General", isActive: true };
      rows = [...before.filter(row => row.id !== item!.id), item];
      if (existing && existing.code !== input.code) {
        const rename = { where: { code: existing.code }, data: { code: input.code } };
        switch (input.type) {
          case "unsafeActType": await tx.unsafeActType.updateMany(rename); break;
          case "unsafeConditionType": await tx.unsafeConditionType.updateMany(rename); break;
          case "nearMissType": await tx.nearMissType.updateMany(rename); break;
          case "injuryType": await tx.injuryType.updateMany(rename); break;
          case "riskTheme": await tx.riskTheme.updateMany(rename); break;
        }
      }
    } else {
      rows = before.map(row => input.deleteAll || row.id === input.id ? { ...row, isActive: false } : row);
    }
    const key = generalCatalogKey(input.type);
    const parameter = await tx.systemParameter.findFirst({ where: { plantId: null, key } });
    if (parameter) await tx.systemParameter.update({ where: { id: parameter.id }, data: { valueJson: rows } });
    else await tx.systemParameter.create({ data: { plantId: null, key, valueJson: rows } });
    const plants = await tx.plant.findMany({ select: { id: true } });
    await applyCatalog(tx, input.type, rows, plants.map(plant => plant.id));
    await writeAuditLog({ entityType: "GeneralCatalog", entityId: input.type, action: "APPLY_TO_ALL_PLANTS", actorUserId,
      diff: { before: { items: before }, after: { items: rows }, fieldsChanged: ["items"] } }, tx);
    return { item, risk: item, deletedId: input.id, deleteAll: "deleteAll" in input && input.deleteAll, deletedCount: before.filter(row => row.isActive).length };
  }, { timeout: 60000 });
}

export async function applyGeneralCatalogsToNewPlant(tx: Prisma.TransactionClient, plantId: string) {
  for (const type of generalCatalogTypeSchema.options) {
    const rows = await readStoredGeneralCatalog(type, tx);
    if (rows) await applyCatalog(tx, type, rows, [plantId]);
  }
}
