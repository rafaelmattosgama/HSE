import { CommunicationType } from "@prisma/client";

type ClassificationRef = {
  name: string;
} | null;

export type CommunicationClassificationRow = {
  type: CommunicationType | string;
  unsafeActType?: ClassificationRef;
  unsafeConditionType?: ClassificationRef;
  nearMissType?: ClassificationRef;
};

export type CommunicationTypeTopEntry = {
  label: string;
  count: number;
  percentage: number;
};

function getClassificationName(row: CommunicationClassificationRow, type: CommunicationType) {
  if (type === CommunicationType.UNSAFE_ACT) return row.unsafeActType?.name;
  if (type === CommunicationType.UNSAFE_CONDITION) return row.unsafeConditionType?.name;
  if (type === CommunicationType.NEAR_MISS) return row.nearMissType?.name;
  return null;
}

export function getCommunicationTypeTotal(rows: CommunicationClassificationRow[], type: CommunicationType) {
  return rows.filter((row) => row.type === type).length;
}

export function buildCommunicationTypeTopEntries(
  rows: CommunicationClassificationRow[],
  type: CommunicationType,
  limit = 5,
): CommunicationTypeTopEntry[] {
  const total = getCommunicationTypeTotal(rows, type);
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.type !== type) continue;

    const label = getClassificationName(row, type)?.trim();
    if (!label) continue;

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
