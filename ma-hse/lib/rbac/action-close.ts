import { RoleCode } from "@prisma/client";

const CLOSE_ANY_ACTION_ROLES: readonly RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
];

const CLOSE_OWN_ACTION_ROLES: readonly RoleCode[] = [
  RoleCode.N4_SUPERVISOR,
  RoleCode.N6_HR,
];

export function canCloseAction(input: {
  actorRole: RoleCode | null | undefined;
  actorUserId: string;
  ownerUserId: string;
}) {
  if (!input.actorRole) return false;
  if (CLOSE_ANY_ACTION_ROLES.includes(input.actorRole)) return true;
  return CLOSE_OWN_ACTION_ROLES.includes(input.actorRole) && input.ownerUserId === input.actorUserId;
}
