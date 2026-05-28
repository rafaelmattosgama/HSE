"use client";

import { useRouter } from "next/navigation";
import type { N0MasterDataUi } from "@/lib/master-data-ui";

type PlantOption = {
  code: string;
  name: string;
  isActive: boolean;
};

type SettingsPlantSelectorProps = {
  plants: PlantOption[];
  selectedPlantCode?: string | null;
  labels: Pick<N0MasterDataUi, "selectedPlantTitle" | "inactive">;
};

export function SettingsPlantSelector({ plants, selectedPlantCode, labels }: SettingsPlantSelectorProps) {
  const router = useRouter();

  return (
    <label className="flex w-full flex-col gap-2 lg:max-w-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.selectedPlantTitle}</span>
      <select
        value={selectedPlantCode ?? ""}
        onChange={(event) => router.push(`/app/settings?plant=${encodeURIComponent(event.target.value)}`)}
        disabled={!plants.length}
        className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-100)]"
      >
        {plants.length ? (
          plants.map((plant) => (
            <option key={plant.code} value={plant.code}>
              {plant.name}
              {!plant.isActive ? ` (${labels.inactive})` : ""}
            </option>
          ))
        ) : (
          <option value="">-</option>
        )}
      </select>
    </label>
  );
}
