import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { buildStorageKey } from "@/lib/helpers";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";
import { issuePresignedUploadInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const parsed = await parseBody(request, issuePresignedUploadInput);
  if ("error" in parsed) return parsed.error;

  const auth = await requirePlantAccess(parsed.data.plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  await getPlantByCode(parsed.data.plantCode);

  const key = buildStorageKey({
    plantCode: parsed.data.plantCode,
    folder: parsed.data.folder,
    fileName: parsed.data.fileName,
  });

  const presigned = await StorageService.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
  });

  return ok(presigned);
}