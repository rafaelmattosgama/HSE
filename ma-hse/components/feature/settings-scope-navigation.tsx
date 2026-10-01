"use client";

import Link from "next/link";
import { Factory, Settings2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { N0MasterDataUi } from "@/lib/master-data-ui";

export function SettingsScopeNavigation({ scope, labels }: { scope: "general" | "plant"; labels: N0MasterDataUi }) {
  const query = useSearchParams();
  return (
    <nav aria-label={labels.adminSettingsTitle} className="mt-5 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 sm:inline-flex">
      {(["general", "plant"] as const).map((key) => {
        const params = new URLSearchParams(query.toString());
        params.set("scope", key);
        const Icon = key === "general" ? Settings2 : Factory;
        return <Link key={key} href={`/app/settings?${params}`} aria-current={scope === key ? "page" : undefined}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${scope === key ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />{key === "general" ? labels.generalSettingsTitle : labels.plantSettingsTitle}
        </Link>;
      })}
    </nav>
  );
}
