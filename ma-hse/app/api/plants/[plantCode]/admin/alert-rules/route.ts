import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { updateAlertRuleInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const rules = await prisma.alertRule.findMany({
    where: {
      plantId: plant.id,
    },
    include: {
      repetitionRule: true,
      events: {
        orderBy: {
          triggeredAt: "desc",
        },
        take: 5,
      },
    },
  });

  return ok(rules);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateAlertRuleInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const rule = await prisma.alertRule.create({
    data: {
      plantId: plant.id,
      name: parsed.data.name,
      isActive: parsed.data.isActive,
      repetitionRule: {
        create: {
          triggerType: parsed.data.triggerType,
          thresholdCount: parsed.data.thresholdCount,
          windowDays: parsed.data.windowDays,
          consecutiveCount: parsed.data.consecutiveCount,
          sameWorkstation: parsed.data.sameWorkstation,
          sameEquipment: parsed.data.sameEquipment,
          sameRiskTheme: parsed.data.sameRiskTheme,
          sameWorker: parsed.data.sameWorker,
        },
      },
    },
    include: {
      repetitionRule: true,
    },
  });

  return ok(rule, { status: 201 });
}