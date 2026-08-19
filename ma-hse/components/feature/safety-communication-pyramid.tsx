import type { CSSProperties } from "react";
import { AlertOctagon, Bandage, CircleDot, Eye, ShieldAlert, TriangleAlert, UserRoundX } from "lucide-react";
import { AppCard } from "@/components/ui/app-surface";
import { HelpPopover } from "@/components/ui/help-popover";

export type SafetyCommunicationPyramidCounts = {
  unsafeAct: number;
  unsafeCondition: number;
  nearMiss: number;
  firstAid: number;
  minorInjury: number;
  seriousInjury: number;
  fatal: number;
};

const PYRAMID_LAYERS = [
  { key: "fatal", fallbackLabel: "Fatal", accent: "var(--safety-pyramid-fatal)", icon: AlertOctagon, width: 40 },
  { key: "seriousInjury", fallbackLabel: "Serious injury", accent: "var(--safety-pyramid-serious-injury)", icon: TriangleAlert, width: 50 },
  { key: "minorInjury", fallbackLabel: "Minor injury", accent: "var(--safety-pyramid-minor-injury)", icon: Bandage, width: 60 },
  { key: "firstAid", fallbackLabel: "First aid", accent: "var(--safety-pyramid-first-aid)", icon: CircleDot, width: 70 },
  { key: "nearMiss", fallbackLabel: "Near miss", accent: "var(--safety-pyramid-near-miss)", icon: Eye, width: 80 },
  { key: "unsafeCondition", fallbackLabel: "Unsafe condition", accent: "var(--safety-pyramid-unsafe-condition)", icon: ShieldAlert, width: 90 },
  { key: "unsafeAct", fallbackLabel: "Unsafe act", accent: "var(--safety-pyramid-unsafe-act)", icon: UserRoundX, width: 100 },
] as const satisfies Array<{
  key: keyof SafetyCommunicationPyramidCounts;
  fallbackLabel: string;
  accent: string;
  icon: typeof AlertOctagon;
  width: number;
}>;

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function getTrendLabel(current: number, previous: number, previousPeriodLabel: string, locale: string) {
  const difference = current - previous;
  const formattedDifference = new Intl.NumberFormat(locale, { signDisplay: "always" }).format(difference);

  if (difference === 0) return `${previousPeriodLabel}: ${formatCount(previous, locale)}`;
  return `${formattedDifference} ${previousPeriodLabel.toLocaleLowerCase(locale)}`;
}

