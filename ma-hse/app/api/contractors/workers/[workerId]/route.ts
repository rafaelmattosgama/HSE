import { fail, ok } from "@/lib/api";
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

  const updated = await prisma.externalWorker.updateMany({
    where: {
      id: workerId,
      companyId: company.id,
    },
    data: { isActive: parsed.data.isActive },
  });

  if (updated.count !== 1) {
    return fail("NOT_FOUND", "Worker not found", 404);
  }

  const worker = await prisma.externalWorker.findFirstOrThrow({
    where: {
      id: workerId,
      companyId: company.id,
    },
  });

  return ok(worker);
}

export async function DELETE(_request: Request, context: { params: Promise<{ workerId: string }> }) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const { workerId } = await context.params;
  const deleted = await prisma.externalWorker.deleteMany({
    where: {
      id: workerId,
      companyId: company.id,
    },
  });

  if (deleted.count !== 1) {
    return fail("NOT_FOUND", "Worker not found", 404);
  }

  return ok({ success: true });
}
