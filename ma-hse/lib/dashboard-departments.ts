import type { RoleCode } from "@prisma/client";
import { requiresUserDepartment } from "@/lib/rbac/user-management";

export const ALL_DASHBOARD_DEPARTMENTS = "all";

/** An explicit selection (including all) overrides the user's entry default. */
export function resolveDashboardDepartment({ requested, role, assignedDepartmentId, departments }: {
  requested: string | string[] | undefined;
  role: RoleCode | undefined;
  assignedDepartmentId?: string | null;
  departments: Array<{ id: string }>;
}) {
  const value = Array.isArray(requested) ? requested[0] : requested;
  if (value === ALL_DASHBOARD_DEPARTMENTS) return null;
  if (value && departments.some((entry) => entry.id === value)) return value;
  return role && requiresUserDepartment(role) && departments.some((entry) => entry.id === assignedDepartmentId)
    ? assignedDepartmentId! : null;
}

/** S-EWO can inherit its department from its linked communication. */
export function filterDashboardDepartment<T extends { areaId: string | null; communication?: { areaId: string | null } | null }>(rows: T[], departmentId: string | null): T[] {
  return departmentId ? rows.filter((row) => (row.areaId ?? row.communication?.areaId) === departmentId) : rows;
}
