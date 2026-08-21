import { fail, ok } from "@/lib/api";
import { buildStorageKey } from "@/lib/helpers";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { StorageService } from "@/lib/services/storage-service";
import { parseAttachmentUploadForm } from "@/lib/storage-upload";

export async function POST(request: Request) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return fail("UNAUTHORIZED", "Contractor authentication required", 401);
  }

  const parsed = await parseAttachmentUploadForm(request);
  if ("error" in parsed) return parsed.error;

  const key = buildStorageKey({
    plantCode: company.plant.code,
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
