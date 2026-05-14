import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

const reportLayoutInput = z.object({
  layouts: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().default(""),
    }),
  ),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const parameter = await prisma.systemParameter.findUnique({
    where: {
      plantId_key: {
        plantId: plant.id,
        key: "REPORT_LAYOUT",
      },
    },
  });

  return ok({
    layouts: ((parameter?.valueJson as Array<{ id: string; title: string; description: string }> | null) ?? []),
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, reportLayoutInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  await prisma.systemParameter.upsert({
    where: {
      plantId_key: {
        plantId: plant.id,
        key: "REPORT_LAYOUT",
      },
    },
    update: {
      valueJson: parsed.data.layouts,
    },
    create: {
      plantId: plant.id,
      key: "REPORT_LAYOUT",
      valueJson: parsed.data.layouts,
    },
  });

  return ok({ layouts: parsed.data.layouts });
}
