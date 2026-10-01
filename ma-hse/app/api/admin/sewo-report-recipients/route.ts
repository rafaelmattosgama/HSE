import { requireN0 } from "@/lib/auth/require-n0";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { generalRecipientInput, generalRecipientDeleteInput, mutateGeneralSewoRecipient } from "@/lib/services/general-sewo-recipients";
import { GeneralSettingsError } from "@/lib/services/general-settings-service";

async function mutate(request: Request, deleting: boolean) {
  const auth = await requireN0();
  if ("error" in auth) return auth.error;
  const parsed = deleting ? await parseBody(request, generalRecipientDeleteInput) : await parseBody(request, generalRecipientInput);
  if ("error" in parsed) return parsed.error;
  try { return ok(await mutateGeneralSewoRecipient(parsed.data, auth.session.user.id)); }
  catch (error) {
    if (error instanceof GeneralSettingsError) return fail("INVALID_RECIPIENT_CHANGE", error.message, error.status);
    throw error;
  }
}
export const POST = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
