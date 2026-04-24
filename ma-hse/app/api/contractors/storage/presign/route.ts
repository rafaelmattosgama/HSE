import { fail, ok } from "@/lib/api";
import { buildStorageKey } from "@/lib/helpers";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { StorageService } from "@/lib/services/storage-service";
import { issuePresignedUploadInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return fail("UNAUTHORIZED", "Contractor authentication required", 401);
  }

  const parsed = await parseBody(request, issuePresignedUploadInput);
  if ("error" in parsed) return parsed.error;

  const key = buildStorageKey({
    plantCode: company.plant.code,
    folder: parsed.data.folder,
    fileName: parsed.data.fileName,
  });

  const presigned = await StorageService.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
  });

  return ok(presigned);
}
