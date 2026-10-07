import { BookOpen, Clock3, Scale, ShieldCheck, Users } from "lucide-react";
import { AppKpiCard } from "@/components/ui/app-surface";
import { formatTrainingDuration, trainingIndicators, TRAINING_CATEGORY_LABELS, type TrainingMetricRow } from "@/lib/plant-training";
import type { TrainingUi } from "@/lib/training-ui";

export function TrainingIndicators({ rows, year, workerCount, ui, locale }: {
  rows: TrainingMetricRow[]; year: number; workerCount: number; ui: TrainingUi; locale: string;
}) {
  const stats = trainingIndicators(rows, year, workerCount);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3 [&_.app-kpi-card]:min-w-0 [&_.app-kpi-card]:[overflow-wrap:anywhere]">
    <AppKpiCard tone="brand" icon={<Clock3 className="h-5 w-5" />} label={`${ui.hours} · ${year}`} value={formatTrainingDuration(stats.minutes)} detail={<>
      <p>{ui.previous} ({year - 1}): {formatTrainingDuration(stats.previousMinutes)}</p>
      <p>{stats.changePercent === null ? ui.noComparison : `${ui.comparison}: ${stats.changePercent > 0 ? "+" : ""}${number.format(stats.changePercent)}%`}</p>
    </>} />
    <AppKpiCard tone="info" icon={<Users className="h-5 w-5" />} label={ui.perWorker} value={stats.hoursPerWorker === null ? ui.noData : <span data-no-translate>{number.format(stats.hoursPerWorker)} h</span>} detail={`${workerCount} ${ui.workers}`} />
    {(["LEGAL_REQUIREMENT", "IMPROVING_SAFETY", "SAFETY_CULTURE"] as const).map((type, i) => {
      const Icon = [Scale, ShieldCheck, BookOpen][i];
      return <AppKpiCard key={type} tone="success" icon={<Icon className="h-5 w-5" />} label={TRAINING_CATEGORY_LABELS[type]} value={stats.percentages[type] === null ? ui.noData : `${number.format(stats.percentages[type])}%`} detail={ui.share} />;
    })}
  </div>;
}