export function SafetyCommunicationPyramid({
  title,
  counts,
  labels = {},
  locale = "en",
  scopeLabel,
  periodLabel,
  previousCounts,
  previousPeriodLabel = "vs same period last year",
  classificationRule = "Each communication is counted once in exactly one level. Submitted and pending-validation records are included provisionally.",
  hierarchyLabel = "Layer width communicates severity hierarchy only; it does not represent volume.",
  emptyLabel = "No communications match the selected period. All levels remain visible.",
  helpLabel = "Help",
}: {
  title: string;
  counts: SafetyCommunicationPyramidCounts;
  labels?: Partial<Record<keyof SafetyCommunicationPyramidCounts, string>>;
  locale?: string;
  scopeLabel: string;
  periodLabel: string;
  previousCounts?: SafetyCommunicationPyramidCounts;
  previousPeriodLabel?: string;
  classificationRule?: string;
  hierarchyLabel?: string;
  emptyLabel?: string;
  helpLabel?: string;
}) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const hasPreviousComparison = previousCounts !== undefined;
  const helpBody = `${classificationRule}\n\n${hierarchyLabel}\n\nPercentages are calculated from ${formatCount(total, locale)} communications displayed in this pyramid.`;

  return (
    <AppCard className="overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="app-section-eyebrow text-slate-700">{title}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600" aria-label={`${scopeLabel}, ${periodLabel}`}>
          <span className="app-chip h-8 px-3">{scopeLabel}</span>
          <span className="app-chip h-8 px-3">{periodLabel}</span>
          <HelpPopover title={title} body={helpBody} buttonLabel={helpLabel} />
        </div>
      </header>

      {total === 0 ? <p className="app-empty mt-3" role="status">{emptyLabel}</p> : null}

      <ol className="mt-3 space-y-1" aria-label={title}>
        {PYRAMID_LAYERS.map((layer) => {
          const value = counts[layer.key];
          const previousValue = previousCounts?.[layer.key];
          const label = labels[layer.key] ?? layer.fallbackLabel;
          const Icon = layer.icon;
          const percentage = total > 0 ? (value / total) * 100 : null;
          const style = {
            "--pyramid-layer-width": `${layer.width}%`,
            "--pyramid-accent": layer.accent,
          } as CSSProperties;

          return (
            <li
              key={layer.key}
              className="flex justify-center px-[var(--pyramid-mobile-inset)] sm:px-0"
              style={{
                ...style,
                "--pyramid-mobile-inset": `${Math.round((100 - layer.width) * 0.12)}%`,
              } as CSSProperties}
            >
              <article
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 rounded-lg border border-l-4 p-2.5 shadow-sm [clip-path:polygon(3%_0%,97%_0%,100%_100%,0%_100%)] sm:w-[var(--pyramid-layer-width)] sm:gap-3 sm:px-5"
                style={{
                  ...style,
                  borderColor: `color-mix(in srgb, ${layer.accent} 62%, var(--border))`,
                  borderLeftColor: layer.accent,
                  background: `linear-gradient(100deg, color-mix(in srgb, ${layer.accent} 52%, var(--surface)) 0%, color-mix(in srgb, ${layer.accent} 24%, var(--surface)) 62%, var(--surface) 100%)`,
                  boxShadow: `0 12px 26px color-mix(in srgb, ${layer.accent} 18%, transparent)`,
                }}
                aria-label={`${label}: ${formatCount(value, locale)}${percentage === null ? ", percentage unavailable" : `, ${percentage.toFixed(1)} percent`}`}
              >
                <div className="flex min-w-0 items-center gap-2 self-center">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white/75 shadow-sm" style={{ borderColor: `color-mix(in srgb, ${layer.accent} 72%, var(--border))`, color: `color-mix(in srgb, ${layer.accent} 72%, var(--text-strong))` }} aria-hidden="true">
                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-xs font-black uppercase leading-4 tracking-[0.08em] text-slate-950">{label}</p>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-2 self-stretch overflow-hidden rounded-md border border-white/35 bg-white/20 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
                  <div className="min-w-0 px-2.5 py-2 sm:px-3">
                    <p className="text-lg font-black leading-none tabular-nums text-slate-950 sm:text-xl">{formatCount(value, locale)}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-700">Events</p>
                  </div>
                  <div className="min-w-0 border-l border-slate-900/15 px-2.5 py-2 sm:px-3">
                    <p className="text-[10px] font-black leading-none text-slate-950 sm:text-sm">{percentage === null ? "Not applicable" : `${percentage.toFixed(1)}%`}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-700">% of total</p>
                    <p className="text-[9px] font-semibold tabular-nums text-slate-700">of {formatCount(total, locale)}</p>
                  </div>
                  {hasPreviousComparison && previousValue !== undefined ? (
                    <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 border-t border-slate-900/15 px-2.5 py-1.5 text-right sm:px-3">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-700">Trend</p>
                      <p className="whitespace-nowrap text-[10px] font-bold tabular-nums text-slate-900">{getTrendLabel(value, previousValue, previousPeriodLabel, locale)}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 grid gap-1 text-[11px] leading-4 text-slate-600 sm:grid-cols-2 sm:gap-4">
        <p>{classificationRule}</p>
        <p>{hierarchyLabel}</p>
      </div>
    </AppCard>
  );
}
