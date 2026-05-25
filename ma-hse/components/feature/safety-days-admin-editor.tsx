"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

export function SafetyDaysAdminEditor({
  initialManualLastAccidentDate,
  initialHistoricalRecordDays,
  initialHistoricalRecordStartDate,
  labels = getStaticN0MasterDataUi("en"),
}: {
  initialManualLastAccidentDate: string | null;
  initialHistoricalRecordDays: number | null;
  initialHistoricalRecordStartDate: string | null;
  labels?: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const [manualLastAccidentDate, setManualLastAccidentDate] = useState(initialManualLastAccidentDate ?? "");
  const [historicalRecordDays, setHistoricalRecordDays] = useState(initialHistoricalRecordDays?.toString() ?? "");
  const [historicalRecordStartDate, setHistoricalRecordStartDate] = useState(initialHistoricalRecordStartDate ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/safety-days`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manualLastAccidentDate: manualLastAccidentDate || null,
          historicalRecordDays: historicalRecordDays.trim() ? Number(historicalRecordDays) : null,
          historicalRecordStartDate: historicalRecordStartDate || null,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.safetyDays.error);
      }

      setMessage(labels.safetyDays.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.safetyDays.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{labels.safetyDays.title}</h3>
            <HelpPopover title={labels.safetyDays.title} body={labels.safetyDays.help} buttonLabel={labels.helpButton} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.safetyDays.lastAccidentDate}</span>
          <input
            type="date"
            value={manualLastAccidentDate}
            onChange={(event) => setManualLastAccidentDate(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.safetyDays.historicalRecordDays}</span>
          <input
            type="number"
            min="0"
            step="1"
            value={historicalRecordDays}
            onChange={(event) => setHistoricalRecordDays(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="0"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.safetyDays.recordStartDate}</span>
          <input
            type="date"
            value={historicalRecordStartDate}
            onChange={(event) => setHistoricalRecordStartDate(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? labels.saving : labels.safetyDays.saveSettings}
        </Button>
      </div>

      {message ? <p className="mt-3 text-xs text-slate-700">{message}</p> : null}
    </section>
  );
}
