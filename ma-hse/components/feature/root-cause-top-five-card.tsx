import { AppCard, AppSectionHeader } from "@/components/ui/app-surface";

type RootCauseTopEntry = {
  label: string;
  count: number;
  percentage: number;
};

export function RootCauseTopFiveCard({
  title,
  entries,
  total,
  noDataLabel,
  totalLabel,
  className = "",
}: {
  title: string;
  entries: RootCauseTopEntry[];
  total: number;
  noDataLabel: string;
  totalLabel: string;
  className?: string;
}) {
  return (
    <AppCard className={className}>
      <AppSectionHeader
        eyebrow={title}
        actions={<span className="app-chip h-8 text-xs">{totalLabel}: {total.toLocaleString()}</span>}
      />

      {entries.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {entries.map((entry, index) => (
            <li key={entry.label} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_80px] sm:items-center">
              <span className="flex min-w-0 items-start gap-2 text-slate-700">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500">
                  {index + 1}
                </span>
                <span className="min-w-0 break-words">{entry.label}</span>
              </span>
              <span className="text-right font-semibold text-slate-900">{entry.percentage.toFixed(1)}%</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="app-empty mt-3">{noDataLabel}</p>
      )}
    </AppCard>
  );
}
