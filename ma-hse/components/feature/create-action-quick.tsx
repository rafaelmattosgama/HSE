"use client";

import { ActionCategory, ActionPriority, ActionSourceType } from "@prisma/client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";

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
  labels,
}: {
  owners: Option[];
  communicationOptions: Option[];
  initialCommunicationId?: string;
  lockedCommunicationId?: string;
  lockedCommunicationLabel?: string;
  labels?: CommunicationUi["createActionQuick"];
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const text = labels ?? BASE_COMMUNICATION_UI.createActionQuick;

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
    setMessage(json.ok ? text.actionCreated : text.failedCreatingAction);
    if (json.ok) {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        {lockedCommunicationId ? text.newLinkedAction : text.newAction}
      </h3>
      {!lockedCommunicationId ? (
        <select
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value as ActionSourceType)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={ActionSourceType.MANUAL}>{text.manualAction}</option>
          <option value={ActionSourceType.COMMUNICATION}>{text.linkedToCommunication}</option>
        </select>
      ) : null}
      {lockedCommunicationId ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {text.linkedCommunication}: {lockedCommunicationLabel ?? lockedCommunicationId}
        </div>
      ) : sourceType === ActionSourceType.COMMUNICATION ? (
        <select
          value={communicationId}
          onChange={(event) => setCommunicationId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        >
          <option value="">{text.selectCommunication}</option>
          {communicationOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {text.noLinkMessage}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <select value={category} onChange={(event) => setCategory(event.target.value as ActionCategory)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value={ActionCategory.CORRECTIVE}>{text.categoryLabels.CORRECTIVE}</option>
          <option value={ActionCategory.PREVENTIVE}>{text.categoryLabels.PREVENTIVE}</option>
          <option value={ActionCategory.IMPROVEMENT}>{text.categoryLabels.IMPROVEMENT}</option>
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value as ActionPriority)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value={ActionPriority.LOW}>{text.priorityLabels.LOW}</option>
          <option value={ActionPriority.MEDIUM}>{text.priorityLabels.MEDIUM}</option>
          <option value={ActionPriority.HIGH}>{text.priorityLabels.HIGH}</option>
        </select>
      </div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={text.title} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={text.description} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <div className="grid gap-3 md:grid-cols-2">
        <select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.owner}</option>
          {owners.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <Button size="sm" type="submit">{text.createAction}</Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}
