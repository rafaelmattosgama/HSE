type RootCauseDetailRecord = {
  isRootCause?: unknown;
  rootCause?: unknown;
  selected?: unknown;
  label?: unknown;
  cause?: unknown;
  causeLabel?: unknown;
  name?: unknown;
  causeItem?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSewoRootCauseAffirmative(value: unknown) {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;

  return ["YES", "Y", "TRUE", "1", "SIM", "SI", "OUI", "JA", "DA", "TAK"].includes(value.trim().toUpperCase());
}

function countRootCauseEntries(entries: unknown) {
  if (!Array.isArray(entries)) return 0;

  return entries.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;

    const detail = entry as RootCauseDetailRecord;
    const isSelected = detail.selected !== false;
    const isRootCause = isSewoRootCauseAffirmative(detail.isRootCause ?? detail.rootCause);

    return isSelected && isRootCause ? sum + 1 : sum;
  }, 0);
}

function readLabel(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRootCauseLabel(entry: RootCauseDetailRecord) {
  const directLabel = readLabel(entry.label) || readLabel(entry.causeLabel) || readLabel(entry.cause) || readLabel(entry.name);

  if (directLabel) return directLabel;

  if (isRecord(entry.causeItem)) {
    return readLabel(entry.causeItem.label);
  }

  return "";
}

function getRootCauseLabelsFromEntries(entries: unknown) {
  if (!Array.isArray(entries)) return [];

  return entries.reduce<string[]>((labels, entry) => {
    if (!isRecord(entry)) return labels;

    const detail = entry as RootCauseDetailRecord;
    const isSelected = detail.selected !== false;
    const isRootCause = isSewoRootCauseAffirmative(detail.isRootCause ?? detail.rootCause);
    const label = getRootCauseLabel(detail);

    if (isSelected && isRootCause && label) {
      labels.push(label);
    }

    return labels;
  }, []);
}

export function getSewoRootCauseCount(
  input: unknown,
  causeSelections?: unknown,
) {
  const source =
    isRecord(input) && ("templateData" in input || "causeSelections" in input)
      ? input
      : { templateData: input, causeSelections };
  const templateData = source.templateData;
  const structuredSelections = source.causeSelections;

  const detailCount = isRecord(templateData) ? countRootCauseEntries(templateData.rootCauseDetails) : 0;
  const selectionCount = countRootCauseEntries(structuredSelections ?? (isRecord(templateData) ? templateData.causeSelections : undefined));

  return Math.max(detailCount, selectionCount);
}

export function getSewoRootCauseLabels(
  input: unknown,
  causeSelections?: unknown,
) {
  const source =
    isRecord(input) && ("templateData" in input || "causeSelections" in input)
      ? input
      : { templateData: input, causeSelections };
  const templateData = source.templateData;
  const structuredSelections = source.causeSelections;

  const detailLabels = isRecord(templateData) ? getRootCauseLabelsFromEntries(templateData.rootCauseDetails) : [];
  const selectionLabels = getRootCauseLabelsFromEntries(
    structuredSelections ?? (isRecord(templateData) ? templateData.causeSelections : undefined),
  );

  return detailLabels.length >= selectionLabels.length ? detailLabels : selectionLabels;
}

export function buildSewoRootCauseTopEntries(rows: unknown[], limit = 5) {
  const counts = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    for (const label of getSewoRootCauseLabels(row)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
      total += 1;
    }
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
