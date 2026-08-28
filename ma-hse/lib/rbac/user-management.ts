import { RoleCode } from "@prisma/client";

const CREATABLE_ROLES_BY_ACTOR: Record<RoleCode, RoleCode[]> = {
  [RoleCode.N0_ADMIN]: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR],
  [RoleCode.N1_CORPORATE]: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N6_HR],
  [RoleCode.N2_PLANT_MANAGER]: [RoleCode.N6_HR],
  [RoleCode.N3_SAFETY]: [RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR],
  [RoleCode.N4_SUPERVISOR]: [],
  [RoleCode.N5_OPERATOR]: [],
  [RoleCode.N6_HR]: [],
};

export const GLOBAL_USER_ROLES: readonly RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE] as const;
export const PLANT_SCOPED_USER_ROLES: readonly RoleCode[] = [
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
] as const;

export function isGlobalUserRole(role: RoleCode) {
  return GLOBAL_USER_ROLES.includes(role);
}

export function isPlantScopedUserRole(role: RoleCode) {
  return PLANT_SCOPED_USER_ROLES.includes(role);
}

export function getRoleAssignmentPlantId(role: RoleCode, plantId: string) {
  return isGlobalUserRole(role) ? null : plantId;
}

export function isValidUserPlantRoleScope(role: RoleCode, plantId: string | null) {
  return isGlobalUserRole(role) ? plantId === null : Boolean(plantId);
}

export function buildPlantRoleScope(plantId: string, roles: RoleCode[]) {
  const globalRoles = roles.filter(isGlobalUserRole);
  const plantRoles = roles.filter((role) => !isGlobalUserRole(role));

  return {
    OR: [
      ...(plantRoles.length
        ? [
            {
              plantId,
              role: {
                code: {
                  in: plantRoles,
                },
              },
            },
          ]
        : []),
      ...(globalRoles.length
        ? [
            {
              plantId: null,
              role: {
                code: {
                  in: globalRoles,
                },
              },
            },
          ]
        : []),
    ],
  };
}

export function getCreatableRoles(actorRole: RoleCode): RoleCode[] {
  return CREATABLE_ROLES_BY_ACTOR[actorRole] ?? [];
}

export function canCreateRole(actorRole: RoleCode, targetRole: RoleCode) {
  return getCreatableRoles(actorRole).includes(targetRole);
}
