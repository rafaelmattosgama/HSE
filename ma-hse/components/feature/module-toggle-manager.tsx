"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { MODULE_OPTIONS, type ModuleToggleKey, type ModuleToggleMap } from "@/lib/modules";

export function ModuleToggleManager({
  endpoint,
  title,
  description,
  saveLabel,
  savingLabel = "Saving...",
  successMessage = "Module settings saved.",
  errorMessage = "Failed to save module settings.",
  helpButtonLabel = "Help",
  initialModules,
  moduleLabels,
}: {
  endpoint: string;
  title: string;
  description: string;
  saveLabel: string;
  savingLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  helpButtonLabel?: string;
  initialModules: ModuleToggleMap;
  moduleLabels?: Partial<Record<ModuleToggleKey, string>>;
}) {
  const [modules, setModules] = useState<ModuleToggleMap>(initialModules);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveModules() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modules }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? errorMessage);
      }

      setModules(json.data.modules ?? modules);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <HelpPopover title={title} body={description} buttonLabel={helpButtonLabel} />
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MODULE_OPTIONS.map((module) => {
          const active = modules[module.key];

          return (
            <label
              key={module.key}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                active ? "border-teal-300 bg-teal-50 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <span className="font-medium">{moduleLabels?.[module.key] ?? module.label}</span>
              <input
                type="checkbox"
                checked={Boolean(active)}
                onChange={(event) =>
                  setModules((current) => ({
                    ...current,
                    [module.key]: event.target.checked,
                  }))
                }
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" onClick={saveModules} disabled={saving}>
          {saving ? savingLabel : saveLabel}
        </Button>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </div>
    </section>
  );
}
