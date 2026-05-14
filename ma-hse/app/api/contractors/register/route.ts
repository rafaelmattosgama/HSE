import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { hashInvitationToken, createContractorSession } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { contractorRegisterInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const parsed = await parseBody(request, contractorRegisterInput);
  if ("error" in parsed) return parsed.error;

  const invitation = await prisma.externalCompanyInvitation.findUniqueOrThrow({
    where: { tokenHash: hashInvitationToken(parsed.data.invitationToken) },
    include: { plant: true },
  });

  const company = await prisma.externalCompany.create({
    data: {
      plantId: invitation.plantId,
      sponsorUserId: invitation.sponsorUserId,
      email: parsed.data.email,
      passwordHash: await hash(parsed.data.password, 12),
      contactName: parsed.data.contactName,
      companyName: parsed.data.companyName,
      address: parsed.data.address,
      phone: parsed.data.phone,
      taxId: parsed.data.taxId,
      socialSecurityId: parsed.data.socialSecurityId,
    },
  });

  await prisma.externalCompanyInvitation.update({
    where: { id: invitation.id },
    data: {
      acceptedAt: new Date(),
      companyId: company.id,
    },
  });

  await createContractorSession(company.id);

  await NotificationService.notifyPlantRoles({
    plantId: invitation.plantId,
    roles: [RoleCode.N3_SAFETY],
    title: "New external company registered",
    body: `${company.companyName} registered in ${invitation.plant.name} and is pending validation.`,
  });

  return ok({ companyId: company.id }, { status: 201 });
}
