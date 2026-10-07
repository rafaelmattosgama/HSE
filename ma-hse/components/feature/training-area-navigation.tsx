import Link from "next/link";
import { GraduationCap, LayoutDashboard, ShieldCheck } from "lucide-react";
import type { TrainingUi } from "@/lib/training-ui";

export function TrainingAreaNavigation({ plant, area, ui }: { plant: string; area: string; ui: TrainingUi }) {
  const base = `/app/${plant}/competences`;
  return <nav aria-label={ui.module} className="flex w-fit max-w-full flex-wrap gap-1 self-start rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
    {[{ id: "overview", name: ui.overview, icon: LayoutDashboard, href: base }, { id: "training", name: ui.training, icon: GraduationCap, href: `${base}?area=training` }, { id: "competences", name: ui.competences, icon: ShieldCheck, href: `${base}?area=competences` }].map(item => <Link key={item.id} href={item.href} aria-current={area === item.id ? "page" : undefined} style={area === item.id ? { color: "var(--primary-foreground)" } : undefined} className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold ${area === item.id ? "bg-[var(--primary)] shadow-sm" : "text-slate-600 hover:bg-white"}`}>
      <item.icon className="h-4 w-4" aria-hidden="true" />{item.name}
    </Link>)}
  </nav>;
}
