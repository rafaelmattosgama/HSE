"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

const LANGUAGE_OPTIONS = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;

type PlantLanguageSettingsProps = {
  plantId: string;
  plantName: string;
  plantCode: string;
  timezone: string;
  defaultLanguage: string;
  labels?: N0MasterDataUi;
};

export function PlantLanguageSettings({
  plantId,
  plantName,
  plantCode,
  timezone,
  defaultLanguage,
  labels = getStaticN0MasterDataUi("en"),
}: PlantLanguageSettingsProps) {
  const [language, setLanguage] = useState(defaultLanguage);
  const [savedLanguage, setSavedLanguage] = useState(defaultLanguage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/corporate/plants", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantId,
          defaultLanguage: language,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.plantLanguageError);
      }

      setLanguage(json.data.plant.defaultLanguage);
      setSavedLanguage(json.data.plant.defaultLanguage);
      setMessage(formatMasterDataMessage(labels.plantLanguageSaved, { plant: plantName }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.plantLanguageError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.selectedPlantTitle}</h2>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {plantName} ({plantCode.toUpperCase()})
      </p>
      <p className="mt-1 text-sm text-slate-600">{timezone}</p>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {labels.defaultLanguage}
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          >
            {LANGUAGE_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" disabled={saving || language === savedLanguage} onClick={save}>
          {saving ? labels.saving : labels.save}
        </Button>
      </div>

      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
