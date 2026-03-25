import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

const recipientSchema = z.object({
  listId: z.string().uuid().optional(),
  listName: z.string().min(2),
  scope: z.enum(["PLANT", "CORPORATE"]),
  recipients: z.array(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
    }),
  ),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const lists = await prisma.reportRecipientList.findMany({
    where: {
      OR: [{ plantId: plant.id }, { scope: "CORPORATE" }],
    },
    include: {
      recipients: true,
    },
  });

  return ok(lists);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, recipientSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const list = await prisma.reportRecipientList.upsert({
    where: {
      id: parsed.data.listId ?? "00000000-0000-0000-0000-000000000000",
    },
    create: {
      plantId: parsed.data.scope === "PLANT" ? plant.id : null,
      scope: parsed.data.scope,
      name: parsed.data.listName,
      recipients: {
        createMany: {
          data: parsed.data.recipients,
        },
      },
    },
    update: {
      name: parsed.data.listName,
      recipients: {
        deleteMany: {},
        createMany: {
          data: parsed.data.recipients,
        },
      },
    },
    include: {
      recipients: true,
    },
  });

  return ok(list);
}