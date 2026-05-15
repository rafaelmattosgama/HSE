import { CommunicationType, RoleCode, SEWOStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SIF_PSIF_EXPOSURE_KEYS,
  createEmptySifPsifDecision,
  getSifPsifResult,
  type SifPsifDecision,
  type SifPsifResult,
  type YesNoAnswer,
} from "@/lib/sewo-sif-psif";

export const SEWO_N1_APPROVAL_CHANNEL = "SEWO_N1_APPROVAL";
export const SEWO_APPROVED_CHANNEL = "SEWO_APPROVED";
export const SEWO_SUBMITTER_ROLES = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] as const;
export const SEWO_STAKEHOLDER_ROLES = [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] as const;

type SewoValidationRecord = Prisma.SEWOGetPayload<{
  include: {
    plant: true;
    communication: {
      include: {
        area: true;
        workstation: true;
      };
    };
    area: true;
    line: true;
    shift: true;
    performedBy: {
      include: {
        plantRoles: {
          include: {
            role: true;
          };
        };
      };
    };
  };
}>;

export type SewoValidationRow = {
  id: string;
  plantCode: string;
  plantName: string;
  occurrenceType: string;
  status: string;
  statusLabel: string;
  location: string;
  description: string;
  analysisDate: string;
  submittedAt: string;
  submittedByName: string;
  submittedByRole: RoleCode | null;
  sifPsifResult: SifPsifResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toYesNoAnswer(value: unknown): YesNoAnswer {
  if (value === "YES" || value === true) return "YES";
  if (value === "NO" || value === false) return "NO";
  return "";
}

export function isSewoSubmitterRole(role?: RoleCode | null) {
  return role === RoleCode.N2_PLANT_MANAGER || role === RoleCode.N3_SAFETY;
}

export function canUseN1SewoValidation(role?: RoleCode | null) {
  return role === RoleCode.N0_ADMIN || role === RoleCode.N1_CORPORATE;
}

export function getSewoTemplateRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function buildSewoSubmissionTemplateData(input: {
  templateData: unknown;
  actorUserId: string;
  actorRole: RoleCode | null;
  submittedAt?: Date;
}) {
  const submittedAt = input.submittedAt ?? new Date();

  return {
    ...getSewoTemplateRecord(input.templateData),
    submittedByUserId: input.actorUserId,
    submittedByRole: input.actorRole,
    submittedAt: submittedAt.toISOString(),
  } satisfies Prisma.InputJsonObject;
}

export function getSewoSubmissionRoleFromTemplate(templateData: unknown): RoleCode | null {
  const value = getSewoTemplateRecord(templateData).submittedByRole;
  return typeof value === "string" && value in RoleCode ? (value as RoleCode) : null;
}

export function getSewoSubmissionAtFromTemplate(templateData: unknown): string | null {
  const value = getSewoTemplateRecord(templateData).submittedAt;
  return typeof value === "string" && value.trim() ? value : null;
}

export function getSifPsifResultFromTemplateData(templateData: unknown): SifPsifResult {
  const data = getSewoTemplateRecord(templateData);
  const rawDecision = data.sifPsifDecision;
  if (!isRecord(rawDecision)) return "PENDING";

  const fallback = createEmptySifPsifDecision();
  const exposures = isRecord(rawDecision.exposures) ? rawDecision.exposures : {};
  const decision: SifPsifDecision = {
    actualSif: toYesNoAnswer(rawDecision.actualSif),
    exposures: Object.fromEntries(
      SIF_PSIF_EXPOSURE_KEYS.map((key) => [key, toYesNoAnswer(exposures[key])]),
    ) as SifPsifDecision["exposures"],
    repeatedSifPotential: toYesNoAnswer(rawDecision.repeatedSifPotential),
    oneWhatIfAway: toYesNoAnswer(rawDecision.oneWhatIfAway),
    noPsifExplanation: typeof rawDecision.noPsifExplanation === "string" ? rawDecision.noPsifExplanation : fallback.noPsifExplanation,
  };

  return getSifPsifResult(decision);
}

export function getSifPsifDisplayLabel(result: SifPsifResult) {
  if (result === "SIF") return "SIF";
  if (result === "PSIF") return "PSIF";
  if (result === "NO_PSIF") return "No PSIF";
  return "Pending";
}

export function isPrioritySifPsif(result: SifPsifResult) {
  return result === "SIF" || result === "PSIF";
}

export function formatSewoOccurrenceType(input: {
  communicationType?: CommunicationType | string | null;
  templateEventType?: unknown;
  eventClassification?: string | null;
}) {
  const rawType =
    input.communicationType ??
    (typeof input.templateEventType === "string" ? input.templateEventType : null);

  if (rawType === CommunicationType.FIRST_AID || rawType === "FIRST_AID") return "First Aid";
  if (rawType === CommunicationType.NEAR_MISS || rawType === "NEAR_MISS") return "Near Miss";
  if (rawType === CommunicationType.ACCIDENT || rawType === "ACCIDENT") return "Injury";
  if (rawType === CommunicationType.UNSAFE_ACT || rawType === "UNSAFE_ACT") return "Unsafe Act";
  if (rawType === CommunicationType.UNSAFE_CONDITION || rawType === "UNSAFE_CONDITION") return "Unsafe Condition";

  return input.eventClassification?.trim() || "S-EWO";
}

export async function getUserHighestRoleForSewoPlant(userId: string, plantId: string): Promise<RoleCode | null> {
  const roles = await prisma.userPlantRole.findMany({
    where: {
      userId,
      OR: [
        { plantId },
        {
          role: {
            code: {
              in: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE],
            },
          },
        },
      ],
    },
    include: {
      role: true,
    },
  });

  const roleCodes = roles.map((entry) => entry.role.code);
  if (roleCodes.includes(RoleCode.N0_ADMIN)) return RoleCode.N0_ADMIN;
  if (roleCodes.includes(RoleCode.N1_CORPORATE)) return RoleCode.N1_CORPORATE;
  if (roleCodes.includes(RoleCode.N2_PLANT_MANAGER)) return RoleCode.N2_PLANT_MANAGER;
  if (roleCodes.includes(RoleCode.N3_SAFETY)) return RoleCode.N3_SAFETY;
  if (roleCodes.includes(RoleCode.N4_SUPERVISOR)) return RoleCode.N4_SUPERVISOR;
  if (roleCodes.includes(RoleCode.N5_OPERATOR)) return RoleCode.N5_OPERATOR;
  if (roleCodes.includes(RoleCode.MEDICO)) return RoleCode.MEDICO;
  if (roleCodes.includes(RoleCode.N6_QR_REPORTER)) return RoleCode.N6_QR_REPORTER;

  return null;
}

