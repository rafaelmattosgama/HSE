import { getServerUiLocale } from "@/lib/server-ui-language";
import { getUiDictionary } from "@/lib/ui-language";

export default async function CorporateLoading() {
  const text = getUiDictionary(await getServerUiLocale()).groupSafety;
  return <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:max-w-none" role="status" aria-busy="true" aria-label={text.loading}>
    <p className="text-sm text-slate-600">{text.loading}</p>
    <div className="app-hero h-32 animate-pulse rounded-2xl" /><div className="app-panel h-28 animate-pulse rounded-xl" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="app-kpi-card h-40 animate-pulse" />)}</div>
  </div>;
}
