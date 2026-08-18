export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading safety dashboard">
      <div className="app-hero h-28 animate-pulse rounded-2xl" />
      <div className="app-panel h-28 animate-pulse rounded-2xl" />
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="app-kpi-card h-40 animate-pulse" />)}
      </div>
    </div>
  );
}
