import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { authOptions } from "@/lib/auth/options";
import { parseBody } from "@/lib/http";
import {
  DEFAULT_MODULE_TOGGLES,
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
} from "@/lib/modules";
import { prisma } from "@/lib/prisma";

const updateModulesInput = z.object({
  modules: z.record(z.string(), z.boolean()),
});

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
    modules: {
      ...DEFAULT_MODULE_TOGGLES,
      ...((parameter?.valueJson as Record<string, boolean> | null) ?? {}),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireN0Admin();
  if (auth instanceof Response) return auth;

  const parsed = await parseBody(request, updateModulesInput);
  if ("error" in parsed) return parsed.error;

  const modules = {
    ...DEFAULT_MODULE_TOGGLES,
    ...parsed.data.modules,
  };

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
