import { fail, ok } from "@/lib/api";
import { requireN0 } from "@/lib/auth/require-n0";
import { parseBody } from "@/lib/http";
import { generalCatalogInput, generalCatalogDeleteInput, GeneralSettingsError, mutateGeneralCatalog } from "@/lib/services/general-settings-service";

async function mutate(request: Request, deleting: boolean) {
  const auth = await requireN0();
  if ("error" in auth) return auth.error;
  const parsed = deleting ? await parseBody(request, generalCatalogDeleteInput) : await parseBody(request, generalCatalogInput);
  if ("error" in parsed) return parsed.error;
  try {
    return ok(await mutateGeneralCatalog(parsed.data, auth.session.user.id));
  } catch (error) {
    if (error instanceof GeneralSettingsError) return fail("INVALID_CATALOG_CHANGE", error.message, error.status);
    throw error;
  }
}

export const POST = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
