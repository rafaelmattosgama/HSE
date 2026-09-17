"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronDown, Factory, Leaf, ShieldCheck } from "lucide-react";
import { AppCard, AppKpiCard } from "@/components/ui/app-surface";
import { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";
import { RootCauseTopFiveCard } from "@/components/feature/root-cause-top-five-card";
import { getUiDictionary } from "@/lib/ui-language";
import type { GroupSafetyLabels } from "@/lib/group-safety-ui";
import { GROUP_SAFETY_VIEWS, groupSafetyHref, resolveGroupSafetyView, selectGroupSafetyPlants, summarizeGroupSafety, topSafetyDistribution, type GroupSafetyPlant, type GroupSafetySummary, type SafetyDistribution, type SafetyMonth } from "@/lib/group-safety-dashboard";

export type GroupDashboardPeriod = { year: number; month: number | null; from: string; to: string; mode: string; label: string };

function navigateLocally(href: string) {
  // Next's native History integration updates useSearchParams without an RSC/data request.
  window.history.pushState(null, "", href);
}
function localLink(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateLocally(href);
}

export function GroupDashboardAreaNavigation({ locale, area }: { locale: string; area: "safety" | "environment" }) {
  const query = useSearchParams();
  const text = getUiDictionary(locale).groupSafety;
  return (
    <nav aria-label={getUiDictionary(locale).dashboard.corporateTitle} className="mt-5 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 sm:inline-flex">
      {(["safety", "environment"] as const).map(key => {
        const Icon = key === "safety" ? ShieldCheck : Leaf;
        return <Link key={key} href={groupSafetyHref(query.toString(), { area: key })} aria-current={area === key ? "page" : undefined}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${area === key ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />{text[key]}
        </Link>;
      })}
    </nav>
  );
}

export function GroupDashboardFilters({ locale, period, area }: { locale: string; period: GroupDashboardPeriod; area: "safety" | "environment" }) {
  const params = useSearchParams();
  const ui = getUiDictionary(locale).dashboard;
  const clearHref = groupSafetyHref(params.toString(), { from: null, to: null, year: String(period.year), month: period.month ? String(period.month) : null });
  const currentHref = groupSafetyHref(params.toString(), { from: null, to: null, year: null, month: null });
  return <section className="app-panel mb-5 rounded-xl p-5">
    <form action="/app/corporate" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]" key={`${period.from}-${period.to}`}>
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="view" value={resolveGroupSafetyView(params.get("view"))} />
      <input type="hidden" name="plant" value={params.get("plant") ?? "group"} />
      <label className="space-y-1 text-sm"><span>{ui.year}</span><input className="app-field w-full" type="number" name="year" min="2001" max="9999" defaultValue={period.year} /></label>
      <label className="space-y-1 text-sm"><span>{ui.month}</span><select className="app-field w-full" name="month" defaultValue={period.month ?? ""}>
        <option value="">{ui.allMonths}</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, index, 1)))}</option>)}
      </select></label>
      <label className="space-y-1 text-sm"><span>{ui.from}</span><input className="app-field w-full" type="date" name="from" defaultValue={period.mode === "range" ? period.from : ""} /></label>
      <label className="space-y-1 text-sm"><span>{ui.to}</span><input className="app-field w-full" type="date" name="to" defaultValue={period.mode === "range" ? period.to : ""} /></label>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-1">
        <button type="submit" className="app-toolbar bg-slate-900 px-4 !text-white">{ui.apply}</button>
        <Link href={clearHref} className="app-toolbar">{ui.clearDates}</Link><Link href={currentHref} className="app-toolbar">{ui.currentYear}</Link>
      </div>
    </form>
  </section>;
}

