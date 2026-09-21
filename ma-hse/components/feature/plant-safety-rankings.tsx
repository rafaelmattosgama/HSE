"use client";

import { useId, useState, type ReactNode } from "react";
import type { RankingGroup } from "@/lib/dashboard-visualization";
import type { DashboardUiDictionary } from "@/lib/ui-language";
import { getSafetyDashboardLayoutCopy } from "@/lib/safety-dashboard-layout";

export function PlantSafetyRankings({ rankings, scopeLabel, locale, labels, children }: {
  rankings: RankingGroup[];
  scopeLabel: string;
  locale: string;
  labels: DashboardUiDictionary;
  children?: ReactNode;
}) {
  const copy = getSafetyDashboardLayoutCopy(locale);
  const id = useId();
  const [selectedId, setSelectedId] = useState(rankings[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);
  const primary = rankings.slice(0, 4);
  const selected = primary.find(group => group.id === selectedId) ?? primary[0];
  const number = (n: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

  function ranking(group: RankingGroup) {
    const total = group.higher[0]?.total;
    return <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">{group.title}</h3>
        {total !== undefined ? <span className="text-xs text-slate-600">{copy.base}: {number(total)}</span> : null}
      </div>
      {group.higher.length === 0 ? <p className="app-empty mt-4" role="status">{labels.kpiNoData}</p> : <ol className="mt-2 divide-y divide-slate-100">
        {group.higher.map(entry => {
          const count = entry.count ?? entry.value;
          const percentage = entry.percentage ?? (entry.total ? count / entry.total * 100 : 0);
          return <li key={entry.plantCode} className="py-3">
            <div className="flex items-start justify-between gap-4 text-sm">
              <span className="min-w-0 break-words text-slate-800">{entry.plantName}</span>
              <span className="shrink-0 font-bold tabular-nums text-slate-950">{number(count)} <span className="text-xs font-normal text-slate-600">· {number(percentage, 1)}%</span></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-[var(--brand-700)]" style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} /></div>
          </li>;
        })}
      </ol>}
    </div>;
  }

  return <section className="app-card min-w-0 space-y-4" aria-labelledby={`${id}-heading`}>
    <header><h2 id={`${id}-heading`} className="text-base font-bold text-slate-950">{labels.plantIndicators}</h2><p className="mt-1 text-xs text-slate-600">{labels.scope}: {scopeLabel}</p></header>
    <div className="flex flex-wrap gap-2" role="group" aria-label={labels.plantIndicators}>
      {primary.map(group => <button type="button" key={group.id} className={`app-chip h-auto min-h-9 whitespace-normal px-3 py-2 text-left text-xs ${selected?.id === group.id ? "!border-[var(--brand-700)] !bg-[var(--brand-700)] !text-[var(--primary-foreground)]" : ""}`} aria-pressed={selected?.id === group.id} aria-controls={`${id}-ranking`} onClick={() => setSelectedId(group.id)}>{group.title}</button>)}
    </div>
    <div id={`${id}-ranking`} aria-live="polite">{selected ? ranking(selected) : <p className="app-empty">{labels.kpiNoData}</p>}</div>
    <p className="text-xs text-slate-500">{copy.countShare}</p>
    {rankings.length > 4 ? <>
      <button type="button" className="app-toolbar h-auto min-h-10 w-full whitespace-normal px-3 py-2 text-sm" aria-expanded={expanded} aria-controls={`${id}-extra`} onClick={() => setExpanded(value => !value)}>{expanded ? labels.showLess : copy.moreRankings}</button>
      <div id={`${id}-extra`} hidden={!expanded} className="space-y-6 border-t border-slate-200 pt-4">{rankings.slice(4).map(group => <section key={group.id}>{ranking(group)}</section>)}</div>
    </> : null}
    {children ? <details className="border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--brand-700)]">{copy.charts}</summary><div className="mt-4 min-w-0">{children}</div></details> : null}
  </section>;
}
