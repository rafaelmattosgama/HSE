"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";

type RepeatabilityAlertEditorProps = {
  endpoint: string;
  title: string;
  description: string;
  initial: {
    workerWeeklyLevel1Enabled: boolean;
    workerWeeklyLevel1Threshold: number;
    workerWeeklyLevel2Enabled: boolean;
    workerWeeklyLevel2Threshold: number;
    workstationNearMissWeeklyEnabled: boolean;
    workstationNearMissWeeklyThreshold: number;
  };
  labels?: DashboardUiDictionary;
};

export function RepeatabilityAlertEditor({
  endpoint,
  title,
  description,
  initial,
  labels = getUiDictionary("en").dashboard,
}: RepeatabilityAlertEditorProps) {
  const text = labels;
  const [workerWeeklyLevel1Enabled, setWorkerWeeklyLevel1Enabled] = useState(initial.workerWeeklyLevel1Enabled);
  const [workerWeeklyLevel1Threshold, setWorkerWeeklyLevel1Threshold] = useState(initial.workerWeeklyLevel1Threshold);
  const [workerWeeklyLevel2Enabled, setWorkerWeeklyLevel2Enabled] = useState(initial.workerWeeklyLevel2Enabled);
  const [workerWeeklyLevel2Threshold, setWorkerWeeklyLevel2Threshold] = useState(initial.workerWeeklyLevel2Threshold);
  const [workstationNearMissWeeklyEnabled, setWorkstationNearMissWeeklyEnabled] = useState(initial.workstationNearMissWeeklyEnabled);
  const [workstationNearMissWeeklyThreshold, setWorkstationNearMissWeeklyThreshold] = useState(initial.workstationNearMissWeeklyThreshold);
  const [message, setMessage] = useState("");

  async function save() {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workerWeeklyLevel1Enabled,
        workerWeeklyLevel1Threshold,
        workerWeeklyLevel2Enabled,
        workerWeeklyLevel2Threshold,
        workstationNearMissWeeklyEnabled,
        workstationNearMissWeeklyThreshold,
      }),
    });

    const json = await response.json();
    setMessage(json.ok ? text.repeatabilityAlertsSaved : json.message ?? text.errorSavingRepeatabilityAlerts);
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <HelpPopover title={title} body={description} buttonLabel={text.help} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="rounded-lg border border-slate-200 p-3 text-sm">
          <span className="font-semibold text-slate-900">{text.workerWeeklyRecurrenceLevel1}</span>
          <span className="mt-1 block text-slate-600">{text.workerWeeklyRecurrenceLevel1Description}</span>
          <input type="number" min="1" value={workerWeeklyLevel1Threshold} onChange={(event) => setWorkerWeeklyLevel1Threshold(Number(event.target.value))} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2" />
          <label className="mt-3 flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={workerWeeklyLevel1Enabled} onChange={(event) => setWorkerWeeklyLevel1Enabled(event.target.checked)} />
            {text.enabled}
          </label>
        </label>

        <label className="rounded-lg border border-slate-200 p-3 text-sm">
          <span className="font-semibold text-slate-900">{text.workerWeeklyRecurrenceLevel2}</span>
          <span className="mt-1 block text-slate-600">{text.workerWeeklyRecurrenceLevel2Description}</span>
          <input type="number" min="1" value={workerWeeklyLevel2Threshold} onChange={(event) => setWorkerWeeklyLevel2Threshold(Number(event.target.value))} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2" />
          <label className="mt-3 flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={workerWeeklyLevel2Enabled} onChange={(event) => setWorkerWeeklyLevel2Enabled(event.target.checked)} />
            {text.enabled}
          </label>
        </label>

        <label className="rounded-lg border border-slate-200 p-3 text-sm">
          <span className="font-semibold text-slate-900">{text.workstationNearMissRecurrence}</span>
          <span className="mt-1 block text-slate-600">{text.workstationNearMissRecurrenceDescription}</span>
          <input type="number" min="1" value={workstationNearMissWeeklyThreshold} onChange={(event) => setWorkstationNearMissWeeklyThreshold(Number(event.target.value))} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2" />
          <label className="mt-3 flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={workstationNearMissWeeklyEnabled} onChange={(event) => setWorkstationNearMissWeeklyEnabled(event.target.checked)} />
            {text.enabled}
          </label>
        </label>
      </div>

      <Button size="sm" type="button" onClick={save}>{text.saveRepeatabilityAlerts}</Button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </section>
  );
}
