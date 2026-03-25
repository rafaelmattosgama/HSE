import { RoleCode } from "@prisma/client";

type PlantRoleEntry = {
  plantId: string;
  plantCode: string;
  role: RoleCode;
};

export function hasPlantAccess(input: {
  plantCode: string;
  roles: PlantRoleEntry[];
  allowedRoles: RoleCode[];
}) {
  if (input.roles.some((entry) => entry.role === RoleCode.N1_CORPORATE)) {
    return true;
  }

  return input.roles.some((entry) => entry.plantCode === input.plantCode && input.allowedRoles.includes(entry.role));
}