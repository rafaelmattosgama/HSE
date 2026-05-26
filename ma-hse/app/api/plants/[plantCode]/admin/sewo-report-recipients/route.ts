import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import {
  SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS,
  ensureSewoReportRecipientList,
  findSewoReportRecipientList,
  listSewoReportRecipients,
} from "@/lib/services/sewo-recipient-service";

const recipientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  language: z.enum(SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const recipients = await listSewoReportRecipients(plant.id);

  return ok({ recipients });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, recipientSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const list = await ensureSewoReportRecipientList(plant.id);
  const email = parsed.data.email.trim().toLowerCase();

  if (parsed.data.id) {
    const existing = await prisma.reportRecipient.findFirst({
      where: {
        id: parsed.data.id,
        listId: list.id,
      },
    });

    if (!existing) {
      return fail("RECIPIENT_NOT_FOUND", "Recipient not found.", 404);
    }

    const duplicate = await prisma.reportRecipient.findFirst({
      where: {
        listId: list.id,
        email,
        id: {
          not: parsed.data.id,
        },
      },
    });

    if (duplicate) {
      return fail("DUPLICATE_RECIPIENT", "A recipient with this email already exists.", 409);
    }

    const recipient = await prisma.reportRecipient.update({
      where: {
        id: parsed.data.id,
      },
      data: {
        name: parsed.data.name.trim(),
        email,
        language: parsed.data.language,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        language: true,
      },
    });

    return ok({ recipient });
  }

  const existingByEmail = await prisma.reportRecipient.findUnique({
    where: {
      listId_email: {
        listId: list.id,
        email,
      },
    },
    select: {
      id: true,
    },
  });

  const recipient = existingByEmail
    ? await prisma.reportRecipient.update({
        where: {
          id: existingByEmail.id,
        },
        data: {
          name: parsed.data.name.trim(),
          email,
          language: parsed.data.language,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          language: true,
        },
      })
    : await prisma.reportRecipient.create({
        data: {
          listId: list.id,
          name: parsed.data.name.trim(),
          email,
          language: parsed.data.language,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          language: true,
        },
      });

  return ok({ recipient }, { status: existingByEmail ? 200 : 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const list = await findSewoReportRecipientList(plant.id);
  if (!list) {
    return fail("RECIPIENT_NOT_FOUND", "Recipient not found.", 404);
  }

  const existing = await prisma.reportRecipient.findFirst({
    where: {
      id: parsed.data.id,
      listId: list.id,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return fail("RECIPIENT_NOT_FOUND", "Recipient not found.", 404);
  }

  await prisma.reportRecipient.update({
    where: {
      id: parsed.data.id,
    },
    data: {
      isActive: false,
    },
  });

  return ok({
    recipientId: parsed.data.id,
  });
}
