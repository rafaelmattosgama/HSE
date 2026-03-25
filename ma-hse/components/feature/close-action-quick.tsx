"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CloseActionQuick() {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [actionId, setActionId] = useState("");
  const [comment, setComment] = useState("");
  const [fileKey, setFileKey] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(`/api/plants/${plant}/actions/${actionId}/close`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        closureComment: comment,
        evidence: [
          {
            fileKey,
            fileName: "evidence.txt",
            contentType: "text/plain",
          },
        ],
      }),
    });

    const json = await response.json();
    setMessage(json.ok ? "Action closed" : json.message ?? "Failed to close action");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Close action with evidence</h3>
      <input value={actionId} onChange={(event) => setActionId(event.target.value)} placeholder="Action ID" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Closure comment" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={fileKey} onChange={(event) => setFileKey(event.target.value)} placeholder="Evidence file key" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <Button size="sm" type="submit">Close Action</Button>
      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </form>
  );
}