import { buildSafetyDaysSummary, parseDateKey, toUtcDateKey, type SafetyDaysSummary } from "@/lib/safety-days";
import { buildMonthBuckets } from "@/lib/dashboard-visualization";
import { isCommunicationLinkableStatus, isCommunicationInValidationStatus, isDashboardPyramidCommunicationStatus } from "@/lib/communication-status";
import { getSewoRootCauseLabels } from "@/lib/sewo-root-causes";

// The existing corporate and plant dashboards use this factor, not a mean of plant rates.
export const GROUP_SAFETY_RATE_FACTOR = 1_000_000;
export const GROUP_SAFETY_VIEWS = ["executive", "operational", "risk"] as const;
export type GroupSafetyView = (typeof GROUP_SAFETY_VIEWS)[number];
export function resolveGroupSafetyView(value: string | null | undefined): GroupSafetyView {
  return GROUP_SAFETY_VIEWS.includes(value as GroupSafetyView) ? value as GroupSafetyView : "executive";
}
export function groupSafetyHref(query: string, changes: Record<string, string | null>) {
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return `/app/corporate${params.size ? `?${params.toString()}` : ""}`;
}

export type SafetyTotals = {
  accidents: number; firstAids: number; nearMisses: number; lostDays: number; hours: number; events: number;
};
export type SafetyRates = { frequency: number | null; gravity: number | null; firstAid: number | null; nearMiss: number | null };
export type SafetyPyramid = { unsafeAct: number; unsafeCondition: number; nearMiss: number; firstAid: number; minorInjury: number; seriousInjury: number; fatal: number };
export type SafetyDistribution = { counts: Record<string, number>; total: number; events: number };
export type SafetyMonth = { key: string; totals: SafetyTotals; rates: SafetyRates; partial?: boolean };
export type GroupSafetyPlant = {
  id: string; code: string; name: string; createdAt: string;
  current: SafetyTotals; previous: SafetyTotals;
  rates: SafetyRates; previousRates: SafetyRates;
  months: SafetyMonth[]; missingMonths: number;
  pyramid: SafetyPyramid; unclassifiedAccidents: number;
  rootsNearMiss: SafetyDistribution; rootsInjury: SafetyDistribution;
  unclassifiedAnalyses: number;
  unsafeActs: SafetyDistribution; nearMissTypes: SafetyDistribution;
  safetyDays: SafetyDaysSummary; accidentDates: string[]; historyStart: string;
  openActions: number; overdueActions: number; highPriorityActions: number;
  updatedAt: string | null;
};

export type GroupSafetyRawPlant = {
  id: string; code: string; name: string; createdAt: Date;
  communications: Array<{
    type: string; status: string; classification: string | null;
    eventDatetime: Date; reportedAt: Date; lostDays: number | null; updatedAt: Date;
    unsafeActType: { name: string } | null; nearMissType: { name: string } | null;
  }>;
  kpiInputs: Array<{ year: number; month: number; hoursWorked: unknown; updatedAt: Date }>;
  sewoRecords: Array<{
    communication: { type: string } | null;
    templateData: unknown; causeSelections: unknown; updatedAt: Date;
  }>;
  actions: Array<{ status: string; priority: string; dueDate: Date; updatedAt: Date }>;
};

