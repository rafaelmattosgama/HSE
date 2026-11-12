import { RoleCode } from "@prisma/client";

type PlantRoleScope = {
  role: RoleCode;
  plantCode: string | null;
};

export const INCIDENT_KNOWLEDGE_VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
];

export function canManageIncidentKnowledge(roles: PlantRoleScope[], plantCode: string) {
  void plantCode;
  return roles.some((entry) => entry.role === RoleCode.N0_ADMIN);
}

export function canViewUnapprovedIncidentKnowledge(roles: PlantRoleScope[], plantCode: string) {
  return canManageIncidentKnowledge(roles, plantCode);
}

export function canReadIncidentKnowledge(roles: PlantRoleScope[], plantCode: string) {
  void plantCode;
  return roles.some((entry) => entry.role === RoleCode.N0_ADMIN);
}
