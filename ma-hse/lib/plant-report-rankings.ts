import { CommunicationType } from "@prisma/client";
import { isCommunicationLinkableStatus } from "@/lib/communication-status";
import { buildCommunicationTypeTopEntries, getCommunicationTypeTotal, type CommunicationClassificationRow } from "@/lib/communication-type-top";
import { buildSewoRootCauseTopEntries, getSewoRootCauseLabels } from "@/lib/sewo-root-causes";

export type PlantRanking = {
  title: string;
  total: number;
  entries: Array<{ label: string; count: number; percentage: number }>;
};

export type PlantReportRankingInput = {
  communications: Array<CommunicationClassificationRow & {
    plantId: string; status: string; eventDatetime: Date;
    reporterEmployeeNo: string | null; targetText: string | null;
    targetEmployee: { name: string; dept: string | null } | null;
    workstation: { name: string } | null;
  }>;
  analyses: Array<{ plantId: string; analysisDate: Date; deletedAt: Date | null; templateData: unknown; causeSelections: unknown }>;
  employees: Array<{ plantId: string; employeeNo: string; name: string; dept: string | null }>;
};

export function buildPlantReportRankings(input: PlantReportRankingInput, plantId: string, from: Date, to: Date) {
  const communications = input.communications.filter(row => row.plantId === plantId && isCommunicationLinkableStatus(row.status) && row.eventDatetime >= from && row.eventDatetime <= to);
  const analyses = input.analyses.filter(row => row.plantId === plantId && !row.deletedAt && row.analysisDate >= from && row.analysisDate <= to);
  const employees = new Map(input.employees.filter(row => row.plantId === plantId).map(row => [row.employeeNo, row]));
  const paretos: PlantRanking[] = [{
    title: "Top 5 root causes",
    total: analyses.reduce((sum, row) => sum + getSewoRootCauseLabels(row).length, 0),
    entries: buildSewoRootCauseTopEntries(analyses),
  }, ...[
    [CommunicationType.UNSAFE_ACT, "Top 5 unsafe act types"],
    [CommunicationType.UNSAFE_CONDITION, "Top 5 unsafe condition types"],
    [CommunicationType.NEAR_MISS, "Top 5 near-miss types"],
  ].map(([type, title]) => ({
    title,
    total: getCommunicationTypeTotal(communications, type as CommunicationType),
    entries: buildCommunicationTypeTopEntries(communications, type as CommunicationType),
  }))];

  // Match the plant dashboard: recorded target, employee number and workstation.
  // Missing classifications are excluded, rather than assigned to a guessed label.
  const maps = Array.from({ length: 5 }, () => new Map<string, number>());
  for (const row of communications) {
    const reporter = row.reporterEmployeeNo ? employees.get(row.reporterEmployeeNo) : null;
    const labels = [
      row.targetEmployee?.name ?? row.targetText,
      row.reporterEmployeeNo ? reporter ? `${reporter.employeeNo} - ${reporter.name}` : row.reporterEmployeeNo : null,
      row.targetEmployee?.dept,
      reporter?.dept,
      row.workstation?.name,
    ];
    labels.forEach((label, i) => {
      const normalized = label?.trim();
      if (normalized) maps[i].set(normalized, (maps[i].get(normalized) ?? 0) + 1);
    });
  }
  const titles = ["Workers involved in communications", "Workers with most communications submitted", "Departments involved in communications", "Departments with most communications submitted", "Workstations with most communications"];
  const people: PlantRanking[] = maps.map((counts, i) => {
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    return {
      title: titles[i], total,
      entries: [...counts].map(([label, count]) => ({ label, count, percentage: total ? count / total * 100 : 0 }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5),
    };
  });
  return { plantId, paretos, people };
}
