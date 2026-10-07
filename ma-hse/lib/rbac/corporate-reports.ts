import { RoleCode } from "@prisma/client";

type ReportRole = { role: RoleCode; plantId: string | null };

export function getCorporateReportAccess(roles: ReportRole[]) {
  const isCorporate = roles.some(entry => entry.role === RoleCode.N1_CORPORATE);
  const global = isCorporate || roles.some(entry => entry.role === RoleCode.N0_ADMIN);
  const plantIds = [...new Set(roles.flatMap(entry =>
    entry.role === RoleCode.N3_SAFETY && entry.plantId ? [entry.plantId] : [],
  ))];

  return {
    global,
    plantIds,
    canRead: global || plantIds.length > 0,
    canGenerate: isCorporate || plantIds.length > 0,
  };
}
