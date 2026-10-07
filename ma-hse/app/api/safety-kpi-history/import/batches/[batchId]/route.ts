import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { batchId } = await context.params;
  const batch = await prisma.safetyKpiImportBatch.findUnique({ where: { id: batchId }, include: { plant: { select: { code: true, name: true } }, rows: { orderBy: { rowNumber: "asc" } } } });
  if (!batch) return fail("NOT_FOUND", "Import batch not found", 404);
  const global = auth.session.user.plantRoles.some(role => role.role === RoleCode.N0_ADMIN || role.role === RoleCode.N1_CORPORATE);
  const plantAccess = batch.plant?.code && auth.session.user.plantRoles.some(role => role.role === RoleCode.N3_SAFETY && role.plantCode === batch.plant?.code);
  if (!global && batch.createdById !== auth.session.user.id && !plantAccess) return fail("FORBIDDEN", "Import batch is not available", 403);
  return ok(batch);
}
