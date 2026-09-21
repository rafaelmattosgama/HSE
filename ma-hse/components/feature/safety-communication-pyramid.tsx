"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppCard } from "@/components/ui/app-surface";
import { HelpPopover } from "@/components/ui/help-popover";
import { getUiDictionary } from "@/lib/ui-language";
import { getSafetyDashboardLayoutCopy } from "@/lib/safety-dashboard-layout";

export type SafetyCommunicationPyramidCounts = {
  unsafeAct: number; unsafeCondition: number; nearMiss: number; firstAid: number;
  minorInjury: number; seriousInjury: number; fatal: number;
};
type Level = keyof SafetyCommunicationPyramidCounts;
export type PyramidRecord = { id: string; code: string; level: Level; pending: boolean };

const PYRAMID_LAYERS = [
  { key: "fatal", accent: "var(--safety-pyramid-fatal)", inset: 25 },
  { key: "seriousInjury", accent: "var(--safety-pyramid-serious-injury)", inset: 21 },
  { key: "minorInjury", accent: "var(--safety-pyramid-minor-injury)", inset: 17 },
  { key: "firstAid", accent: "var(--safety-pyramid-first-aid)", inset: 13 },
  { key: "nearMiss", accent: "var(--safety-pyramid-near-miss)", inset: 9 },
  { key: "unsafeCondition", accent: "var(--safety-pyramid-unsafe-condition)", inset: 5 },
  { key: "unsafeAct", accent: "var(--safety-pyramid-unsafe-act)", inset: 1 },
] as const;

