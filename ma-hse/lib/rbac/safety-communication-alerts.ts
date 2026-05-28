import { RoleCode } from "@prisma/client";

export const SAFETY_COMMUNICATION_ALERT_RECIPIENT_ROLES: readonly RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
] as const;

export function canManageSafetyCommunicationAlertRecipients(role?: RoleCode | null) {
  return Boolean(role && SAFETY_COMMUNICATION_ALERT_RECIPIENT_ROLES.includes(role));
}
