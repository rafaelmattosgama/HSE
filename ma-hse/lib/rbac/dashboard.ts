import { RoleCode } from "@prisma/client";
import { hasPlantAccess } from "@/lib/rbac/evaluator";

type PlantRoleEntry = {
  plantId: string | null;
  plantCode: string | null;
  role: RoleCode;
};

/**
 * Roles that can open the plant Safety Dashboard. N5 keeps its existing
 * baseline dashboard access; detailed dashboard read access is defined below.
 */
export const SAFETY_DASHBOARD_VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
] as const;

/**
 * Read-only dashboard detail tier. N2, N3 and N4 intentionally share this
 * tier so they see identical KPIs, charts, rankings and trends for the same
 * plant and period. This list grants no operational permission.
 */
export const SAFETY_DASHBOARD_DETAILED_VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
] as const;

export function getSafetyDashboardRole(plantCode: string, roles: PlantRoleEntry[]) {
  if (roles.some((entry) => entry.role === RoleCode.N0_ADMIN)) return RoleCode.N0_ADMIN;
  if (roles.some((entry) => entry.role === RoleCode.N1_CORPORATE)) return RoleCode.N1_CORPORATE;

  return roles.find(
    (entry) => entry.plantCode === plantCode && SAFETY_DASHBOARD_VIEW_ROLES.includes(entry.role),
  )?.role;
}

export function hasSafetyDashboardAccess(plantCode: string, roles: PlantRoleEntry[]) {
  return hasPlantAccess({
    plantCode,
    roles,
    allowedRoles: [...SAFETY_DASHBOARD_VIEW_ROLES],
  });
}

export function hasSafetyDashboardDetailedReadAccess(role: RoleCode | undefined) {
  return Boolean(role && SAFETY_DASHBOARD_DETAILED_VIEW_ROLES.includes(role));
}
