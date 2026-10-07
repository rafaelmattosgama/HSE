"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Clock3, HelpCircle, ShieldCheck, XCircle } from "lucide-react";
import { AppKpiCard } from "@/components/ui/app-surface";
import { getCompetenceIndicators } from "@/lib/competence-indicators";
import type { CompetenceMatrixView } from "@/lib/services/competence-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

function IndicatorItem({ children, className, onClick }: { children: ReactNode; className: string; onClick?: () => void }) {
  return onClick ? <button type="button" className={className} onClick={onClick}>{children}</button> : <div className={className}>{children}</div>;
}

export function CompetenceIndicators({ matrix, labels, onState, onCompetence }: {
  matrix: CompetenceMatrixView; labels: CompetencesUiDictionary;
  onState?: (state: string, opts?: { mandatoryOnly: boolean }) => void; onCompetence?: (id: string) => void;
}) {
  const kpis = getCompetenceIndicators(matrix);
  const cards = [
    { state: "EXPIRED", tone: "danger", icon: XCircle, label: labels.kpiExpiredTitle, value: kpis.expired },
    { state: "EXPIRING", tone: "warning", icon: Clock3, label: labels.kpiExpiringTitle, value: kpis.expiring30 + kpis.expiring60 + kpis.expiring90, detail: `${labels.kpiExpiring30Label}: ${kpis.expiring30} · ${labels.kpiExpiring60Label}: ${kpis.expiring60} · ${labels.kpiExpiring90Label}: ${kpis.expiring90}` },
    { state: "AWAITING_ASSESSMENT", tone: "info", icon: HelpCircle, label: labels.kpiAwaitingAssessmentTitle, value: kpis.awaitingAssessment },
    { state: "AWAITING_AUTHORIZATION", tone: "info", icon: ShieldCheck, label: labels.kpiAwaitingAuthorizationTitle, value: kpis.awaitingAuthorization },
    { state: "MISSING", tone: "danger", icon: AlertTriangle, label: labels.kpiCriticalGapsTitle, value: kpis.criticalGaps, detail: labels.kpiCriticalGapsDetail },
  ] as const;
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 [&_.app-kpi-card]:h-full [&_.app-kpi-card]:min-w-0 [&_.app-kpi-card]:[overflow-wrap:anywhere]">
    {cards.map(card => <IndicatorItem key={card.state} className="min-w-0 text-left" onClick={onState ? () => onState(card.state, card.state === "MISSING" ? { mandatoryOnly: true } : undefined) : undefined}>
      <AppKpiCard tone={card.tone} icon={<card.icon className="h-5 w-5" aria-hidden="true" />} label={card.label} value={card.value} detail={"detail" in card ? card.detail : undefined} />
    </IndicatorItem>)}
    <AppKpiCard className="col-span-full" tone="brand" icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />} label={labels.kpiCoverageTitle}
      value={!kpis.coverage.length ? labels.kpiCoverageEmpty : <span className="sr-only">{labels.kpiCoverageTitle}</span>}
      detail={!kpis.coverage.length ? null : <div className="mt-1 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
        {kpis.coverage.map(row => <IndicatorItem key={row.typeId} onClick={onCompetence ? () => onCompetence(row.typeId) : undefined} className="flex min-w-0 flex-col items-start gap-1 rounded-lg border border-slate-200 p-3 text-left text-xs text-slate-600 hover:text-slate-900">
          <span className="w-full font-semibold [overflow-wrap:anywhere]">{row.name}</span><span className="w-full [overflow-wrap:anywhere]">{row.percentage === null ? "—" : labels.kpiCoverageBarLabel.replace("{percentage}", String(row.percentage)).replace("{required}", String(row.required))}</span>
        </IndicatorItem>)}
      </div>} />
  </div>;
}
