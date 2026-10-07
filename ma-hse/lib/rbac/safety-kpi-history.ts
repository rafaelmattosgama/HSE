import { RoleCode } from "@prisma/client";

type RoleEntry = { role: RoleCode; plantCode: string | null };
export function canImportSafetyKpiHistory(roles: RoleEntry[], plantCode: string) {
  return roles.some(entry => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE || (entry.role === RoleCode.N3_SAFETY && entry.plantCode?.toLowerCase() === plantCode.toLowerCase()));
}
export function canReplaceSafetyKpiHistory(roles: RoleEntry[], plantCode: string) {
  return roles.some(entry => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE)
    && canImportSafetyKpiHistory(roles, plantCode);
}