function ScopeSelector({ plants, value, onChange, text }: { plants: GroupSafetyPlant[]; value: string; onChange: (code: string) => void; text: GroupSafetyLabels }) {
  const [search, setSearch] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const filtered = plants.filter(plant => plant.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function choose(code: string) { onChange(code); setSearch(""); if (details.current) details.current.open = false; summary.current?.focus(); }
  return <details ref={details} className="relative w-full sm:w-80" onKeyDown={event => { if (event.key === "Escape") { if (details.current) details.current.open = false; summary.current?.focus(); } }}>
    <summary ref={summary} className="app-toolbar flex min-h-12 cursor-pointer list-none justify-between gap-3 rounded-xl px-4 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={`${text.scope}: ${value === "group" ? text.group : plants.find(plant => plant.code === value)?.name ?? text.noData}`}>
      <Factory className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{text.scope}: {value === "group" ? text.group : plants.find(plant => plant.code === value)?.name ?? text.noData}</span><ChevronDown aria-hidden="true" className="h-4 w-4" />
    </summary>
    <div className="app-panel absolute left-0 top-full z-20 mt-2 w-full rounded-xl border border-slate-200 p-3 shadow-xl">
      <label className="block text-xs font-semibold text-slate-600">{text.search}<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="app-field mt-1 w-full" /></label>
      <ul className="mt-2 max-h-64 overflow-y-auto" aria-label={text.scope}>
        <li><button type="button" className={`w-full rounded-lg px-3 py-2 text-left font-semibold ${value === "group" ? "bg-teal-50 text-teal-800" : "hover:bg-slate-100"}`} aria-pressed={value === "group"} onClick={() => choose("group")}>{text.group}</button></li>
        {filtered.map(plant => <li key={plant.code}><button type="button" aria-pressed={value === plant.code} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${value === plant.code ? "bg-teal-50 font-semibold text-teal-800" : "hover:bg-slate-100"}`} onClick={() => choose(plant.code)}>{plant.name}{" "}<span className="ml-2 text-xs text-slate-500">{plant.code.toUpperCase()}</span></button></li>)}
      </ul>
      {!filtered.length && <p role="status" className="p-2 text-sm text-slate-600">{text.noMatches}</p>}
    </div>
  </details>;
}

function formatValue(value: number | null, locale: string, text: GroupSafetyLabels, digits = 1) {
  return value === null ? text.noData : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}
function comparison(current: number | null, previous: number | null, locale: string, text: GroupSafetyLabels, adverse = true) {
  if (current === null || previous === null) return { label: text.noComparison, tone: "default" as const, direction: 0 };
  const delta = current - previous;
  const direction = Math.sign(delta);
  const value = previous !== 0 ? `${formatValue(Math.abs(delta / previous * 100), locale, text)}%` : formatValue(Math.abs(delta), locale, text);
  return {
    label: `${direction > 0 ? text.increased : direction < 0 ? text.decreased : text.unchanged}${direction ? ` ${value}` : ""} · ${text.previous}: ${formatValue(previous, locale, text)}${previous === 0 && direction ? ` · ${text.zeroBaseline}` : ""}`,
    tone: adverse && direction > 0 ? "warning" as const : adverse && direction < 0 ? "success" as const : "default" as const,
    direction,
  };
}

function MetricCards({ data, locale, period, updated, compact = false, countsOnly = false }: { data: GroupSafetySummary; locale: string; period: string; updated: string; compact?: boolean; countsOnly?: boolean }) {
  const text = getUiDictionary(locale).groupSafety;
  const previousCountsAvailable = data.previous.events > 0 || data.previous.hours > 0;
  const metrics = [
    ...(!countsOnly ? [
      { key: "frequency", title: text.frequency, value: data.rates.frequency, prior: data.previousRates.frequency, unit: text.perMillion, ranking: data.frequencyRanking, adverse: true },
      { key: "gravity", title: text.gravity, value: data.rates.gravity, prior: data.previousRates.gravity, unit: text.gravityUnit, ranking: null, adverse: true },
      { key: "firstAidRate", title: text.firstAidRate, value: data.rates.firstAid, prior: data.previousRates.firstAid, unit: text.perMillion, ranking: null, adverse: true },
      { key: "nearMissRate", title: text.nearMissRate, value: data.rates.nearMiss, prior: data.previousRates.nearMiss, unit: text.perMillion, ranking: null, adverse: false },
    ] : []),
    { key: "accidents", title: text.accidents, value: data.current.accidents, prior: previousCountsAvailable ? data.previous.accidents : null, unit: text.events, ranking: data.accidentRanking, adverse: true },
    ...(countsOnly ? [{ key: "firstAids", title: text.firstAids, value: data.current.firstAids, prior: previousCountsAvailable ? data.previous.firstAids : null, unit: text.events, ranking: null, adverse: true }] : []),
    { key: "nearMisses", title: text.nearMisses, value: data.current.nearMisses, prior: previousCountsAvailable ? data.previous.nearMisses : null, unit: text.events, ranking: data.nearMissRanking, adverse: false },
  ];
  return <div className={`grid gap-3 sm:grid-cols-2 ${countsOnly ? "xl:grid-cols-3" : compact ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
    {metrics.map(metric => {
      const trend = comparison(metric.value, metric.prior, locale, text, metric.adverse);
      const highest = metric.ranking?.[0];
      const lowest = metric.ranking?.at(-1);
      return <AppKpiCard key={metric.key} tone={trend.tone === "default" && metric.key === "frequency" ? "brand" : trend.tone} className={!compact && !countsOnly && (metric.key === "accidents" || metric.key === "nearMisses") ? "sm:col-span-2" : undefined}
        label={metric.title} value={<span data-testid={`kpi-${metric.key}`} className={compact ? "text-2xl" : undefined}>{formatValue(metric.value, locale, text)}</span>}
        detail={<div className="space-y-2 text-xs leading-5">
          <p className="font-semibold">{metric.unit} · {period}</p>
          <p className="flex items-start gap-1">{trend.direction > 0 ? <ArrowUp aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" /> : trend.direction < 0 ? <ArrowDown aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" /> : null}{trend.label}</p>
          {metric.key === "gravity" && <p>{text.noTarget}</p>}
          {!compact && metric.ranking && <dl className="border-t border-slate-200 pt-2"><div><dt className="inline font-semibold">{text.highest}: </dt><dd className="inline">{highest ? `${highest.plantName} · ${formatValue(highest.value, locale, text)}` : text.noData}</dd></div><div><dt className="inline font-semibold">{text.lowest}: </dt><dd className="inline">{lowest ? `${lowest.plantName} · ${formatValue(lowest.value, locale, text)}` : text.noData}</dd></div></dl>}
          <p className="text-slate-500">{text.loaded}: {updated}</p>
          {data.updatedAt && <p className="text-slate-500">{text.updated}: {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(data.updatedAt))} UTC</p>}
        </div>} />;
    })}
  </div>;
}

function SafetyDaysOverview({ data, locale, scope, loadedAt }: { data: GroupSafetySummary; locale: string; scope: string; loadedAt: string }) {
  const text = getUiDictionary(locale).groupSafety;
  const value = (number: number | null) => formatValue(number, locale, text, 0);
  return <section className="app-hero rounded-2xl p-5 sm:p-6" aria-label={text.currentDays}>
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <div>
        <p className="app-section-eyebrow">{scope} · {text.overview}</p>
        <h2 className="mt-3 text-base font-bold text-slate-800">{text.currentDays}</h2>
        <p className="mt-2 text-5xl font-black tabular-nums text-[var(--brand-700)]" data-testid="group-safety-days">{value(data.currentDays)} <span className="text-base font-semibold">{text.days}</span></p>
        <p className="mt-3 text-xs text-slate-600">{text.loaded}: {loadedAt.slice(0, 10)}</p>
        {!data.lastAccidentDate && <p className="mt-2 text-xs text-slate-600">{text.noAccidentNote}</p>}
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4"><dt className="text-xs font-semibold text-slate-600">{text.latestAccident}</dt><dd className="mt-2 text-base font-bold text-slate-950">{data.latestPlants.map(plant => plant.name).join(", ") || text.noData}</dd><dd className="mt-1 text-xs text-slate-600">{data.lastAccidentDate ?? "—"}{data.lastAccidentDate ? ` · ${value(data.currentDays)} ${text.days}` : ""}</dd></div>
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4"><dt className="text-xs font-semibold text-slate-600">{text.groupRecord} · {scope}</dt><dd className="mt-2 text-2xl font-black text-slate-950" data-testid="group-record">{value(data.recordDays)} <span className="text-xs">{text.days}</span></dd><dd className="mt-1 text-xs text-slate-600">{text.recordBasis}: {data.recordBasisStart ?? text.noData}</dd></div>
        <div><dt className="text-xs text-slate-600">{text.bestCurrent}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{data.bestCurrent ? `${data.bestCurrent.name} · ${value(data.bestCurrent.safetyDays.currentDays)} ${text.days}` : text.noData}</dd></div>
        <div><dt className="text-xs text-slate-600">{text.plantRecord}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{data.bestRecord ? `${data.bestRecord.name} · ${value(data.bestRecord.safetyDays.recordDays)} ${text.days}` : text.noData}</dd></div>
      </dl>
    </div>
    <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">{text.historicalNote}</p>
  </section>;
}

function Analyses({ data, locale, kind = "all" }: { data: GroupSafetySummary; locale: string; kind?: "all" | "roots" | "types" }) {
  const { dashboard: ui, groupSafety: text } = getUiDictionary(locale);
  const panels: Array<{ title: string; source: SafetyDistribution; root: boolean }> = [
    ...(kind !== "types" ? [{ title: text.rootsNearMiss, source: data.rootsNearMiss, root: true }, { title: text.rootsInjury, source: data.rootsInjury, root: true }] : []),
    ...(kind !== "roots" ? [{ title: ui.unsafeActTypeTopFive, source: data.unsafeActs, root: false }, { title: ui.nearMissTypeTopFive, source: data.nearMissTypes, root: false }] : []),
  ];
  return <section className="space-y-3">
    <div className={`grid gap-4 ${kind === "roots" ? "" : "lg:grid-cols-2"}`}>
      {panels.map(panel => <div key={panel.title} className="min-w-0 space-y-2">
        <RootCauseTopFiveCard title={panel.title} entries={topSafetyDistribution(panel.source)} total={panel.source.total} totalLabel={panel.root ? text.classifications : text.events} noDataLabel={text.noData} />
        <p className="px-1 text-xs leading-5 text-slate-600">{panel.root ? `${panel.source.events} ${text.analyses}. ${text.rootsNote}` : `${text.typeNote} ${text.unclassified}: ${panel.source.total - Object.values(panel.source.counts).reduce((sum, count) => sum + count, 0)}.`}</p>
      </div>)}
    </div>
    {kind !== "types" && data.unclassifiedAnalyses > 0 && <p className="text-xs text-amber-800">{text.unclassifiedAnalyses}: {data.unclassifiedAnalyses}</p>}
  </section>;
}

function MonthlyTrends({ months, locale, rates = false }: { months: SafetyMonth[]; locale: string; rates?: boolean }) {
  const text = getUiDictionary(locale).groupSafety;
  const series = rates
    ? [{ label: text.frequency, values: months.map(month => month.rates.frequency), unit: text.perMillion }, { label: text.gravity, values: months.map(month => month.rates.gravity), unit: text.gravityUnit }]
    : [{ label: text.accidents, values: months.map(month => month.totals.accidents), unit: text.events }, { label: text.firstAids, values: months.map(month => month.totals.firstAids), unit: text.events }, { label: text.nearMisses, values: months.map(month => month.totals.nearMisses), unit: text.events }];
  const title = rates ? text.monthlyRates : text.monthlyEvents;
  const monthLabel = (key: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  return <AppCard>
    <h2 className="text-base font-bold text-slate-950">{title}</h2>
    <div className={`mt-3 grid gap-4 ${rates ? "sm:grid-cols-2" : ""}`}>
      {(rates ? series.map(entry => [entry]) : [series]).map((chartSeries, chartIndex) => {
        const values = chartSeries.flatMap(entry => entry.values).filter((value): value is number => value !== null);
        const maximum = Math.max(1, ...values);
        const width = Math.max(480, months.length * 48);
        const x = (index: number) => 38 + index * (width - 70) / Math.max(months.length - 1, 1);
        const y = (value: number) => 138 - value / maximum * 108;
        return <figure key={chartIndex} className="min-w-0">
          <figcaption className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-700">{chartSeries.map((entry, index) => <span className="inline-flex items-center gap-1" key={entry.label}><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke={`var(--chart-series-${index + 1})`} strokeWidth="3" strokeDasharray={index ? `${6 - index} 3` : undefined} /></svg>{index + 1}. {entry.label} · {entry.unit}</span>)}</figcaption>
          {values.length ? <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} 175`} className="w-full min-w-[340px]" role="img" aria-label={chartSeries.map(entry => entry.label).join(", ")}>
            <title>{title}</title>
            {[0, maximum / 2, maximum].map((value, index) => <g key={index}><line x1="38" x2={width - 25} y1={y(value)} y2={y(value)} stroke="var(--border)" /><text x="32" y={y(value) + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">{formatValue(value, locale, text)}</text></g>)}
            {chartSeries.map((entry, seriesIndex) => <g key={entry.label}>
              {entry.values.map((value, index) => value === null ? null : <g key={index}>
                {index > 0 && entry.values[index - 1] !== null && <line x1={x(index - 1)} y1={y(entry.values[index - 1]!)} x2={x(index)} y2={y(value)} stroke={`var(--chart-series-${seriesIndex + 1})`} strokeWidth="2.5" strokeDasharray={seriesIndex ? `${6 - seriesIndex} 3` : undefined} />}
                <circle cx={x(index)} cy={y(value)} r={3 + seriesIndex} fill={`var(--chart-series-${seriesIndex + 1})`}><title>{entry.label} · {monthLabel(months[index].key)}: {formatValue(value, locale, text)}</title></circle>
              </g>)}
            </g>)}
            {months.map((month, index) => <text key={month.key} x={x(index)} y="159" textAnchor="middle" fontSize="9" fill="var(--text-muted)">{monthLabel(month.key)}</text>)}
          </svg></div> : <p className="app-empty">{text.noData}</p>}
        </figure>;
      })}
    </div>
    {months.some(month => month.partial) && <p className="mt-2 text-xs text-slate-500">{text.partialMonth}: {months.filter(month => month.partial).map(month => monthLabel(month.key)).join(", ")}</p>}
    <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{text.values}</summary><div className="app-table-shell mt-2 overflow-x-auto"><table className="app-table"><caption className="sr-only">{title}</caption><thead><tr><th scope="col">{text.month}</th>{series.map(entry => <th scope="col" key={entry.label}>{entry.label}</th>)}</tr></thead><tbody>{months.map((month, index) => <tr key={month.key}><th scope="row">{monthLabel(month.key)}{month.partial ? " *" : ""}</th>{series.map(entry => <td key={entry.label}>{formatValue(entry.values[index], locale, text)}</td>)}</tr>)}</tbody></table></div></details>
  </AppCard>;
}

function Rankings({ data, locale }: { data: GroupSafetySummary; locale: string }) {
  const text = getUiDictionary(locale).groupSafety;
  return <section className="space-y-3"><h2 className="text-lg font-bold text-slate-950">{text.rankings}</h2><p className="text-xs text-slate-600">{text.rankNote}</p><div className="grid gap-4 xl:grid-cols-3">
    {[{ title: text.frequency, rows: data.frequencyRanking }, { title: text.accidents, rows: data.accidentRanking }, { title: text.nearMisses, rows: data.nearMissRanking }].map(ranking => <AppCard key={ranking.title}>
      <h3 className="text-sm font-bold text-slate-900">{ranking.title}</h3>
      {!ranking.rows.length ? <p className="app-empty mt-3">{text.noData}</p> : <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">{[{ label: text.highest, rows: ranking.rows.slice(0, 5) }, { label: text.lowest, rows: [...ranking.rows].sort((a, b) => a.value - b.value || a.plantName.localeCompare(b.plantName)).slice(0, 5) }].map(side => <div key={side.label}><p className="text-xs font-semibold uppercase text-slate-500">{side.label}</p><ol className="mt-1 divide-y divide-slate-200">{side.rows.map(row => <li key={row.plantCode} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0">{row.plantName}</span><strong className="shrink-0 tabular-nums">{formatValue(row.value, locale, text)}</strong></li>)}</ol></div>)}</div>}
    </AppCard>)}
  </div></section>;
}

export function GroupSafetyDashboard({ plants, locale, period, loadedAt, management }: { plants: GroupSafetyPlant[]; locale: string; period: GroupDashboardPeriod; loadedAt: string; management?: ReactNode }) {
  const query = useSearchParams();
  const { dashboard: ui, groupSafety: text } = getUiDictionary(locale);
  const view = resolveGroupSafetyView(query.get("view"));
  useEffect(() => {
    if (query.get("view") !== view) window.history.replaceState(null, "", groupSafetyHref(query.toString(), { view }));
  }, [query, view]);
  const plantCode = query.get("plant") || "group";
  const selected = useMemo(() => selectGroupSafetyPlants(plants, plantCode), [plants, plantCode]);
  const data = useMemo(() => summarizeGroupSafety(selected, loadedAt), [selected, loadedAt]);
  const scope = plantCode === "group" ? text.group : selected[0]?.name ?? text.noData;
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(loadedAt)) + " UTC";
  const href = (changes: Record<string, string>) => groupSafetyHref(query.toString(), changes);
  const pyramid = <div className="min-w-0 space-y-2"><SafetyCommunicationPyramid
    title={ui.communicationPyramid} counts={data.pyramid} locale={locale} scopeLabel={scope} periodLabel={period.label}
    classificationRule={text.pyramidNote} hierarchyLabel={ui.pyramidHierarchyNote} emptyLabel={ui.pyramidEmptyState} helpLabel={ui.help}
    labels={{ fatal: ui.pyramidFatal, seriousInjury: ui.pyramidSeriousInjury, minorInjury: ui.pyramidMinorInjury, firstAid: ui.pyramidFirstAid, nearMiss: ui.pyramidNearMiss, unsafeCondition: ui.pyramidUnsafeCondition, unsafeAct: ui.pyramidUnsafeAct }}
  />{data.unclassifiedAccidents > 0 && <p className="text-xs text-amber-800">{text.pyramidUnclassified}: {data.unclassifiedAccidents}</p>}</div>;
  return <div className="space-y-5">
    <GroupDashboardFilters locale={locale} period={period} area="safety" />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label={text.view} className="hidden flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:flex">
        {GROUP_SAFETY_VIEWS.map(key => <a key={key} href={href({ view: key })} onClick={event => localLink(event, href({ view: key }))} aria-current={view === key ? "page" : undefined} className={`rounded-lg px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${view === key ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}>{text[key]}</a>)}
      </nav>
      <label className="space-y-1 text-sm font-semibold sm:hidden">{text.view}<select className="app-field w-full" value={view} onChange={event => navigateLocally(href({ view: event.target.value }))}>{GROUP_SAFETY_VIEWS.map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>
      <ScopeSelector plants={plants} value={plantCode} text={text} onChange={code => navigateLocally(href({ plant: code, view }))} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <p role="status">{text[view]} · {scope} · {selected.length} {ui.plants.toLowerCase()} · {period.label}</p>
      {plantCode !== "group" && selected.length === 1 && <Link prefetch={false} href={`/app/${encodeURIComponent(plantCode)}/dashboards?${new URLSearchParams({ year: String(period.year), ...(period.month ? { month: String(period.month) } : {}), ...(period.mode === "range" ? { from: period.from, to: period.to } : {}) })}`} className="app-toolbar"><Factory aria-hidden="true" className="h-4 w-4" />{text.plantDetail}</Link>}
    </div>
    {!selected.length ? <p className="app-empty" role="status">{plantCode === "group" ? text.noPlants : text.invalidScope}</p> : <>
      {data.missingHours.length > 0 && <aside className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status"><AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" /><div><p className="text-sm font-bold">{text.missingHours}: {data.missingHours.map(plant => plant.name).join(", ")}</p><p className="mt-1 text-xs leading-5">{text.partialRates}</p></div></aside>}
      <section aria-label={text[view]} className="space-y-5" data-testid={`view-${view}`}>
        {view === "executive" && <>
          <SafetyDaysOverview data={data} locale={locale} scope={scope} loadedAt={loadedAt} />
          <MetricCards data={data} locale={locale} period={period.label} updated={updated} />
          <p className="text-xs text-slate-600">{text.countRule}</p>
          <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_1fr]">{pyramid}<Analyses data={data} locale={locale} kind="roots" /></div>
          <Analyses data={data} locale={locale} kind="types" />
        </>}
        {view === "operational" && <>
          <AppCard><h2 className="flex items-center gap-2 text-base font-bold text-slate-950"><AlertTriangle aria-hidden="true" className="h-5 w-5" />{text.operationalAlerts}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-slate-600">{text.overdueActions}</dt><dd className={`mt-1 text-2xl font-black ${data.overdueActions ? "text-red-700" : "text-slate-800"}`}>{data.overdueActions}</dd></div><div><dt className="text-xs text-slate-600">{text.highPriorityActions}</dt><dd className="mt-1 text-2xl font-black text-slate-800">{data.highPriorityActions}</dd></div><div><dt className="text-xs text-slate-600">{text.missingHours}</dt><dd className="mt-1 text-2xl font-black text-slate-800">{data.missingHours.length}</dd></div></dl><p className="mt-3 text-xs text-slate-500">{text.actionsNote}</p></AppCard>
          <MetricCards data={data} locale={locale} period={period.label} updated={updated} compact />
          <MonthlyTrends months={data.months} locale={locale} />
          <MonthlyTrends months={data.months} locale={locale} rates />
          <Rankings data={data} locale={locale} />
          <Analyses data={data} locale={locale} />
          {plantCode !== "group" && <Link prefetch={false} href={`/app/${encodeURIComponent(plantCode)}/actions`} className="app-toolbar">{ui.openActions}</Link>}
          {management}
        </>}
        {view === "risk" && <>
          <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">{pyramid}<div className="space-y-4"><MetricCards data={data} locale={locale} period={period.label} updated={updated} compact countsOnly /><MonthlyTrends months={data.months} locale={locale} rates /></div></div>
          <Analyses data={data} locale={locale} />
        </>}
      </section>
      <details className="app-card"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays aria-hidden="true" className="h-4 w-4" />{text.methodology}</summary><div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        <p>{text.countRule}</p><p>{text.hoursNote}</p><p>{text.noTarget}</p><p>{ui.hoursWorked}: {formatValue(data.current.hours, locale, text)} h · {ui.kpiDaysLost}: {data.current.lostDays}</p>
        <p>{text.loaded}: {updated}</p><p>{text.updated}: {data.updatedAt ?? text.noData}</p>
      </div></details>
    </>}
  </div>;
}
