import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { authOptions } from "@/lib/auth/options";
import { parseBody } from "@/lib/http";
import {
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  moduleTogglesInputSchema,
  resolveModuleToggles,
} from "@/lib/modules";
import { prisma } from "@/lib/prisma";

async function requireN0Admin() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const isN0 = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  if (!isN0) {
    return fail("FORBIDDEN", "N0 admin access required", 403);
  }

  return { session };
}

export async function GET() {
  const auth = await requireN0Admin();
  if (auth instanceof Response) return auth;

  const parameter = await prisma.systemParameter.findFirst({
    where: {
      plantId: null,
      key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
    },
  });

  return ok({
    modules: resolveModuleToggles(parameter?.valueJson),
  });
}

export async function POST(request: Request) {
  const auth = await requireN0Admin();
  if (auth instanceof Response) return auth;

  const parsed = await parseBody(request, moduleTogglesInputSchema);
  if ("error" in parsed) return parsed.error;

  const modules = resolveModuleToggles(parsed.data.modules);

  const existing = await prisma.systemParameter.findFirst({
    where: {
      plantId: null,
      key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.systemParameter.update({
      where: { id: existing.id },
      data: {
        valueJson: modules,
      },
    });
  } else {
    await prisma.systemParameter.create({
      data: {
        plantId: null,
        key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
        valueJson: modules,
      },
    });
  }

  return ok({ modules });
}