export function SafetyCommunicationPyramid({
  title, counts, labels = {}, locale = "en", scopeLabel, periodLabel,
  previousCounts, previousPeriodLabel,
  classificationRule, hierarchyLabel, emptyLabel, helpLabel,
  records, plantCode,
}: {
  title: string;
  counts: SafetyCommunicationPyramidCounts;
  labels?: Partial<Record<Level, string>>;
  locale?: string;
  scopeLabel: string;
  periodLabel: string;
  previousCounts?: SafetyCommunicationPyramidCounts;
  previousPeriodLabel?: string;
  classificationRule?: string;
  hierarchyLabel?: string;
  emptyLabel?: string;
  helpLabel?: string;
  records?: PyramidRecord[];
  plantCode?: string;
}) {
  const text = getUiDictionary(locale).dashboard;
  const copy = getSafetyDashboardLayoutCopy(locale);
  const layerLabels: Record<Level, string> = {
    fatal: text.pyramidFatal, seriousInjury: text.pyramidSeriousInjury,
    minorInjury: text.pyramidMinorInjury, firstAid: text.pyramidFirstAid,
    nearMiss: text.pyramidNearMiss, unsafeCondition: text.pyramidUnsafeCondition,
    unsafeAct: text.pyramidUnsafeAct, ...labels,
  };
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const percentage = (value: number) => total ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / total * 100)}%` : text.kpiNotApplicable;
  const pending = records?.filter(record => record.pending).length ?? 0;
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Level | null>(null);
  const [limit, setLimit] = useState(20);
  const id = useId();
  const selectedRecords = records?.filter(record => record.level === selected) ?? [];
  const showRecords = (level: Level) => {
    setSelected(level);
    setLimit(20);
    dialog.current?.showModal();
  };

  return <AppCard className="@container min-w-0">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-bold text-slate-950">{title}</h2><p className="mt-1 break-words text-xs text-slate-600">{scopeLabel}</p><p className="mt-1 text-xs text-slate-500">{periodLabel}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{number(total)} {copy.total}</span><HelpPopover title={title} body={`${classificationRule ?? text.pyramidClassificationRule}\n\n${hierarchyLabel ?? text.pyramidHierarchyNote}`} buttonLabel={helpLabel ?? text.help} /></div>
    </header>
    {total === 0 ? <p className="app-empty mt-3" role="status">{emptyLabel ?? text.pyramidEmptyState}</p> : null}
    <ol className="mt-4 space-y-1.5" aria-label={title}>
      {PYRAMID_LAYERS.map(layer => {
        const value = counts[layer.key];
        const label = layerLabels[layer.key];
        const style = { "--pyramid-accent": layer.accent, "--pyramid-inset": `${layer.inset}%` } as CSSProperties;
        const band = <>
          <span data-testid={`pyramid-band-${layer.key}`} className="relative isolate flex min-h-12 min-w-0 items-center justify-center px-2 py-2 text-center" style={style}>
            <span aria-hidden="true" className="absolute inset-0 -z-10" style={{ clipPath: `polygon(${layer.inset}% 0,${100-layer.inset}% 0,${102-layer.inset}% 100%,${layer.inset-2}% 100%)`, background: `color-mix(in srgb, ${layer.accent} 48%, var(--surface))` }} />
            <span className="min-w-0 break-words text-xs font-bold leading-4 text-slate-950">{label}</span>
          </span>
          <span data-testid={`pyramid-metrics-${layer.key}`} className="flex min-w-0 flex-col items-end justify-center gap-1 text-right @sm:flex-row @sm:items-center @sm:gap-3">
            <span data-testid={`pyramid-events-${layer.key}`} className="text-sm font-bold tabular-nums text-slate-950">{number(value)}</span>
            <span className="min-w-0 break-words text-xs tabular-nums text-slate-600">{percentage(value)}</span>
          </span>
        </>;
        const rowClass = "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)] gap-2 rounded-md text-left @sm:grid-cols-[minmax(0,1fr)_minmax(6rem,auto)]";
        const accessibleLabel = `${label}: ${number(value)}, ${percentage(value)}`;
        return <li key={layer.key}>
          {records && plantCode ? <button type="button" className={`${rowClass} cursor-pointer hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]`} aria-label={`${accessibleLabel}. ${copy.view}`} onClick={() => showRecords(layer.key)}>{band}</button> : <div className={rowClass} aria-label={accessibleLabel}>{band}</div>}
        </li>;
      })}
    </ol>
    <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
      {records ? <span>{number(total - pending)} {copy.validated} · {number(pending)} {copy.pending}</span> : null}
      <span>{copy.percentage}</span>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">{hierarchyLabel ?? text.pyramidHierarchyNote}</p>
    {previousCounts ? <details className="mt-3 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">{copy.trend} · {previousPeriodLabel ?? text.samePeriodLastYearShort}</summary>
      <dl className="mt-2 space-y-2 text-xs">{PYRAMID_LAYERS.map(layer => {
        const delta = counts[layer.key] - previousCounts[layer.key];
        return <div key={layer.key} className="flex justify-between gap-3"><dt>{layerLabels[layer.key]}</dt><dd className="tabular-nums">{number(previousCounts[layer.key])} → {number(counts[layer.key])} ({delta > 0 ? "+" : ""}{number(delta)})</dd></div>;
      })}</dl>
    </details> : null}
    {records && plantCode ? <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto max-h-[80vh] w-[min(38rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text-strong)] shadow-xl backdrop:bg-black/40">
      <div className="flex items-start justify-between gap-4"><div><h3 id={`${id}-title`} className="text-base font-bold">{selected ? layerLabels[selected] : title} · {selectedRecords.length}</h3><p className="mt-1 text-xs text-slate-600">{scopeLabel} · {periodLabel}</p></div><button type="button" className="app-toolbar px-3" onClick={() => dialog.current?.close()}>{copy.close}</button></div>
      {selectedRecords.length ? <ul className="mt-4 divide-y divide-slate-200">{selectedRecords.slice(0, limit).map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><Link className="font-semibold text-[var(--brand-700)] underline" href={`/app/${encodeURIComponent(plantCode)}/communications/${encodeURIComponent(record.id)}`}>{record.code}</Link><span className="text-xs text-slate-600">{record.pending ? copy.pending : copy.validated}</span></li>)}</ul> : <p className="app-empty mt-4">{copy.empty}</p>}
      {selectedRecords.length > limit ? <button type="button" className="app-toolbar mt-3 px-3" onClick={() => setLimit(value => value + 20)}>{text.showMore}</button> : null}
    </dialog> : null}
  </AppCard>;
}
