import { z } from "zod";
import { requireN0 } from "@/lib/auth/require-n0";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { changeGeneralUserStatus } from "@/lib/services/general-user-service";
import { GeneralSettingsError } from "@/lib/services/general-settings-service";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireN0();
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, z.object({ isActive: z.boolean() }));
  if ("error" in parsed) return parsed.error;
  const { userId } = await context.params;
  try { return ok(await changeGeneralUserStatus(userId, parsed.data.isActive, auth.session.user.id)); }
  catch (error) {
    if (error instanceof GeneralSettingsError) return fail("INVALID_USER_CHANGE", error.message, error.status);
    throw error;
  }
}
