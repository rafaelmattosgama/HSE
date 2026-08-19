import { CommunicationType } from "@prisma/client";
import {
  getSifPsifResultFromTemplateData,
} from "@/lib/services/sewo-validation-service";

export const SIF_PSIF_ELIGIBLE_COMMUNICATION_TYPES = [
  CommunicationType.FIRST_AID,
  CommunicationType.NEAR_MISS,
  CommunicationType.ACCIDENT,
] as const;

export type SifPsifIndicatorCategory = (typeof SIF_PSIF_ELIGIBLE_COMMUNICATION_TYPES)[number];

export type ClosedSewoIncident = {
  id: string;
  type: CommunicationType;
  sewoRecords: Array<{
    templateData: unknown;
  }>;
};

export type SifPsifIndicatorSummary = {
  total: number;
  sif: number;
  psif: number;
  sifOrPsif: number;
  sifPercent: number | null;
  psifPercent: number | null;
  sifOrPsifPercent: number | null;
};

export type SifPsifIndicatorBreakdown = {
  overall: SifPsifIndicatorSummary;
  byCategory: Record<SifPsifIndicatorCategory, SifPsifIndicatorSummary>;
};

type ClosedSewoClassification = "SIF" | "PSIF" | "NO_PSIF" | "PENDING";

function getIncidentClosedSewoClassification(incident: ClosedSewoIncident): ClosedSewoClassification {
  const sewo = incident.sewoRecords[0];
  return sewo ? getSifPsifResultFromTemplateData(sewo.templateData) : "PENDING";
}

function createEmptySummary(): SifPsifIndicatorSummary {
  return {
    total: 0,
    sif: 0,
    psif: 0,
    sifOrPsif: 0,
    sifPercent: null,
    psifPercent: null,
    sifOrPsifPercent: null,
  };
}

function finalizeSummary(summary: SifPsifIndicatorSummary): SifPsifIndicatorSummary {
  if (summary.total === 0) return summary;

  return {
    ...summary,
    sifPercent: (summary.sif / summary.total) * 100,
    psifPercent: (summary.psif / summary.total) * 100,
    sifOrPsifPercent: (summary.sifOrPsif / summary.total) * 100,
  };
}

export function buildSifPsifIndicatorBreakdown(incidents: ClosedSewoIncident[]): SifPsifIndicatorBreakdown {
  const byCategory: Record<SifPsifIndicatorCategory, SifPsifIndicatorSummary> = {
    [CommunicationType.FIRST_AID]: createEmptySummary(),
    [CommunicationType.NEAR_MISS]: createEmptySummary(),
    [CommunicationType.ACCIDENT]: createEmptySummary(),
  };

  for (const incident of incidents) {
    if (!SIF_PSIF_ELIGIBLE_COMMUNICATION_TYPES.includes(incident.type as SifPsifIndicatorCategory)) continue;

    const classification = getIncidentClosedSewoClassification(incident);
    const summary = byCategory[incident.type as SifPsifIndicatorCategory];
    summary.total += 1;

    if (classification === "SIF") summary.sif += 1;
    if (classification === "PSIF") summary.psif += 1;
    if (classification === "SIF" || classification === "PSIF") summary.sifOrPsif += 1;
  }

  const finalizedCategories = {
    [CommunicationType.FIRST_AID]: finalizeSummary(byCategory[CommunicationType.FIRST_AID]),
    [CommunicationType.NEAR_MISS]: finalizeSummary(byCategory[CommunicationType.NEAR_MISS]),
    [CommunicationType.ACCIDENT]: finalizeSummary(byCategory[CommunicationType.ACCIDENT]),
  };
  const overall = finalizeSummary(
    Object.values(finalizedCategories).reduce(
      (summary, category) => ({
        ...summary,
        total: summary.total + category.total,
        sif: summary.sif + category.sif,
        psif: summary.psif + category.psif,
        sifOrPsif: summary.sifOrPsif + category.sifOrPsif,
      }),
      createEmptySummary(),
    ),
  );

  return { overall, byCategory: finalizedCategories };
}