export function emptySafetyTotals(): SafetyTotals {
  return { accidents: 0, firstAids: 0, nearMisses: 0, lostDays: 0, hours: 0, events: 0 };
}
export function calculateSafetyRates(totals: SafetyTotals): SafetyRates {
  const rate = (numerator: number) => totals.hours > 0 ? numerator / totals.hours * GROUP_SAFETY_RATE_FACTOR : null;
  return { frequency: rate(totals.accidents), gravity: rate(totals.lostDays), firstAid: rate(totals.firstAids), nearMiss: rate(totals.nearMisses) };
}
function sumTotals(rows: SafetyTotals[]): SafetyTotals {
  const total = emptySafetyTotals();
  for (const row of rows) for (const key of Object.keys(total) as Array<keyof SafetyTotals>) total[key] += row[key];
  return total;
}
function distribution(): SafetyDistribution { return { counts: {}, total: 0, events: 0 }; }
function addLabel(result: SafetyDistribution, label: string) {
  // Labels can be supplied by users; own-property lookup also handles names such as "constructor".
  Object.defineProperty(result.counts, label, { value: (Object.hasOwn(result.counts, label) ? result.counts[label] : 0) + 1, enumerable: true, writable: true, configurable: true });
}
function mergeDistributions(rows: SafetyDistribution[]): SafetyDistribution {
  const result = distribution();
  for (const row of rows) {
    result.total += row.total;
    result.events += row.events;
    for (const [label, count] of Object.entries(row.counts)) Object.defineProperty(result.counts, label, { value: (Object.hasOwn(result.counts, label) ? result.counts[label] : 0) + count, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
export function topSafetyDistribution(source: SafetyDistribution) {
  return Object.entries(source.counts).map(([label, count]) => ({ label, count, percentage: source.total ? count / source.total * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5);
}
function emptyPyramid(): SafetyPyramid {
  return { unsafeAct: 0, unsafeCondition: 0, nearMiss: 0, firstAid: 0, minorInjury: 0, seriousInjury: 0, fatal: 0 };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function within(date: Date, from: Date, to: Date) { return date >= from && date <= to; }
export function previousSafetyPeriod(from: Date, to: Date) {
  // Matches the existing corporate homologous comparison (UTC calendar year shift).
  const shift = (value: Date) => { const date = new Date(value); date.setUTCFullYear(date.getUTCFullYear() - 1); return date; };
  return { from: shift(from), to: shift(to) };
}

export function buildGroupSafetyPlant(plant: GroupSafetyRawPlant, options: {
  from: Date; to: Date; today: Date; injuryDates: Date[]; safetyConfig: unknown;
}): GroupSafetyPlant {
  const { from, to, today } = options;
  const previousPeriod = previousSafetyPeriod(from, to);
  const buckets = buildMonthBuckets(from, to);
  const previousBuckets = buildMonthBuckets(previousPeriod.from, previousPeriod.to);
  const currentKeys = new Set(buckets.map(bucket => bucket.key));
  const previousKeys = new Set(previousBuckets.map(bucket => bucket.key));
  const current = emptySafetyTotals();
  const previous = emptySafetyTotals();
  const monthly = new Map(buckets.map(bucket => [bucket.key, emptySafetyTotals()]));
  const pyramid = emptyPyramid();
  const unsafeActs = distribution();
  const nearMissTypes = distribution();
  let unclassifiedAccidents = 0;
  function addEvent(target: SafetyTotals, event: GroupSafetyRawPlant["communications"][number]) {
    target.events += 1;
    if (event.type === "ACCIDENT") target.accidents += 1;
    if (event.type === "FIRST_AID") target.firstAids += 1;
    if (event.type === "NEAR_MISS") target.nearMisses += 1;
    // Preserve the existing stored leave-workflow sum across eligible communications.
    target.lostDays += event.lostDays ?? 0;
  }
  for (const event of plant.communications) {
    const inCurrent = within(event.eventDatetime, from, to);
    if (isCommunicationLinkableStatus(event.status)) {
      if (within(event.eventDatetime, previousPeriod.from, previousPeriod.to)) addEvent(previous, event);
      if (inCurrent) {
        addEvent(current, event);
        const month = monthly.get(monthKey(event.eventDatetime));
        if (month) addEvent(month, event);
        for (const [type, source, name] of [["UNSAFE_ACT", unsafeActs, event.unsafeActType?.name], ["NEAR_MISS", nearMissTypes, event.nearMissType?.name]] as const) {
          if (event.type !== type) continue;
          source.total += 1; source.events += 1;
          if (name?.trim()) addLabel(source, name.trim());
        }
      }
    }
    const inPyramid = inCurrent || (isCommunicationInValidationStatus(event.status) && within(event.reportedAt, from, to));
    if (inPyramid && isDashboardPyramidCommunicationStatus(event.status)) {
      if (event.type === "UNSAFE_ACT") pyramid.unsafeAct += 1;
      if (event.type === "UNSAFE_CONDITION") pyramid.unsafeCondition += 1;
      if (event.type === "NEAR_MISS") pyramid.nearMiss += 1;
      if (event.type === "FIRST_AID") pyramid.firstAid += 1;
      if (event.type === "ACCIDENT") {
        if (event.classification === "MINOR") pyramid.minorInjury += 1;
        else if (event.classification === "SERIOUS") pyramid.seriousInjury += 1;
        else if (event.classification === "FATAL") pyramid.fatal += 1;
        else unclassifiedAccidents += 1;
      }
    }
  }
  const reportedMonths = new Set<string>();
  for (const input of plant.kpiInputs) {
    const key = `${input.year}-${String(input.month).padStart(2, "0")}`;
    const hours = Number(input.hoursWorked);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    if (currentKeys.has(key)) { current.hours += hours; reportedMonths.add(key); const month = monthly.get(key); if (month) month.hours += hours; }
    if (previousKeys.has(key)) previous.hours += hours;
  }
  const rootsNearMiss = distribution();
  const rootsInjury = distribution();
  let unclassifiedAnalyses = 0;
  for (const analysis of plant.sewoRecords) {
    // Use the linked communication's taxonomy. A missing link is explicitly reported, never guessed.
    const type = analysis.communication?.type;
    const target = type === "NEAR_MISS" ? rootsNearMiss : type === "ACCIDENT" || type === "FIRST_AID" ? rootsInjury : null;
    if (!target) { unclassifiedAnalyses += 1; continue; }
    target.events += 1;
    for (const label of getSewoRootCauseLabels(analysis)) { addLabel(target, label); target.total += 1; }
  }
  const config = record(options.safetyConfig);
  const manualLastAccidentDate = typeof config.manualLastAccidentDate === "string" ? config.manualLastAccidentDate : null;
  const safetyDays = buildSafetyDaysSummary({
    plantCreatedAt: plant.createdAt, injuryDates: options.injuryDates, today, manualLastAccidentDate,
    historicalRecordDays: typeof config.historicalRecordDays === "number" ? config.historicalRecordDays : null,
    historicalRecordStartDate: typeof config.historicalRecordStartDate === "string" ? config.historicalRecordStartDate : null,
  });
  const todayKey = toUtcDateKey(today);
  const manualDate = parseDateKey(manualLastAccidentDate);
  const accidentDates = [...new Set([...options.injuryDates.map(toUtcDateKey), ...(manualDate ? [toUtcDateKey(manualDate)] : [])])].filter(date => date <= todayKey).sort();
  const dates = [...plant.communications, ...plant.kpiInputs, ...plant.sewoRecords, ...plant.actions].map(row => row.updatedAt.toISOString()).sort();
  return {
    id: plant.id, code: plant.code, name: plant.name, createdAt: plant.createdAt.toISOString(),
    current, previous, rates: calculateSafetyRates(current), previousRates: calculateSafetyRates(previous),
    months: [...monthly].map(([key, totals]) => ({ key, totals, rates: calculateSafetyRates(totals) })),
    missingMonths: buckets.filter(bucket => bucket.key <= monthKey(today) && !reportedMonths.has(bucket.key)).length,
    pyramid, unclassifiedAccidents, rootsNearMiss, rootsInjury, unclassifiedAnalyses, unsafeActs, nearMissTypes,
    safetyDays, accidentDates, historyStart: [toUtcDateKey(plant.createdAt), ...accidentDates].sort()[0],
    openActions: plant.actions.filter(row => row.status === "OPEN" || row.status === "ONGOING").length,
    overdueActions: plant.actions.filter(row => (row.status === "OPEN" || row.status === "ONGOING") && row.dueDate < today).length,
    highPriorityActions: plant.actions.filter(row => (row.status === "OPEN" || row.status === "ONGOING") && row.priority === "HIGH").length,
    updatedAt: dates.at(-1) ?? null,
  };
}

export function summarizeGroupSafety(plants: GroupSafetyPlant[], today: string) {
  const current = sumTotals(plants.map(plant => plant.current));
  const previous = sumTotals(plants.map(plant => plant.previous));
  const pyramid = emptyPyramid();
  for (const plant of plants) for (const key of Object.keys(pyramid) as Array<keyof SafetyPyramid>) pyramid[key] += plant.pyramid[key];
  const keys = [...new Set(plants.flatMap(plant => plant.months.map(month => month.key)))].sort();
  const months = keys.filter(key => key <= today.slice(0, 7)).map(key => {
    const totals = sumTotals(plants.flatMap(plant => plant.months.filter(month => month.key === key).map(month => month.totals)));
    return { key, totals, rates: calculateSafetyRates(totals), partial: key === today.slice(0, 7) };
  });
  const historyStart = plants.map(plant => plant.historyStart).sort().at(-1) ?? null;
  const accidentDates = [...new Set(plants.flatMap(plant => plant.accidentDates))].sort();
  const lastAccidentDate = accidentDates.at(-1) ?? null;
  const latestPlants = lastAccidentDate ? plants.filter(plant => plant.safetyDays.lastAccidentDate === lastAccidentDate) : [];
  // A group record needs a continuous timeline shared by every plant. An individual
  // manual historical record cannot establish an accident-free interval for the group.
  const observedRecord = historyStart ? buildSafetyDaysSummary({
    plantCreatedAt: new Date(`${historyStart}T00:00:00Z`),
    injuryDates: accidentDates.filter(date => date >= historyStart).map(date => new Date(`${date}T00:00:00Z`)),
    today: new Date(today),
  }) : null;
  const currentDays = !plants.length ? null : lastAccidentDate
    ? Math.max(0, Math.floor((new Date(`${today.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${lastAccidentDate}T00:00:00Z`).getTime()) / 86_400_000))
    : observedRecord?.currentDays ?? null;
  function ranking(metric: "frequency" | "accidents" | "nearMisses") {
    return plants.flatMap(plant => {
      const value = metric === "frequency" ? plant.rates.frequency : plant.current[metric];
      return value === null ? [] : [{ plantCode: plant.code, plantName: plant.name, value }];
    }).sort((a, b) => b.value - a.value || a.plantName.localeCompare(b.plantName));
  }
  return {
    current, previous, rates: calculateSafetyRates(current), previousRates: calculateSafetyRates(previous), months, pyramid,
    frequencyRanking: ranking("frequency"), accidentRanking: ranking("accidents"), nearMissRanking: ranking("nearMisses"),
    rootsNearMiss: mergeDistributions(plants.map(plant => plant.rootsNearMiss)), rootsInjury: mergeDistributions(plants.map(plant => plant.rootsInjury)),
    unsafeActs: mergeDistributions(plants.map(plant => plant.unsafeActs)), nearMissTypes: mergeDistributions(plants.map(plant => plant.nearMissTypes)),
    currentDays, recordDays: plants.length === 1 ? plants[0].safetyDays.recordDays : observedRecord?.recordDays ?? null,
    historyStart, recordBasisStart: plants.length === 1 && plants[0].safetyDays.recordSource === "historical" ? plants[0].safetyDays.historicalRecordStartDate : historyStart, lastAccidentDate, latestPlants,
    bestCurrent: [...plants].sort((a, b) => b.safetyDays.currentDays - a.safetyDays.currentDays || a.name.localeCompare(b.name))[0] ?? null,
    bestRecord: [...plants].sort((a, b) => b.safetyDays.recordDays - a.safetyDays.recordDays || a.name.localeCompare(b.name))[0] ?? null,
    missingHours: plants.filter(plant => plant.current.hours <= 0 || plant.missingMonths > 0),
    unclassifiedAnalyses: plants.reduce((sum, plant) => sum + plant.unclassifiedAnalyses, 0),
    unclassifiedAccidents: plants.reduce((sum, plant) => sum + plant.unclassifiedAccidents, 0),
    overdueActions: plants.reduce((sum, plant) => sum + plant.overdueActions, 0),
    highPriorityActions: plants.reduce((sum, plant) => sum + plant.highPriorityActions, 0),
    updatedAt: plants.flatMap(plant => plant.updatedAt ? [plant.updatedAt] : []).sort().at(-1) ?? null,
  };
}

export function selectGroupSafetyPlants(plants: GroupSafetyPlant[], code: string | null) {
  return code && code !== "group" ? plants.filter(plant => plant.code === code) : plants;
}
export type GroupSafetySummary = ReturnType<typeof summarizeGroupSafety>;
