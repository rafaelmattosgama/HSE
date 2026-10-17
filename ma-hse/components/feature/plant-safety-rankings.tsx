"use client";

import { useId, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { RankingGroup } from "@/lib/dashboard-visualization";
import type { DashboardPyramidLevel, PyramidDepartmentPareto } from "@/lib/dashboard-pyramid";
import type { DashboardUiDictionary } from "@/lib/ui-language";
import { getSafetyDashboardLayoutCopy } from "@/lib/safety-dashboard-layout";
import { useSafetyPyramidInteraction } from "@/components/feature/safety-pyramid-interaction";

function wrapDepartmentLabel(label: string, maxChars: number) {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      current = "";
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
    } else if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function DepartmentPareto({ data, locale, labels, title }: {
  data: PyramidDepartmentPareto;
  locale: string;
  labels: DashboardUiDictionary;
  title: string;
}) {
  const number = (value: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  if (data.departments.length === 0 || data.total === 0) return <p className="app-empty mt-3" role="status">{labels.pyramidDepartmentNoData}</p>;

  const width = 720;
  const height = 310;
  const baseline = 220;
  const plotWidth = 640;
  const barWidth = 110;
  const gap = 18;
  const step = barWidth + gap;
  const groupWidth = data.departments.length * barWidth + (data.departments.length - 1) * gap;
  const startX = 40 + (plotWidth - groupWidth) / 2;
  const maxCount = Math.max(1, ...data.departments.map((department) => department.count));
  const values = data.departments.map((department, index) => {
    const cumulativeCount = data.departments.slice(0, index + 1).reduce((sum, entry) => sum + entry.count, 0);
    return { ...department, cumulativePercent: data.total > 0 ? (cumulativeCount / data.total) * 100 : 0 };
  });
  const points = values.map((department, index) => `${startX + index * step + barWidth / 2},${baseline - (department.cumulativePercent / 100) * 165}`).join(" ");

  return <div className="mt-3 min-w-0">
    <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-series-1)]" aria-hidden="true" />{labels.value}</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--chart-line)]" aria-hidden="true" />{labels.pyramidCumulativePercent}</span>
      <span className="ml-auto">{labels.total}: {number(data.total)}</span>
    </div>
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px]" role="img" aria-label={title}>
        <title>{title}</title>
        <line x1="40" y1={baseline} x2="680" y2={baseline} stroke="var(--chart-axis)" />
        {values.map((department, index) => {
          const barHeight = (department.count / maxCount) * 150;
          const x = startX + index * step;
          return <g key={department.id}>
            <rect x={x} y={baseline - barHeight} width={barWidth} height={barHeight} rx="5" fill="var(--chart-series-1)">
              <title>{`${department.name}: ${number(department.count)} · ${number((department.count / data.total) * 100, 1)}%`}</title>
            </rect>
            <text x={x + barWidth / 2} y={barHeight >= 22 ? baseline - barHeight + 15 : baseline - barHeight - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill={barHeight >= 22 ? "white" : "var(--chart-text-strong)"}>{number(department.count)}</text>
            <text x={x + barWidth / 2} y="240" textAnchor="middle" fontSize="10" fill="var(--chart-text-muted)">
              {wrapDepartmentLabel(department.name, Math.max(10, Math.floor(barWidth / 6))).map((line, lineIndex) => <tspan key={`${department.id}-${lineIndex}`} x={x + barWidth / 2} dy={lineIndex === 0 ? 0 : 12}>{line}</tspan>)}
            </text>
          </g>;
        })}
        <polyline points={points} fill="none" stroke="var(--chart-line)" strokeWidth="2.5" />
        {values.map((department, index) => {
          const x = startX + index * step + barWidth / 2;
          const y = baseline - (department.cumulativePercent / 100) * 165;
          return <g key={`${department.id}-cumulative`}>
            <circle cx={x} cy={y} r="4" fill="var(--chart-line)"><title>{`${department.name}: ${number(department.cumulativePercent, 1)}% ${labels.pyramidCumulativePercent}`}</title></circle>
            <text x={x} y={Math.max(36, y - 9)} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--chart-text-strong)">{number(department.cumulativePercent, 1)}%</text>
          </g>;
        })}
      </svg>
    </div>
  </div>;
}

export function PlantSafetyRankings({ rankings, scopeLabel, locale, labels, children, pyramidDepartmentPareto }: {
  rankings: RankingGroup[];
  scopeLabel: string;
  locale: string;
  labels: DashboardUiDictionary;
  children?: ReactNode;
  pyramidDepartmentPareto?: Record<DashboardPyramidLevel, PyramidDepartmentPareto>;
}) {
  const copy = getSafetyDashboardLayoutCopy(locale);
  const id = useId();
  const [selectedId, setSelectedId] = useState(rankings[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);
  const interaction = useSafetyPyramidInteraction();
  const primary = rankings.slice(0, 4);
  const selected = primary.find(group => group.id === selectedId) ?? primary[0];
  const activeLevel = interaction?.activeLevel ?? null;
  const preview = activeLevel && pyramidDepartmentPareto ? pyramidDepartmentPareto[activeLevel] : null;
  const levelLabels: Record<DashboardPyramidLevel, string> = {
    fatal: labels.pyramidFatal,
    seriousInjury: labels.pyramidSeriousInjury,
    minorInjury: labels.pyramidMinorInjury,
    firstAid: labels.pyramidFirstAid,
    nearMiss: labels.pyramidNearMiss,
    unsafeCondition: labels.pyramidUnsafeCondition,
    unsafeAct: labels.pyramidUnsafeAct,
  };
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
    <div id={`${id}-ranking`} aria-live="polite">
      {preview && activeLevel ? <section className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3" aria-label={`${levelLabels[activeLevel]} · ${labels.pyramidDepartmentPreview}`}>
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold text-slate-950">{levelLabels[activeLevel]} · {labels.pyramidDepartmentPreview}</h3><p className="mt-1 text-xs text-slate-600">{scopeLabel}</p></div>
          {interaction?.pinnedLevel ? <button type="button" className="app-toolbar inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs" onClick={interaction.clearPinnedLevel}><X className="h-3.5 w-3.5" aria-hidden="true" />{labels.pyramidClearDepartmentPreview}</button> : null}
        </header>
        <DepartmentPareto data={preview} locale={locale} labels={labels} title={`${levelLabels[activeLevel]} · ${labels.pyramidDepartmentPreview}`} />
      </section> : selected ? ranking(selected) : <p className="app-empty">{labels.kpiNoData}</p>}
    </div>
    {preview ? null : <p className="text-xs text-slate-500">{copy.countShare}</p>}
    {rankings.length > 4 ? <>
      <button type="button" className="app-toolbar h-auto min-h-10 w-full whitespace-normal px-3 py-2 text-sm" aria-expanded={expanded} aria-controls={`${id}-extra`} onClick={() => setExpanded(value => !value)}>{expanded ? labels.showLess : copy.moreRankings}</button>
      <div id={`${id}-extra`} hidden={!expanded} className="space-y-6 border-t border-slate-200 pt-4">{rankings.slice(4).map(group => <section key={group.id}>{ranking(group)}</section>)}</div>
    </> : null}
    {children ? <details className="border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--brand-700)]">{copy.charts}</summary><div className="mt-4 min-w-0">{children}</div></details> : null}
  </section>;
}
