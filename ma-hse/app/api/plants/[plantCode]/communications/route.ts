import { RoleCode } from "@prisma/client";
import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { createCommunicationInput } from "@/lib/validation/dtos";
import { CommunicationService } from "@/lib/services/communication-service";

export async function GET(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;

  const communications = await prisma.communication.findMany({
    where: {
      plantId: plant.id,
      status: status ? (status as never) : undefined,
    },
    include: {
      riskTheme: true,
      actions: true,
      reporterUser: true,
    },
    orderBy: {
      eventDatetime: "desc",
    },
    take: 200,
  });

  return ok(communications);
}

export async function POST(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createCommunicationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const communication = await CommunicationService.create({
    plantId: plant.id,
    payload: parsed.data,
    reporterUserId: auth.session.user.id,
  });

  return ok(communication, { status: 201 });
}
