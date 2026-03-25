"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CreateActionQuick() {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(`/api/plants/${plant}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "MANUAL",
        category: "CORRECTIVE",
        priority,
        title,
        description,
        ownerUserId,
      }),
    });

    const json = await response.json();
    setMessage(json.ok ? "Action created" : json.message ?? "Failed creating action");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Quick action</h3>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <input value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} placeholder="Owner User ID" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="LOW">LOW</option>
        <option value="MEDIUM">MEDIUM</option>
        <option value="HIGH">HIGH</option>
      </select>
      <Button size="sm" type="submit">Create Action</Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}