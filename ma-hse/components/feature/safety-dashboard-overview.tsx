import type { ComponentProps } from "react";
import { Factory } from "lucide-react";
import { HelpPopover } from "@/components/ui/help-popover";
import type { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { getSafetyDashboardLayoutCopy } from "@/lib/safety-dashboard-layout";

type Props = Pick<ComponentProps<typeof SafetyDashboardKpiGroups>, "locale" | "labels" | "periodLabel" | "metrics" | "detailed"> & { sifPrevious?: { sif: number; psif: number } };

export function SafetyDashboardOverview({ locale, labels, periodLabel, metrics, detailed, sifPrevious }: Props) {
  const copy = getSafetyDashboardLayoutCopy(locale);
  const number = (value: number | null, digits = 0) => value === null ? labels.kpiNotApplicable : new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const cards = detailed ? [
    // Retain the existing accident definition: this is not a lost-time-only count.
    { title: labels.injuries, value: number(metrics.injuries), help: labels.kpiInjuriesDefinition, detail: metrics.comparisons?.injuries },
    { title: `${labels.kpiSif} / ${labels.kpiPsif}`, value: metrics.sifPsif?.current.overall.total ? `${number(metrics.sifPsif.current.overall.sif)} / ${number(metrics.sifPsif.current.overall.psif)}` : labels.kpiNoData, help: labels.kpiSifPsifIncidentsDefinition, detail: sifPrevious ? `${labels.samePeriodLastYearShort}: ${number(sifPrevious.sif)} / ${number(sifPrevious.psif)}` : undefined },
    { title: labels.frequencyRate, value: number(metrics.frequencyRate, 2), help: labels.kpiFrequencyRateDefinition, detail: metrics.comparisons?.frequencyRate },
    { title: labels.gravityRate, value: number(metrics.gravityRate, 2), help: labels.kpiGravityRateDefinition, detail: metrics.comparisons?.gravityRate },
    { title: labels.overdueActions, value: number(metrics.overdueActions), help: labels.kpiOverdueActionsDefinition, detail: `${labels.kpiCurrentStock} · ${labels.openActions}: ${number(metrics.openActions)}`, attention: metrics.overdueActions > 0 },
  ] : [
    { title: labels.validatedEvents, value: number(metrics.validatedEvents), help: labels.kpiValidatedEventsDefinition, detail: metrics.comparisons?.validatedEvents },
    { title: labels.myOpenActions, value: number(metrics.myOpenActions), help: labels.kpiMyOpenActionsDefinition, detail: periodLabel },
    { title: labels.overdueActions, value: number(metrics.overdueActions), help: labels.kpiOverdueActionsDefinition, detail: labels.kpiCurrentStock, attention: metrics.overdueActions > 0 },
  ];
  return <section className="space-y-3" aria-labelledby="safety-overview-heading" data-testid="safety-overview">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="safety-overview-heading" className="text-base font-bold text-slate-950">{copy.overview}</h2>
      <span className="flex items-center gap-1.5 text-xs text-slate-600"><Factory className="h-4 w-4" aria-hidden="true" />{copy.wholePlant} · {periodLabel}</span>
    </div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,155px),1fr))] gap-3">
      {cards.map(card => <article key={card.title} className={`app-card min-w-0 ${card.attention ? "border-amber-200 bg-amber-50" : ""}`}>
        <div className="flex min-h-10 items-start justify-between gap-2"><h3 className="text-sm font-medium text-slate-600">{card.title}</h3><HelpPopover title={card.title} body={card.help} buttonLabel={`${labels.help}: ${card.title}`} /></div>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{card.value}</p>
        {card.detail ? <p className="mt-2 text-xs leading-5 text-slate-600">{card.detail}</p> : null}
      </article>)}
    </div>
  </section>;
}
