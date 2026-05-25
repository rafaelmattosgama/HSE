"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

export function SlaEditor({
  initial,
  labels = getStaticN0MasterDataUi("en"),
}: {
  initial: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
  labels?: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [low, setLow] = useState(initial.LOW);
  const [medium, setMedium] = useState(initial.MEDIUM);
  const [high, setHigh] = useState(initial.HIGH);
  const [message, setMessage] = useState("");

  async function save() {
    const response = await fetch(`/api/plants/${plant}/admin/sla`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ LOW: low, MEDIUM: medium, HIGH: high }),
    });

    const json = await response.json();
    setMessage(json.ok ? labels.sla.saved : json.message ?? labels.sla.error);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{labels.sla.title}</h3>
        <HelpPopover title={labels.sla.title} body={labels.sla.help} buttonLabel={labels.helpButton} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="number" aria-label={labels.sla.low} title={labels.sla.low} value={low} onChange={(event) => setLow(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" aria-label={labels.sla.medium} title={labels.sla.medium} value={medium} onChange={(event) => setMedium(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" aria-label={labels.sla.high} title={labels.sla.high} value={high} onChange={(event) => setHigh(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <Button size="sm" onClick={save}>{labels.sla.save}</Button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </div>
  );
}
