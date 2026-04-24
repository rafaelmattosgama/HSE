import { compare } from "bcryptjs";
import { fail, ok } from "@/lib/api";
import { createContractorSession } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { contractorLoginInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const parsed = await parseBody(request, contractorLoginInput);
  if ("error" in parsed) return parsed.error;

  const company = await prisma.externalCompany.findUnique({
    where: { email: parsed.data.email },
  });

  if (!company || !(await compare(parsed.data.password, company.passwordHash))) {
    return fail("INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  await createContractorSession(company.id);
  return ok({ companyId: company.id });
}
