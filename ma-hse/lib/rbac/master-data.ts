import { RoleCode } from "@prisma/client";

export const MASTER_DATA_ADMIN_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
] as const;

const EQUIPMENT_MANAGEMENT_ROLES: readonly RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N3_SAFETY,
];

export function canManagePlantEquipment(role: RoleCode | null | undefined) {
  return Boolean(role && EQUIPMENT_MANAGEMENT_ROLES.includes(role));
}
