import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AuditDiff = {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  fieldsChanged: string[];
};

export async function writeAuditLog(
  input: {
    entityType: string;
    entityId: string;
    action: string;
    actorUserId?: string | null;
    plantId?: string | null;
    diff: AuditDiff;
  },
  client: Prisma.TransactionClient = prisma,
) {
  await client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      plantId: input.plantId ?? null,
      diffJson: input.diff as unknown as Prisma.InputJsonValue,
    },
  });
}

export function buildDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): AuditDiff {
  const beforeKeys = before ? Object.keys(before) : [];
  const afterKeys = after ? Object.keys(after) : [];
  const allKeys = new Set([...beforeKeys, ...afterKeys]);

  const fieldsChanged = [...allKeys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));

  return {
    before,
    after,
    fieldsChanged,
  };
}
