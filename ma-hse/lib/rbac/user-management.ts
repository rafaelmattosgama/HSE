import { RoleCode } from "@prisma/client";

const CREATABLE_ROLES_BY_ACTOR: Record<RoleCode, RoleCode[]> = {
  [RoleCode.N0_ADMIN]: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.MEDICO],
  [RoleCode.N1_CORPORATE]: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
  [RoleCode.N2_PLANT_MANAGER]: [],
  [RoleCode.N3_SAFETY]: [RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.MEDICO],
  [RoleCode.N4_SUPERVISOR]: [],
  [RoleCode.N5_OPERATOR]: [],
  [RoleCode.N6_QR_REPORTER]: [],
  [RoleCode.MEDICO]: [],
};

export function getCreatableRoles(actorRole: RoleCode): RoleCode[] {
  return CREATABLE_ROLES_BY_ACTOR[actorRole] ?? [];
}

export function canCreateRole(actorRole: RoleCode, targetRole: RoleCode) {
  return getCreatableRoles(actorRole).includes(targetRole);
}
