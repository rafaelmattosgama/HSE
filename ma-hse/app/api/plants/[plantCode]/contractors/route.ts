import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { generateInvitationToken, hashInvitationToken } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { env } from "@/lib/env";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/lib/services/email-service";
import { contractorInvitationInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const companies = await prisma.externalCompany.findMany({
    where: { plantId: plant.id },
    include: {
      documents: true,
      workers: {
        include: {
          documents: true,
        },
      },
      sponsorUser: true,
    },
    orderBy: { companyName: "asc" },
  });

  return ok(companies);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, contractorInvitationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const invitationToken = generateInvitationToken();
  const invitation = await prisma.externalCompanyInvitation.create({
    data: {
      plantId: plant.id,
      sponsorUserId: auth.session.user.id,
      email: parsed.data.email,
      tokenHash: hashInvitationToken(invitationToken),
      requiredDocuments: parsed.data.requiredDocuments,
    },
  });

  const link = `${env.APP_URL}/contractors/register?t=${invitationToken}`;
  await EmailService.sendMail({
    to: parsed.data.email,
    subject: `${plant.name} - external company documentation request`,
    html: `<p>A documentation request was created for your company.</p><p>Required documents: ${parsed.data.requiredDocuments.join(", ")}</p><p>Access the platform here: <a href="${link}">${link}</a></p>`,
    text: `Required documents: ${parsed.data.requiredDocuments.join(", ")}\nAccess the platform here: ${link}`,
  });

  return ok(invitation, { status: 201 });
}
