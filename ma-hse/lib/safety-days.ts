const DAY_MS = 24 * 60 * 60 * 1000;

export type SafetyDaysSource = "manual" | "recorded" | "plant-start";
export type SafetyDaysRecordSource = "historical" | "recorded" | "plant-start";

export type SafetyDaysSummary = {
  currentDays: number;
  recordDays: number;
  lastAccidentDate: string | null;
  source: SafetyDaysSource;
  recordSource: SafetyDaysRecordSource;
  historicalRecordStartDate: string | null;
};

export function toUtcDateKey(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

export function parseDateKey(value: string | null | undefined) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function daysBetweenDateKeys(from: string, to: string) {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);

  if (!fromDate || !toDate) return 0;
  return Math.max(0, Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS));
}

function daysBetweenAccidents(previousAccidentDate: string, nextAccidentDate: string) {
  return Math.max(0, daysBetweenDateKeys(previousAccidentDate, nextAccidentDate) - 1);
}

function uniqueSortedDateKeys(dateKeys: string[]) {
  return Array.from(new Set(dateKeys)).sort((left, right) => left.localeCompare(right));
}

export function buildSafetyDaysSummary(input: {
  plantCreatedAt: Date;
  injuryDates: Date[];
  manualLastAccidentDate?: string | null;
  historicalRecordDays?: number | null;
  historicalRecordStartDate?: string | null;
  today?: Date;
}): SafetyDaysSummary {
  const todayKey = toUtcDateKey(input.today ?? new Date());
  const plantCreatedKey = toUtcDateKey(input.plantCreatedAt);
  const manualDate = parseDateKey(input.manualLastAccidentDate);
  const manualKey = manualDate ? toUtcDateKey(manualDate) : null;
  const historicalRecordDays =
    typeof input.historicalRecordDays === "number" && Number.isFinite(input.historicalRecordDays)
      ? Math.max(0, Math.floor(input.historicalRecordDays))
      : null;
  const parsedHistoricalRecordStartDate = parseDateKey(input.historicalRecordStartDate);
  const historicalRecordStartDate = parsedHistoricalRecordStartDate ? toUtcDateKey(parsedHistoricalRecordStartDate) : null;
  const recordedKeys = input.injuryDates
    .map((date) => toUtcDateKey(date))
    .filter((dateKey) => dateKey <= todayKey);
  const accidentKeys = uniqueSortedDateKeys([
    ...recordedKeys,
    ...(manualKey && manualKey <= todayKey ? [manualKey] : []),
  ]);

  if (accidentKeys.length === 0) {
    const currentDays = daysBetweenDateKeys(plantCreatedKey, todayKey);
    const recordDays = Math.max(currentDays, historicalRecordDays ?? 0);
    return {
      currentDays,
      recordDays,
      lastAccidentDate: null,
      source: "plant-start",
      recordSource: historicalRecordDays !== null && historicalRecordDays > currentDays ? "historical" : "plant-start",
      historicalRecordStartDate,
    };
  }

  const lastAccidentDate = accidentKeys[accidentKeys.length - 1];
  const currentDays = daysBetweenDateKeys(lastAccidentDate, todayKey);
  const source: SafetyDaysSource =
    manualKey === lastAccidentDate && !recordedKeys.some((dateKey) => dateKey > manualKey)
      ? "manual"
      : "recorded";
  const closedPeriods = accidentKeys.slice(1).map((dateKey, index) => daysBetweenAccidents(accidentKeys[index], dateKey));
  const plantStartPeriod = plantCreatedKey < accidentKeys[0] ? daysBetweenDateKeys(plantCreatedKey, accidentKeys[0]) : 0;
  const automaticRecordDays = Math.max(
    currentDays,
    plantStartPeriod,
    ...closedPeriods,
  );
  const recordDays = Math.max(automaticRecordDays, historicalRecordDays ?? 0);

  return {
    currentDays,
    recordDays,
    lastAccidentDate,
    source,
    recordSource: historicalRecordDays !== null && historicalRecordDays > automaticRecordDays ? "historical" : "recorded",
    historicalRecordStartDate,
  };
}
