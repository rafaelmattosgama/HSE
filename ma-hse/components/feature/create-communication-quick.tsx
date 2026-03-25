"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CreateCommunicationQuick({ riskThemeId }: { riskThemeId?: string }) {
  const pathname = usePathname();
  const [eventDatetime, setEventDatetime] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const plant = pathname.split("/")[2];

    const response = await fetch(`/api/plants/${plant}/communications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "UNSAFE_CONDITION",
        eventDatetime,
        reporterName,
        riskThemeId,
        description,
      }),
    });

    const json = await response.json();
    setLoading(false);

    setMessage(json.ok ? "Communication created" : json.message ?? "Error creating communication");

    if (json.ok) {
      setDescription("");
      setReporterName("");
      setEventDatetime("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Quick communication</h3>
      <input
        type="datetime-local"
        value={eventDatetime}
        onChange={(event) => setEventDatetime(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      <input
        value={reporterName}
        onChange={(event) => setReporterName(event.target.value)}
        placeholder="Reporter name"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Create"}
      </Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}