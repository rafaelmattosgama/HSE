import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const isGlobal = auth.session.user.plantRoles.some(role => role.role === RoleCode.N0_ADMIN || role.role === RoleCode.N1_CORPORATE);
  const plantCodes = auth.session.user.plantRoles.flatMap(role => role.role === RoleCode.N3_SAFETY && role.plantCode ? [role.plantCode] : []);
  const rows = await prisma.safetyKpiImportBatch.findMany({
    where: isGlobal ? {} : { OR: [{ createdById: auth.session.user.id }, { plant: { code: { in: plantCodes } } }] },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, originalFileName: true, fileHash: true, status: true, totalRows: true, validRows: true, importedRows: true, skippedRows: true, errorRows: true, createdAt: true, completedAt: true, plant: { select: { code: true, name: true } } },
  });
  return ok(rows);
}
