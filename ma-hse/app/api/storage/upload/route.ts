import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { buildStorageKey } from "@/lib/helpers";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";
import { parseAttachmentUploadForm } from "@/lib/storage-upload";

const ATTACHMENT_UPLOAD_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.MEDICO,
];

export async function POST(request: Request) {
  const parsed = await parseAttachmentUploadForm(request);
  if ("error" in parsed) return parsed.error;

  const auth = await requirePlantAccess(parsed.data.plantCode, ATTACHMENT_UPLOAD_ROLES);
  if ("error" in auth) return auth.error;

  await getPlantByCode(parsed.data.plantCode);

  const key = buildStorageKey({
    plantCode: parsed.data.plantCode,
    folder: parsed.data.folder,
    fileName: parsed.data.fileName,
  });

  const body = Buffer.from(await parsed.data.file.arrayBuffer());
  const uploaded = await StorageService.uploadObject({
    key,
    contentType: parsed.data.contentType,
    body,
  });

  return ok(uploaded);
}
