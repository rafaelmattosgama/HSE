import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { hashInvitationToken, createContractorSession } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { contractorRegisterInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const parsed = await parseBody(request, contractorRegisterInput);
  if ("error" in parsed) return parsed.error;

  const invitation = await prisma.externalCompanyInvitation.findFirst({
    where: {
      tokenHash: hashInvitationToken(parsed.data.invitationToken),
      acceptedAt: null,
      companyId: null,
    },
    include: { plant: true },
  });

  if (!invitation) {
    return fail("INVALID_INVITATION", "Invitation token is invalid or already used", 401);
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  if (normalizedEmail !== invitation.email.trim().toLowerCase()) {
    return fail("EMAIL_MISMATCH", "Registration email must match the invitation email", 403);
  }

  const existingCompany = await prisma.externalCompany.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingCompany) {
    return fail("EMAIL_ALREADY_REGISTERED", "This email is already registered", 409);
  }

  const company = await prisma.$transaction(async (tx) => {
    const claimed = await tx.externalCompanyInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        companyId: null,
      },
      data: {
        acceptedAt: new Date(),
      },
    });

    if (claimed.count !== 1) return null;

    const createdCompany = await tx.externalCompany.create({
      data: {
        plantId: invitation.plantId,
        sponsorUserId: invitation.sponsorUserId,
        email: normalizedEmail,
        passwordHash: await hash(parsed.data.password, 12),
        contactName: parsed.data.contactName,
        companyName: parsed.data.companyName,
        address: parsed.data.address,
        phone: parsed.data.phone,
        taxId: parsed.data.taxId,
        socialSecurityId: parsed.data.socialSecurityId,
      },
    });

    await tx.externalCompanyInvitation.update({
      where: { id: invitation.id },
      data: {
        companyId: createdCompany.id,
      },
    });

    return createdCompany;
  });

  if (!company) {
    return fail("INVALID_INVITATION", "Invitation token is invalid or already used", 401);
  }

  await createContractorSession(company.id);

  await NotificationService.notifyPlantRoles({
    plantId: invitation.plantId,
    roles: [RoleCode.N3_SAFETY],
    title: "New external company registered",
    body: `${company.companyName} registered in ${invitation.plant.name} and is pending validation.`,
  });

  return ok({ companyId: company.id }, { status: 201 });
}
