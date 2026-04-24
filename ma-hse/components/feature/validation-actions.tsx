"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ValidationActions({ communicationId }: { communicationId: string }) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [notes, setNotes] = useState("Reviewed by safety");
  const [message, setMessage] = useState("");

  async function submit(isValid: boolean) {
    setMessage("");

    const response = await fetch(`/api/plants/${plant}/communications/${communicationId}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isValid, notes }),
    });

    const json = await response.json();
    setMessage(json.ok ? "Validation saved" : json.message ?? "Validation failed");
  }

  return (
    <div className="space-y-2">
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => submit(true)} aria-label="Validate communication" title="Validate">
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => submit(false)} aria-label="Reject communication" title="Reject">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
