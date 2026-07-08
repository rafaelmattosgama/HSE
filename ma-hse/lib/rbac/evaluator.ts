import { RoleCode } from "@prisma/client";

type PlantRoleEntry = {
  plantId: string | null;
  plantCode: string | null;
  role: RoleCode;
};

export function hasPlantAccess(input: {
  plantCode: string;
  roles: PlantRoleEntry[];
  allowedRoles: RoleCode[];
}) {
  if (input.roles.some((entry) => entry.role === RoleCode.N0_ADMIN)) {
    return true;
  }

  if (
    input.roles.some((entry) => entry.role === RoleCode.N1_CORPORATE) &&
    input.allowedRoles.some((role) => role !== RoleCode.N0_ADMIN)
  ) {
    return true;
  }

  return input.roles.some((entry) => entry.plantCode === input.plantCode && input.allowedRoles.includes(entry.role));
}
