"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CreateSewoQuick({
  causeCatalogVersionId,
  defaultCauseItemId,
}: {
  causeCatalogVersionId?: string;
  defaultCauseItemId?: string;
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [communicationId, setCommunicationId] = useState("");
  const [eventClassification, setEventClassification] = useState("Near miss RCA");
  const [whatText, setWhatText] = useState("");
  const [whereText, setWhereText] = useState("");
  const [whoText, setWhoText] = useState("");
  const [howText, setHowText] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!causeCatalogVersionId || !defaultCauseItemId) {
      setMessage("No cause catalog available");
      return;
    }

    const response = await fetch(`/api/plants/${plant}/sewo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        communicationId,
        eventClassification,
        analysisDate: new Date().toISOString(),
        whatText,
        whereText,
        whoText,
        usualWorkYesNo: true,
        howText,
        immediateCorrectiveActionText: immediateAction,
        causeCatalogVersionId,
        causeSelections: [
          {
            causeItemId: defaultCauseItemId,
            selected: true,
            isRootCause: true,
            comment: "MVP quick selection",
          },
        ],
      }),
    });

    const json = await response.json();
    setMessage(json.ok ? "S-EWO created" : json.message ?? "Failed to create S-EWO");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Quick S-EWO create</h3>
      <input value={communicationId} onChange={(event) => setCommunicationId(event.target.value)} placeholder="Communication ID" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={eventClassification} onChange={(event) => setEventClassification(event.target.value)} placeholder="Event classification" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={whatText} onChange={(event) => setWhatText(event.target.value)} placeholder="What" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={whereText} onChange={(event) => setWhereText(event.target.value)} placeholder="Where" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={whoText} onChange={(event) => setWhoText(event.target.value)} placeholder="Who" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={howText} onChange={(event) => setHowText(event.target.value)} placeholder="How" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={immediateAction} onChange={(event) => setImmediateAction(event.target.value)} placeholder="Immediate corrective action" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <Button size="sm" type="submit">Create S-EWO</Button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </form>
  );
}
