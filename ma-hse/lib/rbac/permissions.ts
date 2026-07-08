import { RoleCode } from "@prisma/client";

export const ROLE_LABELS: Record<RoleCode, string> = {
  N0_ADMIN: "Admin",
  N1_CORPORATE: "Corporate",
  N2_PLANT_MANAGER: "Plant Manager",
  N3_SAFETY: "Safety",
  N4_SUPERVISOR: "Supervisor",
  N5_OPERATOR: "Operator",
  MEDICO: "Medico",
};

export const CLINICAL_VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.MEDICO,
];

export function isCorporate(role: RoleCode) {
  return role === RoleCode.N0_ADMIN || role === RoleCode.N1_CORPORATE;
}
