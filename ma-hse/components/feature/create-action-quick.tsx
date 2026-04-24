"use client";

import { ActionCategory, ActionPriority, ActionSourceType } from "@prisma/client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type Option = {
  id: string;
  label: string;
};

export function CreateActionQuick({
  owners,
  communicationOptions,
  initialCommunicationId,
  lockedCommunicationId,
  lockedCommunicationLabel,
}: {
  owners: Option[];
  communicationOptions: Option[];
  initialCommunicationId?: string;
  lockedCommunicationId?: string;
  lockedCommunicationLabel?: string;
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [sourceType, setSourceType] = useState<ActionSourceType>(
    lockedCommunicationId ? ActionSourceType.COMMUNICATION : ActionSourceType.MANUAL,
  );
  const [communicationId, setCommunicationId] = useState(lockedCommunicationId ?? initialCommunicationId ?? "");
  const [category, setCategory] = useState<ActionCategory>(ActionCategory.CORRECTIVE);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>(ActionPriority.MEDIUM);
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(`/api/plants/${plant}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType,
        communicationId: sourceType === ActionSourceType.COMMUNICATION ? communicationId : undefined,
        category,
        priority,
        title,
        description,
        ownerUserId,
        dueDate: dueDate || undefined,
      }),
    });

    const json = await response.json();
    setMessage(json.ok ? "Action created" : json.message ?? "Failed creating action");
    if (json.ok) {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        {lockedCommunicationId ? "New linked action" : "New action"}
      </h3>
      {!lockedCommunicationId ? (
        <select
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value as ActionSourceType)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={ActionSourceType.MANUAL}>Manual action</option>
          <option value={ActionSourceType.COMMUNICATION}>Linked to communication</option>
        </select>
      ) : null}
      {lockedCommunicationId ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Linked communication: {lockedCommunicationLabel ?? lockedCommunicationId}
        </div>
      ) : sourceType === ActionSourceType.COMMUNICATION ? (
        <select
          value={communicationId}
          onChange={(event) => setCommunicationId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        >
          <option value="">Select communication</option>
          {communicationOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          This action will be created without links to communication, S-EWO or SMAT.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <select value={category} onChange={(event) => setCategory(event.target.value as ActionCategory)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value={ActionCategory.CORRECTIVE}>Corrective</option>
          <option value={ActionCategory.PREVENTIVE}>Preventive</option>
          <option value={ActionCategory.IMPROVEMENT}>Improvement</option>
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value as ActionPriority)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value={ActionPriority.LOW}>Low</option>
          <option value={ActionPriority.MEDIUM}>Medium</option>
          <option value={ActionPriority.HIGH}>High</option>
        </select>
      </div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <div className="grid gap-3 md:grid-cols-2">
        <select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">Owner</option>
          {owners.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <Button size="sm" type="submit">Create Action</Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}
