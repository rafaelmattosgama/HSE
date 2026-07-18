import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import {
  getMasterDataTranslationState,
  saveManualMasterDataTranslation,
} from "@/lib/services/master-data-translation-service";
import { upsertMasterDataTranslationInput } from "@/lib/validation/dtos";

const MANAGE_TRANSLATION_ROLES = [RoleCode.N0_ADMIN];

function parseEntityType(value: string | null) {
  return value && Object.values(MasterDataEntityType).includes(value as MasterDataEntityType)
    ? (value as MasterDataEntityType)
    : null;
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_TRANSLATION_ROLES);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const entityType = parseEntityType(url.searchParams.get("entityType"));
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return fail("INVALID_INPUT", "A valid entityType and entityId are required", 422);
  }

  const [plant, state] = await Promise.all([
    getPlantByCode(plantCode),
    getMasterDataTranslationState({ entityType, entityId }),
  ]);
  if (!state || state.snapshot.plantId !== plant.id) {
    return fail("NOT_FOUND", "Master Data item not found for the selected plant", 404);
  }

  return ok({
    entity: {
      id: state.snapshot.id,
      entityType,
      sourceLanguage: state.snapshot.sourceLanguage ?? state.snapshot.plantLanguage,
      original: Object.fromEntries(
        state.snapshot.fields.map((field) => [field.field.toLowerCase(), field.value]),
      ),
    },
    translations: state.translations,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_TRANSLATION_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertMasterDataTranslationInput);
  if ("error" in parsed) return parsed.error;
  const [plant, state] = await Promise.all([
    getPlantByCode(plantCode),
    getMasterDataTranslationState({
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    }),
  ]);
  if (!state || state.snapshot.plantId !== plant.id) {
    return fail("NOT_FOUND", "Master Data item not found for the selected plant", 404);
  }

  const translation = await saveManualMasterDataTranslation(parsed.data);
  if (!translation) {
    return fail("INVALID_FIELD", "The selected field is not available for this entity", 422);
  }
  return ok({ translation });
}
