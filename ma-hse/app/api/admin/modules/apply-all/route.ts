import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth/options";
import { parseBody } from "@/lib/http";
import { MODULE_TOGGLES_PARAMETER_KEY, moduleTogglesInputSchema } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

const applyAllModulesSchema = moduleTogglesInputSchema.extend({
  modules: moduleTogglesInputSchema.shape.modules.required(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail("UNAUTHORIZED", "Authentication required", 401);
  if (!session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)) {
    return fail("FORBIDDEN", "N0 admin access required", 403);
  }

  const parsed = await parseBody(request, applyAllModulesSchema);
  if ("error" in parsed) return parsed.error;
  const { modules } = parsed.data;

  const plantCount = await prisma.$transaction(async (tx) => {
    const plants = await tx.plant.findMany({ select: { id: true } });
    for (const plant of plants) {
      await tx.systemParameter.upsert({
        where: { plantId_key: { plantId: plant.id, key: MODULE_TOGGLES_PARAMETER_KEY } },
        update: { valueJson: modules },
        create: { plantId: plant.id, key: MODULE_TOGGLES_PARAMETER_KEY, valueJson: modules },
      });
    }
    await writeAuditLog({
      entityType: "SystemParameter",
      entityId: MODULE_TOGGLES_PARAMETER_KEY,
      action: "APPLY_MODULES_TO_ALL_PLANTS",
      actorUserId: session.user.id,
      diff: {
        after: { modules, plantIds: plants.map((plant) => plant.id) },
        fieldsChanged: ["modules"],
      },
    }, tx);
    return plants.length;
  });

  return ok({ modules, plantCount });
}
