import type { CSSProperties } from "react";
import { AlertOctagon, Bandage, CircleDot, Eye, ShieldAlert, TriangleAlert, UserRoundX } from "lucide-react";
import { AppCard, AppSectionHeader } from "@/components/ui/app-surface";
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
  { key: "fatal", fallbackLabel: "Fatal", rank: 1, accent: "var(--safety-pyramid-fatal)", icon: AlertOctagon, width: 40 },
  { key: "seriousInjury", fallbackLabel: "Serious injury", rank: 2, accent: "var(--safety-pyramid-serious-injury)", icon: TriangleAlert, width: 50 },
  { key: "minorInjury", fallbackLabel: "Minor injury", rank: 3, accent: "var(--safety-pyramid-minor-injury)", icon: Bandage, width: 60 },
  { key: "firstAid", fallbackLabel: "First aid", rank: 4, accent: "var(--safety-pyramid-first-aid)", icon: CircleDot, width: 70 },
  { key: "nearMiss", fallbackLabel: "Near miss", rank: 5, accent: "var(--safety-pyramid-near-miss)", icon: Eye, width: 80 },
  { key: "unsafeCondition", fallbackLabel: "Unsafe condition", rank: 6, accent: "var(--safety-pyramid-unsafe-condition)", icon: ShieldAlert, width: 90 },
  { key: "unsafeAct", fallbackLabel: "Unsafe act", rank: 7, accent: "var(--safety-pyramid-unsafe-act)", icon: UserRoundX, width: 100 },
] as const satisfies Array<{
  key: keyof SafetyCommunicationPyramidCounts;
  fallbackLabel: string;
  rank: number;
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
    <AppCard>
      <AppSectionHeader
        eyebrow={title}
        actions={<HelpPopover title={title} body={helpBody} buttonLabel={helpLabel} />}
      />

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600" aria-label={`${scopeLabel}, ${periodLabel}`}>
        <span className="app-chip h-7">{scopeLabel}</span>
        <span className="app-chip h-7">{periodLabel}</span>
      </div>

      {total === 0 ? <p className="app-empty mt-4" role="status">{emptyLabel}</p> : null}

      <ol className="mt-3 space-y-1.5" aria-label={title}>
        {PYRAMID_LAYERS.map((layer) => {
          const value = counts[layer.key];
          const previousValue = previousCounts?.[layer.key];
          const label = labels[layer.key] ?? layer.fallbackLabel;
          const Icon = layer.icon;
          const percentage = total > 0 ? (value / total) * 100 : null;
          const layerHelpBody = `${label} communications in this severity level.\n\n${classificationRule}\n\nPeriod: ${periodLabel}.`;
          const style = {
            "--pyramid-layer-width": `${layer.width}%`,
            "--pyramid-accent": layer.accent,
          } as CSSProperties;

          return (
            <li key={layer.key} className="flex justify-center">
              <article
                className="grid w-full items-center gap-2.5 rounded-xl border border-slate-200 border-l-4 bg-white p-2.5 shadow-sm sm:w-[var(--pyramid-layer-width)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:[clip-path:polygon(4%_0%,96%_0%,100%_100%,0%_100%)] sm:px-6"
                style={{
                  ...style,
                  borderLeftColor: layer.accent,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${layer.accent} 16%, var(--surface)) 0%, var(--surface) 68%)`,
                }}
                aria-label={`${label}: ${formatCount(value, locale)}${percentage === null ? ", percentage unavailable" : `, ${percentage.toFixed(1)} percent`}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white" style={{ borderColor: layer.accent, color: `color-mix(in srgb, ${layer.accent} 68%, var(--text-strong))` }} aria-hidden="true">
                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black uppercase tracking-[0.1em] text-slate-950">
                      <span className="mr-1.5 text-slate-500">{String(layer.rank).padStart(2, "0")}</span>
                      {label}
                    </p>
                  </div>
                  <HelpPopover title={label} body={layerHelpBody} buttonLabel={`${helpLabel}: ${label}`} />
                </div>

                <div className="flex flex-wrap justify-end gap-3 text-right sm:gap-2">
                  <div>
                    <p className="text-base font-black tabular-nums text-slate-950">{formatCount(value, locale)}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Events</p>
                  </div>
                  <div>
                    <p className="text-lg font-black tabular-nums text-slate-950">{percentage === null ? "—" : `${percentage.toFixed(1)}%`}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">of {formatCount(total, locale)}</p>
                  </div>
                  {hasPreviousComparison && previousValue !== undefined ? (
                    <div className="border-l border-slate-200 pl-3 text-right">
                      <p className="whitespace-nowrap text-xs font-bold tabular-nums text-slate-900">{getTrendLabel(value, previousValue, previousPeriodLabel, locale)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trend</p>
                    </div>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 grid gap-1 text-xs leading-5 text-slate-600 sm:grid-cols-2 sm:gap-4">
        <p>{classificationRule}</p>
        <p>{hierarchyLabel}</p>
      </div>
    </AppCard>
  );
}
