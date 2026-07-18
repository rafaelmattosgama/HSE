"use client";

import { Building2, ChevronsUpDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ALL_PLANTS_SCOPE, LAST_PLANT_COOKIE } from "@/lib/plant-scope";

type PlantOption = {
  code: string;
  name: string;
};

function getCurrentModule(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments[2] ?? "dashboards";
}

function buildTargetPath(pathname: string, nextPlant: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") return `/app/${nextPlant}/dashboards`;

  const moduleName = segments[2] ?? "dashboards";
  if (nextPlant === ALL_PLANTS_SCOPE && moduleName === "admin") {
    return `/app/${nextPlant}/communications`;
  }

  if (segments.length > 3) {
    return `/app/${nextPlant}/${moduleName}`;
  }

  segments[1] = nextPlant;
  return `/${segments.join("/")}`;
}

function rememberPlant(plant: string) {
  document.cookie = `${LAST_PLANT_COOKIE}=${encodeURIComponent(plant)}; path=/; max-age=31536000; samesite=lax`;
}

export function PlantSwitcher({
  currentPlant,
  plants,
  allowAllPlants,
}: {
  currentPlant: string;
  plants: PlantOption[];
  allowAllPlants: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentModule = getCurrentModule(pathname);
  const selectedPlant = plants.find((plant) => plant.code === currentPlant);
  const currentLabel =
    currentPlant === ALL_PLANTS_SCOPE
      ? "Todas as plantas"
      : selectedPlant
        ? `${selectedPlant.code.toUpperCase()} - ${selectedPlant.name}`
        : currentPlant.toUpperCase();

  const canUseAllPlants = allowAllPlants && currentModule !== "admin" && plants.length > 1;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3" data-onboarding="plant-switcher">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Building2 className="h-3.5 w-3.5" />
        <span>Planta selecionada</span>
      </div>
      <div className="relative">
        <select
          value={currentPlant}
          onChange={(event) => {
            const nextPlant = event.target.value;
            rememberPlant(nextPlant);
            router.push(buildTargetPath(pathname, nextPlant));
            router.refresh();
          }}
          className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-semibold text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          aria-label="Selecionar planta"
        >
          {canUseAllPlants ? <option value={ALL_PLANTS_SCOPE}>Todas as plantas</option> : null}
          {plants.map((plant) => (
            <option key={plant.code} value={plant.code}>
              {plant.code.toUpperCase()} - {plant.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 truncate text-xs font-medium text-teal-800">{currentLabel}</p>
      {currentModule === "admin" ? (
        <p className="mt-1 text-xs text-slate-500">Admin requer uma planta especifica.</p>
      ) : null}
    </div>
  );
}
