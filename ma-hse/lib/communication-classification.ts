import { CommunicationType, RoleCode } from "@prisma/client";

export const COMMUNICATION_CLASSIFICATION_ROLES: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
];

export function canManageCommunicationClassification(role?: RoleCode | null) {
  return Boolean(role && COMMUNICATION_CLASSIFICATION_ROLES.includes(role));
}

export function requiresProfessionalRisk(type: CommunicationType) {
  return (
    type === CommunicationType.NEAR_MISS ||
    type === CommunicationType.FIRST_AID ||
    type === CommunicationType.ACCIDENT
  );
}

export function requiresNearMissType(type: CommunicationType) {
  return type === CommunicationType.NEAR_MISS;
}

export function supportsUnsafeActType(type: CommunicationType) {
  return type === CommunicationType.UNSAFE_ACT || type === CommunicationType.FIRST_AID;
}

export function requiresUnsafeConditionType(type: CommunicationType) {
  return type === CommunicationType.UNSAFE_CONDITION;
}

export function shouldDeferPublicReportProfessionalRisk(type: CommunicationType) {
  return type === CommunicationType.NEAR_MISS || type === CommunicationType.FIRST_AID;
}

export function shouldDeferPublicReportNearMissType(type: CommunicationType) {
  return type === CommunicationType.NEAR_MISS;
}

export function shouldDeferPublicReportUnsafeActType(type: CommunicationType) {
  return type === CommunicationType.UNSAFE_ACT || type === CommunicationType.FIRST_AID;
}

export function shouldDeferPublicReportUnsafeConditionType(type: CommunicationType) {
  return type === CommunicationType.UNSAFE_CONDITION;
}

export function getMissingCommunicationClassificationFields(input: {
  type: CommunicationType;
  riskThemeId?: string | null;
  unsafeActTypeId?: string | null;
  unsafeConditionTypeId?: string | null;
  nearMissTypeId?: string | null;
}) {
  const missing: string[] = [];

  if (requiresProfessionalRisk(input.type) && !input.riskThemeId) {
    missing.push("riskThemeId");
  }

  if (supportsUnsafeActType(input.type) && !input.unsafeActTypeId) {
    missing.push("unsafeActTypeId");
  }

  if (requiresUnsafeConditionType(input.type) && !input.unsafeConditionTypeId) {
    missing.push("unsafeConditionTypeId");
  }

  if (requiresNearMissType(input.type) && !input.nearMissTypeId) {
    missing.push("nearMissTypeId");
  }

  return missing;
}
