import { ok } from "@/lib/api";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { contractorToggleActiveInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request, context: { params: Promise<{ workerId: string }> }) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const { workerId } = await context.params;
  const parsed = await parseBody(request, contractorToggleActiveInput);
  if ("error" in parsed) return parsed.error;

  const worker = await prisma.externalWorker.update({
    where: { id: workerId },
    data: { isActive: parsed.data.isActive },
  });

  return ok(worker);
}

export async function DELETE(_request: Request, context: { params: Promise<{ workerId: string }> }) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const { workerId } = await context.params;
  await prisma.externalWorker.delete({
    where: { id: workerId },
  });

  return ok({ success: true });
}
