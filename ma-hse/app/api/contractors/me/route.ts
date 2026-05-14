import { fail, ok } from "@/lib/api";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const company = await getContractorSessionCompany();
  if (!company) {
    return fail("UNAUTHORIZED", "Contractor authentication required", 401);
  }

  const fullCompany = await prisma.externalCompany.findUniqueOrThrow({
    where: { id: company.id },
    include: {
      documents: true,
      workers: {
        include: {
          documents: true,
        },
      },
      plant: true,
    },
  });

  return ok(fullCompany);
}
