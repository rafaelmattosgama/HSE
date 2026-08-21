import type { ReactNode } from "react";
import { AlertTriangle, Bandage, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, Eye, Gauge, HeartPulse, Inbox, ShieldCheck, Target, Users } from "lucide-react";
import { AppPanel, AppSectionHeader } from "@/components/ui/app-surface";
import { HelpPopover } from "@/components/ui/help-popover";
import type { DashboardUiDictionary } from "@/lib/ui-language";
import type { SifPsifIndicatorBreakdown, SifPsifIndicatorCategory } from "@/lib/sif-psif-indicators";

type Tone = "default" | "brand" | "success" | "info" | "warning" | "danger" | "violet";

type KpiState = {
  label: string;
  tone: Tone;
};

type Metric = {
  title: string;
  value: number | string | null;
  unit?: string;
  period: string;
  definition: string;
  state: KpiState;
  icon: ReactNode;
  digits?: number;
  comparison?: string;
  detail?: string;
  emptyValueLabel?: string;
};

function formatMetricValue(value: Metric["value"], locale: string, digits = 0, noDataLabel = "No data") {
  if (value === null) return noDataLabel;
  if (typeof value === "string") return value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? 0 : undefined }).format(value);
}

function KpiCard({ metric, locale, noDataLabel }: { metric: Metric; locale: string; noDataLabel: string }) {
  const valueLabel = formatMetricValue(metric.value, locale, metric.digits, metric.emptyValueLabel ?? noDataLabel);

  return (
    <article className={`app-kpi-card app-kpi-card--${metric.state.tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <p className="app-kpi-card__label">{metric.title}</p>
            <HelpPopover title={metric.title} body={metric.definition} buttonLabel={`Definition: ${metric.title}`} />
          </div>
          <p className="app-kpi-card__value tabular-nums">
            {valueLabel}
            {metric.value !== null && metric.unit ? <span className="ml-1 text-sm font-bold text-slate-600">{metric.unit}</span> : null}
          </p>
        </div>
        <div className="app-kpi-card__icon" aria-hidden="true">{metric.icon}</div>
      </div>
      {metric.detail ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{metric.detail}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-600">
        <span>{metric.period}</span>
        <span aria-hidden="true">•</span>
        <span>{metric.state.label}</span>
        {metric.comparison ? <><span aria-hidden="true">•</span><span>{metric.comparison}</span></> : null}
      </div>
    </article>
  );
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function KpiGroup({
  id,
  title,
  description,
  children,
  helpLabel,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  helpLabel: string;
}) {
  return (
    <AppPanel aria-labelledby={id}>
      <AppSectionHeader
        eyebrow={title}
        title={<span id={id}>{title}</span>}
        actions={<HelpPopover title={title} body={description} buttonLabel={helpLabel} />}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </AppPanel>
  );
}

function BacklogInsight({
  total,
  trend,
  ageing,
  labels,
}: {
  total: number;
  trend: Array<{ label: string; value: number }>;
  ageing: { recent: number; aging: number; longRunning: number };
  labels: DashboardUiDictionary;
}) {
  const maxValue = Math.max(1, ...trend.map((entry) => entry.value));
  const ageGroups = [
    { label: labels.kpiAge0To30Days, value: ageing.recent },
    { label: labels.kpiAge31To60Days, value: ageing.aging },
    { label: labels.kpiAgeOver60Days, value: ageing.longRunning },
  ];

  return (
    <article className="app-card-muted space-y-4 p-4 sm:col-span-2 xl:col-span-4" aria-labelledby="backlog-insight-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="app-section-eyebrow">{labels.kpiBacklogEvolutionAgeing}</p>
          <h3 id="backlog-insight-heading" className="mt-1 text-base font-black text-slate-950">{labels.kpiBacklogTrend}: {total.toLocaleString()}</h3>
        </div>
        <HelpPopover title={labels.kpiBacklogEvolutionAgeing} body={labels.kpiBacklogEvolutionAgeingDefinition} buttonLabel={labels.help} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.kpiBacklogTrend}</p>
          {trend.length > 0 ? <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4" aria-label={labels.kpiBacklogTrend}>
            {trend.map((entry) => (
              <li key={entry.label} className="min-w-0">
                <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                  <div className="h-full rounded-full bg-[var(--brand-700)]" style={{ width: `${(entry.value / maxValue) * 100}%` }} />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600">{entry.label}</span>
                  <span className="font-black tabular-nums text-slate-950">{entry.value.toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ol> : <p className="app-empty mt-3">{labels.kpiNoData}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.kpiBacklogEvolutionAgeing}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {ageGroups.map((group) => (
              <div key={group.label} className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                <dt className="text-[11px] font-semibold leading-4 text-slate-600">{group.label}</dt>
                <dd className="mt-1 text-lg font-black tabular-nums text-slate-950">{group.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

export function SafetyDashboardKpiGroups({
  locale,
  periodLabel,
  labels,
  detailed,
  showPendingValidationKpi,
  canViewOpenCommunications,
  metrics,
}: {
  locale: string;
  periodLabel: string;
  labels: DashboardUiDictionary;
  detailed: boolean;
  showPendingValidationKpi: boolean;
  canViewOpenCommunications: boolean;
  metrics: {
    validatedEvents: number;
    injuries: number;
    daysLost: number;
    firstAids: number;
    frequencyRate: number | null;
    gravityRate: number | null;
    firstAidRate: number | null;
    nearMisses: number;
    unsafeActs: number;
    unsafeConditions: number;
    rootCauses: number;
    openActions: number;
    overdueActions: number;
    closedOnTimePercent: number | null;
    unsafeActsClosedPercent: number | null;
    unsafeConditionsClosedPercent: number | null;
    pendingValidation: number;
    openCommunications: number;
    myOpenActions: number;
    hoursWorked: number | null;
    comparisons?: Partial<Record<"validatedEvents" | "injuries" | "daysLost" | "firstAids" | "frequencyRate" | "gravityRate" | "firstAidRate" | "nearMisses" | "unsafeActs" | "unsafeConditions" | "unsafeActsClosedPercent" | "unsafeConditionsClosedPercent" | "rootCauses" | "hoursWorked", string>>;
    backlog?: {
      total: number;
      trend: Array<{ label: string; value: number }>;
      ageing: { recent: number; aging: number; longRunning: number };
    };
    sifPsif?: {
      plantName: string;
      current: SifPsifIndicatorBreakdown;
      comparisons: {
        overall?: string;
        byCategory?: Partial<Record<SifPsifIndicatorCategory, string>>;
      };
    };
  };
}) {
  const noData = labels.kpiNoData;
  const selectedPeriod = `${labels.period}: ${periodLabel}`;
  const currentStock = labels.kpiCurrentStock;
  const selectedPeriodCurrentStock = `${selectedPeriod} · ${currentStock}`;
  const safeState: KpiState = { label: labels.kpiOnTrack, tone: "success" };
  const attentionState: KpiState = { label: labels.kpiAttention, tone: "warning" };
  const criticalState: KpiState = { label: labels.kpiCritical, tone: "danger" };
  const informationState: KpiState = { label: labels.kpiInformational, tone: "info" };
  const noDataState: KpiState = { label: noData, tone: "default" };
  const notApplicableState: KpiState = { label: labels.kpiNotApplicable, tone: "default" };
  const sifPsifPeriod = metrics.sifPsif
    ? `${selectedPeriod} · ${labels.plant}: ${metrics.sifPsif.plantName}`
    : selectedPeriod;
  const sifPsifCategories: Array<{ key: SifPsifIndicatorCategory; title: string }> = [
    { key: "FIRST_AID", title: labels.pyramidFirstAid },
    { key: "NEAR_MISS", title: labels.pyramidNearMiss },
    { key: "ACCIDENT", title: labels.injuries },
  ];

  return (
    <div className="space-y-5" data-testid="safety-kpi-groups">
      <section aria-labelledby="safety-outcomes-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="app-section-eyebrow">{labels.kpiSafetyOutcomes}</p>
            <h2 id="safety-outcomes-heading" className="text-lg font-black text-slate-950">{labels.kpiSafetyOutcomes}</h2>
          </div>
          <HelpPopover title={labels.kpiSafetyOutcomes} body={labels.kpiSafetyOutcomesDescription} buttonLabel={labels.help} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard metric={{
            title: labels.validatedEvents,
            value: metrics.validatedEvents,
            unit: labels.kpiUnitEvents,
            period: selectedPeriod,
            definition: labels.kpiValidatedEventsDefinition,
            state: informationState,
            icon: <CheckCircle2 className="h-5 w-5" />,
            comparison: metrics.comparisons?.validatedEvents,
          }} locale={locale} noDataLabel={noData} />
          {detailed ? <KpiCard metric={{
            title: labels.injuries,
            value: metrics.injuries,
            unit: labels.kpiUnitEvents,
            period: selectedPeriod,
            definition: labels.kpiInjuriesDefinition,
            state: metrics.injuries === 0 ? safeState : attentionState,
            icon: <HeartPulse className="h-5 w-5" />,
            comparison: metrics.comparisons?.injuries,
          }} locale={locale} noDataLabel={noData} /> : null}
          {detailed ? <KpiCard metric={{
            title: labels.frequencyRate,
            value: metrics.frequencyRate,
            unit: labels.kpiUnitPerMillionHours,
            period: selectedPeriod,
            definition: labels.kpiFrequencyRateDefinition,
            state: metrics.frequencyRate === null ? notApplicableState : metrics.frequencyRate === 0 ? safeState : attentionState,
            icon: <Gauge className="h-5 w-5" />,
            digits: 2,
            comparison: metrics.comparisons?.frequencyRate,
            emptyValueLabel: labels.kpiNotApplicable,
          }} locale={locale} noDataLabel={noData} /> : null}
          {detailed ? <KpiCard metric={{
            title: labels.gravityRate,
            value: metrics.gravityRate,
            unit: labels.kpiUnitPerMillionHours,
            period: selectedPeriod,
            definition: labels.kpiGravityRateDefinition,
            state: metrics.gravityRate === null ? notApplicableState : metrics.gravityRate === 0 ? safeState : attentionState,
            icon: <Gauge className="h-5 w-5" />,
            digits: 2,
            comparison: metrics.comparisons?.gravityRate,
            emptyValueLabel: labels.kpiNotApplicable,
          }} locale={locale} noDataLabel={noData} /> : null}
          {detailed ? <KpiCard metric={{
            title: labels.kpiDaysLost,
            value: metrics.daysLost,
            unit: labels.kpiUnitDays,
            period: selectedPeriod,
            definition: labels.kpiDaysLostDefinition,
            state: metrics.daysLost === 0 ? safeState : attentionState,
            icon: <CalendarDays className="h-5 w-5" />,
            comparison: metrics.comparisons?.daysLost,
          }} locale={locale} noDataLabel={noData} /> : null}
          {detailed ? <KpiCard metric={{
            title: labels.kpiFirstAids,
            value: metrics.firstAids,
            unit: labels.kpiUnitEvents,
            period: selectedPeriod,
            definition: labels.kpiFirstAidsDefinition,
            state: metrics.firstAids === 0 ? safeState : attentionState,
            icon: <Bandage className="h-5 w-5" />,
            comparison: metrics.comparisons?.firstAids,
          }} locale={locale} noDataLabel={noData} /> : null}
          {detailed ? <KpiCard metric={{
            title: labels.kpiFirstAidsRate,
            value: metrics.firstAidRate,
            unit: labels.kpiUnitPerMillionHours,
            period: selectedPeriod,
            definition: labels.kpiFirstAidsRateDefinition,
            state: metrics.firstAidRate === null ? notApplicableState : metrics.firstAidRate === 0 ? safeState : attentionState,
            icon: <Gauge className="h-5 w-5" />,
            digits: 2,
            comparison: metrics.comparisons?.firstAidRate,
            emptyValueLabel: labels.kpiNotApplicable,
          }} locale={locale} noDataLabel={noData} /> : null}
        </div>
      </section>

      {metrics.sifPsif ? <KpiGroup
        id="sif-psif-indicators-heading"
        title={labels.kpiSifPsifIndicators}
        description={labels.kpiSifPsifIndicatorsDescription}
        helpLabel={labels.help}
      >
        <KpiCard metric={{
          title: labels.kpiSifPsifIncidents,
          value: metrics.sifPsif.current.overall.sifOrPsifPercent,
          unit: "%",
          period: sifPsifPeriod,
          definition: labels.kpiSifPsifIncidentsDefinition,
          detail: formatTemplate(labels.kpiSifPsifEligibleIncidentDetail, {
            numerator: metrics.sifPsif.current.overall.sifOrPsif,
            denominator: metrics.sifPsif.current.overall.total,
          }),
          state: metrics.sifPsif.current.overall.total === 0
            ? noDataState
            : metrics.sifPsif.current.overall.sifOrPsif === 0 ? safeState : attentionState,
          icon: <ShieldCheck className="h-5 w-5" />,
          digits: 1,
          comparison: metrics.sifPsif.comparisons.overall,
        }} locale={locale} noDataLabel={noData} />
        {sifPsifCategories.map((category) => {
          const summary = metrics.sifPsif!.current.byCategory[category.key];
          const detail = `${labels.kpiSif}: ${summary.sif} (${summary.sifPercent === null ? "—" : `${formatPercent(summary.sifPercent, locale)}%`}) · ${labels.kpiPsif}: ${summary.psif} (${summary.psifPercent === null ? "—" : `${formatPercent(summary.psifPercent, locale)}%`}) · ${formatTemplate(labels.kpiSifPsifEligibleIncidentDetail, { numerator: summary.sifOrPsif, denominator: summary.total })}`;

          return <KpiCard
            key={category.key}
            metric={{
              title: `${category.title}: SIF / PSIF`,
              value: summary.sifOrPsifPercent,
              unit: "%",
              period: sifPsifPeriod,
              definition: formatTemplate(labels.kpiSifPsifCategoryDefinition, { category: category.title }),
              detail,
              state: summary.total === 0 ? noDataState : summary.sifOrPsif === 0 ? safeState : attentionState,
              icon: <Target className="h-5 w-5" />,
              digits: 1,
              comparison: metrics.sifPsif!.comparisons.byCategory?.[category.key],
            }}
            locale={locale}
            noDataLabel={noData}
          />;
        })}
      </KpiGroup> : null}

      {detailed ? <KpiGroup id="leading-indicators-heading" title={labels.kpiLeadingIndicators} description={labels.kpiLeadingIndicatorsDescription} helpLabel={labels.help}>
        <KpiCard metric={{ title: labels.nearMisses, value: metrics.nearMisses, unit: labels.kpiUnitEvents, period: selectedPeriod, definition: labels.kpiNearMissesDefinition, state: informationState, icon: <Eye className="h-5 w-5" />, comparison: metrics.comparisons?.nearMisses }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.pyramidUnsafeAct, value: metrics.unsafeActs, unit: labels.kpiUnitEvents, period: selectedPeriod, definition: labels.kpiUnsafeActDefinition, state: informationState, icon: <ShieldCheck className="h-5 w-5" />, comparison: metrics.comparisons?.unsafeActs }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.pyramidUnsafeCondition, value: metrics.unsafeConditions, unit: labels.kpiUnitEvents, period: selectedPeriod, definition: labels.kpiUnsafeConditionDefinition, state: informationState, icon: <AlertTriangle className="h-5 w-5" />, comparison: metrics.comparisons?.unsafeConditions }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.sewoRootCauses, value: metrics.rootCauses, unit: labels.kpiUnitCauses, period: selectedPeriod, definition: labels.kpiRootCausesDefinition, state: informationState, icon: <Target className="h-5 w-5" />, comparison: metrics.comparisons?.rootCauses }} locale={locale} noDataLabel={noData} />
      </KpiGroup> : null}

      <KpiGroup id="exposure-scope-heading" title={labels.kpiExposureScope} description={labels.kpiExposureScopeDescription} helpLabel={labels.help}>
        <KpiCard metric={{ title: labels.hoursWorked, value: metrics.hoursWorked, unit: labels.kpiUnitHours, period: selectedPeriod, definition: labels.kpiHoursWorkedDefinition, state: metrics.hoursWorked === null ? noDataState : informationState, icon: <Clock3 className="h-5 w-5" />, digits: 2, comparison: metrics.comparisons?.hoursWorked }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.plants, value: 1, unit: labels.kpiUnitPlants, period: currentStock, definition: labels.kpiPlantsDefinition, state: informationState, icon: <Users className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.kpiEffectivePeriod, value: periodLabel, period: labels.kpiAppliedFilter, definition: labels.kpiEffectivePeriodDefinition, state: informationState, icon: <Clock3 className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} />
      </KpiGroup>

      <KpiGroup id="actions-compliance-heading" title={labels.kpiActionsCompliance} description={labels.kpiActionsComplianceDescription} helpLabel={labels.help}>
        <KpiCard metric={{ title: labels.myOpenActions, value: metrics.myOpenActions, unit: labels.kpiUnitActions, period: selectedPeriod, definition: labels.kpiMyOpenActionsDefinition, state: metrics.myOpenActions === 0 ? safeState : attentionState, icon: <ClipboardCheck className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} />
        <KpiCard metric={{ title: labels.overdueActions, value: metrics.overdueActions, unit: labels.kpiUnitActions, period: currentStock, definition: labels.kpiOverdueActionsDefinition, state: metrics.overdueActions === 0 ? safeState : criticalState, icon: <AlertTriangle className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} />
        {detailed ? <KpiCard metric={{ title: labels.openActions, value: metrics.openActions, unit: labels.kpiUnitActions, period: selectedPeriod, definition: labels.kpiOpenActionsDefinition, state: metrics.openActions === 0 ? safeState : attentionState, icon: <ClipboardCheck className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} /> : null}
        {detailed ? <KpiCard metric={{ title: labels.kpiActionsClosedOnTime, value: metrics.closedOnTimePercent, unit: "%", period: selectedPeriod, definition: labels.kpiActionsClosedOnTimeDefinition, state: metrics.closedOnTimePercent === null ? notApplicableState : metrics.closedOnTimePercent >= 90 ? safeState : attentionState, icon: <Clock3 className="h-5 w-5" />, digits: 1, emptyValueLabel: labels.kpiNotApplicable }} locale={locale} noDataLabel={noData} /> : null}
        {detailed ? <KpiCard metric={{ title: labels.kpiUnsafeActsClosed, value: metrics.unsafeActsClosedPercent, unit: "%", period: selectedPeriodCurrentStock, definition: labels.kpiUnsafeActsClosedDefinition, state: metrics.unsafeActsClosedPercent === null ? notApplicableState : metrics.unsafeActsClosedPercent >= 90 ? safeState : attentionState, icon: <ShieldCheck className="h-5 w-5" />, digits: 1, comparison: metrics.comparisons?.unsafeActsClosedPercent, emptyValueLabel: labels.kpiNotApplicable }} locale={locale} noDataLabel={noData} /> : null}
        {detailed ? <KpiCard metric={{ title: labels.kpiUnsafeConditionsClosed, value: metrics.unsafeConditionsClosedPercent, unit: "%", period: selectedPeriodCurrentStock, definition: labels.kpiUnsafeConditionsClosedDefinition, state: metrics.unsafeConditionsClosedPercent === null ? notApplicableState : metrics.unsafeConditionsClosedPercent >= 90 ? safeState : attentionState, icon: <ShieldCheck className="h-5 w-5" />, digits: 1, comparison: metrics.comparisons?.unsafeConditionsClosedPercent, emptyValueLabel: labels.kpiNotApplicable }} locale={locale} noDataLabel={noData} /> : null}
        {showPendingValidationKpi ? <KpiCard metric={{ title: labels.pendingValidation, value: metrics.pendingValidation, unit: labels.kpiUnitEvents, period: currentStock, definition: labels.kpiPendingValidationDefinition, state: metrics.pendingValidation === 0 ? safeState : attentionState, icon: <ClipboardCheck className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} /> : null}
        {canViewOpenCommunications ? <KpiCard metric={{ title: labels.openCommunications, value: metrics.openCommunications, unit: labels.kpiUnitEvents, period: currentStock, definition: labels.kpiOpenCommunicationsDefinition, state: metrics.openCommunications === 0 ? safeState : informationState, icon: <Inbox className="h-5 w-5" /> }} locale={locale} noDataLabel={noData} /> : null}
        {detailed && metrics.backlog ? <BacklogInsight {...metrics.backlog} labels={labels} /> : null}
      </KpiGroup>
    </div>
  );
}
