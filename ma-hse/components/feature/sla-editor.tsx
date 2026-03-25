"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SlaEditor({
  initial,
}: {
  initial: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  };
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
    setMessage(json.ok ? "SLA saved" : json.message ?? "Error saving SLA");
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">SLA by Priority (days)</h3>
      <div className="grid grid-cols-3 gap-2">
        <input type="number" value={low} onChange={(event) => setLow(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" value={medium} onChange={(event) => setMedium(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" value={high} onChange={(event) => setHigh(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <Button size="sm" onClick={save}>Save SLA</Button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </div>
  );
}