function getSubmitterRoleFromRecord(record: SewoValidationRecord): RoleCode | null {
  const templateRole = getSewoSubmissionRoleFromTemplate(record.templateData);
  if (templateRole) return templateRole;

  const plantRole = record.performedBy.plantRoles.find((entry) => entry.plantId === record.plantId);
  return plantRole?.role.code ?? null;
}

function toValidationRow(record: SewoValidationRecord): SewoValidationRow {
  const templateData = getSewoTemplateRecord(record.templateData);
  const occurrenceType = formatSewoOccurrenceType({
    communicationType: record.communication?.type,
    templateEventType: templateData.eventType,
    eventClassification: record.eventClassification,
  });
  const location =
    record.communication?.workstation?.name ??
    record.communication?.area?.name ??
    record.whereText ??
    record.area?.name ??
    record.line?.name ??
    "-";

  return {
    id: record.id,
    plantCode: record.plant.code,
    plantName: record.plant.name,
    occurrenceType,
    status: record.status,
    statusLabel: "Submitted",
    location,
    description: record.howText,
    analysisDate: record.analysisDate.toISOString(),
    submittedAt: getSewoSubmissionAtFromTemplate(record.templateData) ?? record.updatedAt.toISOString(),
    submittedByName: record.performedBy.name,
    submittedByRole: getSubmitterRoleFromRecord(record),
    sifPsifResult: getSifPsifResultFromTemplateData(record.templateData),
  };
}

export async function getPendingSewoValidationRows(input: {
  userId: string;
  plantCode?: string;
  limit?: number;
}) {
  const userRoles = await prisma.userPlantRole.findMany({
    where: {
      userId: input.userId,
      user: {
        isActive: true,
      },
    },
    include: {
      role: true,
      plant: true,
    },
  });
  const roleCodes = userRoles.map((entry) => entry.role.code);
  const canView = roleCodes.includes(RoleCode.N0_ADMIN) || roleCodes.includes(RoleCode.N1_CORPORATE);

  if (!canView) return [];

  const plantWhere = input.plantCode
    ? { code: input.plantCode }
    : { isActive: true };
  const plants = await prisma.plant.findMany({
    where: plantWhere,
    select: {
      id: true,
    },
  });
  const plantIds = plants.map((plant) => plant.id);
  if (!plantIds.length) return [];

  const records = await prisma.sEWO.findMany({
    where: {
      plantId: {
        in: plantIds,
      },
      status: SEWOStatus.IN_APPROVAL,
    },
    include: {
      plant: true,
      communication: {
        include: {
          area: true,
          workstation: true,
        },
      },
      area: true,
      line: true,
      shift: true,
      performedBy: {
        include: {
          plantRoles: {
            include: {
              role: true,
            },
          },
        },
      },
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: input.limit ?? 200,
  });

  return records
    .map(toValidationRow)
    .filter((row) => isSewoSubmitterRole(row.submittedByRole));
}
