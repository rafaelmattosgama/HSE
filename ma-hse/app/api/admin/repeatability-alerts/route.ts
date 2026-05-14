import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { authOptions } from "@/lib/auth/options";
import { parseBody } from "@/lib/http";
import { getGlobalRepeatabilityAlertConfig, setGlobalRepeatabilityAlertConfig } from "@/lib/services/parameter-service";
import { updateRepeatabilityAlertConfigInput } from "@/lib/validation/dtos";

async function requireGlobalAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const isAllowed = session.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );
  if (!isAllowed) {
    return fail("FORBIDDEN", "Corporate or N0 access required", 403);
  }

  return { session };
}

export async function GET() {
  const auth = await requireGlobalAdmin();
  if (auth instanceof Response) return auth;

  const config = await getGlobalRepeatabilityAlertConfig();
  return ok(config);
}

export async function POST(request: Request) {
  const auth = await requireGlobalAdmin();
  if (auth instanceof Response) return auth;

  const parsed = await parseBody(request, updateRepeatabilityAlertConfigInput);
  if ("error" in parsed) return parsed.error;

  await setGlobalRepeatabilityAlertConfig(parsed.data);
  return ok(parsed.data);
}
