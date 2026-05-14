import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { contractorWorkerInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const parsed = await parseBody(request, contractorWorkerInput);
  if ("error" in parsed) return parsed.error;

  const worker = await prisma.externalWorker.create({
    data: {
      companyId: company.id,
      name: parsed.data.name,
      birthDate: parsed.data.birthDate,
    },
  });

  await NotificationService.notifyPlantRoles({
    plantId: company.plantId,
    roles: [RoleCode.N3_SAFETY],
    title: "New external worker pending approval",
    body: `${worker.name} was registered under ${company.companyName} and is pending validation.`,
  });

  return ok(worker, { status: 201 });
}
