import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { parseDateKey, toUtcDateKey } from "@/lib/safety-days";
import { getPlantSafetyDaysConfig, setPlantSafetyDaysConfig } from "@/lib/services/parameter-service";

const safetyDaysSchema = z.object({
  manualLastAccidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  historicalRecordDays: z.number().int().nonnegative().nullable().optional(),
  historicalRecordStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const config = await getPlantSafetyDaysConfig(plant.id);

  return ok(config);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, safetyDaysSchema);
  if ("error" in parsed) return parsed.error;

  const manualDate = parsed.data.manualLastAccidentDate;
  const parsedDate = parseDateKey(manualDate);
  const historicalRecordStartDate = parsed.data.historicalRecordStartDate;
  const parsedHistoricalRecordStartDate = parseDateKey(historicalRecordStartDate);

  if (manualDate && !parsedDate) {
    return fail("INVALID_INPUT", "Invalid last accident date", 422);
  }

  if (historicalRecordStartDate && !parsedHistoricalRecordStartDate) {
    return fail("INVALID_INPUT", "Invalid historical record start date", 422);
  }

  if (parsedDate && toUtcDateKey(parsedDate) > toUtcDateKey(new Date())) {
    return fail("INVALID_INPUT", "Last accident date cannot be in the future", 422);
  }

  if (parsedHistoricalRecordStartDate && toUtcDateKey(parsedHistoricalRecordStartDate) > toUtcDateKey(new Date())) {
    return fail("INVALID_INPUT", "Historical record start date cannot be in the future", 422);
  }

  const plant = await getPlantByCode(plantCode);
  const config = {
    manualLastAccidentDate: parsedDate ? toUtcDateKey(parsedDate) : null,
    historicalRecordDays: parsed.data.historicalRecordDays ?? null,
    historicalRecordStartDate: parsedHistoricalRecordStartDate ? toUtcDateKey(parsedHistoricalRecordStartDate) : null,
  };
  await setPlantSafetyDaysConfig(plant.id, config);

  return ok(config);
}
