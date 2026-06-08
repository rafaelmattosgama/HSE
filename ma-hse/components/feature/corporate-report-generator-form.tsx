"use client";

import { useState } from "react";

type PlantOption = {
  id: string;
  code: string;
  name: string;
};

type CorporateReportGeneratorFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  plants: PlantOption[];
};

export function CorporateReportGeneratorForm({ action, plants }: CorporateReportGeneratorFormProps) {
  const [scope, setScope] = useState<"GLOBAL" | "FACTORY">("GLOBAL");

  return (
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-6">
      <label className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report type</span>
        <select name="reportType" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" defaultValue="MONTHLY">
          <option value="WEEKLY_DIGEST">Weekly digest</option>
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report Scope</span>
        <select
          name="scope"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          value={scope}
          onChange={(event) => setScope(event.target.value as "GLOBAL" | "FACTORY")}
          required
        >
          <option value="GLOBAL">Global</option>
          <option value="FACTORY">Factory</option>
        </select>
      </label>

      {scope === "FACTORY" ? (
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Factory</span>
          <select name="factoryId" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" required>
            <option value="">Select factory</option>
            {plants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.code.toUpperCase()} - {plant.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period start</span>
        <input name="periodStart" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" required />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period end</span>
        <input name="periodEnd" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" required />
      </label>

      <div className="flex items-end">
        <button type="submit" className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90">
          Generate and share
        </button>
      </div>
    </form>
  );
}
