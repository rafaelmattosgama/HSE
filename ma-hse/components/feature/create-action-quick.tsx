"use client";

import { ActionCategory, ActionPriority, ActionSourceType } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const plant = pathname.split("/")[2];
  const text = labels ?? BASE_COMMUNICATION_UI.createActionQuick;
  const initialSourceType = lockedCommunicationId ? ActionSourceType.COMMUNICATION : ActionSourceType.MANUAL;
  const initialCommunicationValue = lockedCommunicationId ?? initialCommunicationId ?? "";

  const [sourceType, setSourceType] = useState<ActionSourceType>(initialSourceType);
  const [communicationId, setCommunicationId] = useState(initialCommunicationValue);
  const [category, setCategory] = useState<ActionCategory>(ActionCategory.CORRECTIVE);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>(ActionPriority.MEDIUM);
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function resetForm() {
    setSourceType(initialSourceType);
    setCommunicationId(initialCommunicationValue);
    setCategory(ActionCategory.CORRECTIVE);
    setTitle("");
    setDescription("");
    setOwnerUserId("");
    setPriority(ActionPriority.MEDIUM);
    setDueDate("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current || submitting || isRefreshing) return;

    submittingRef.current = true;
    setMessage("");
    setMessageIsError(false);
    setSubmitting(true);

    try {
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

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setMessageIsError(true);
        setMessage(json?.message ?? text.failedCreatingAction);
        return;
      }

      resetForm();
      setMessage(json.data?.idempotency?.reusedExistingAction ? text.existingActionReused : text.actionCreated);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessageIsError(true);
      setMessage(text.createActionStateUnknown);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
          disabled={submitting || isRefreshing}
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
          disabled={submitting || isRefreshing}
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
        <select value={category} onChange={(event) => setCategory(event.target.value as ActionCategory)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing}>
          <option value={ActionCategory.CORRECTIVE}>{text.categoryLabels.CORRECTIVE}</option>
          <option value={ActionCategory.PREVENTIVE}>{text.categoryLabels.PREVENTIVE}</option>
          <option value={ActionCategory.IMPROVEMENT}>{text.categoryLabels.IMPROVEMENT}</option>
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value as ActionPriority)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing}>
          <option value={ActionPriority.LOW}>{text.priorityLabels.LOW}</option>
          <option value={ActionPriority.MEDIUM}>{text.priorityLabels.MEDIUM}</option>
          <option value={ActionPriority.HIGH}>{text.priorityLabels.HIGH}</option>
        </select>
      </div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={text.title} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing} required />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={text.description} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing} required />
      <div className="grid gap-3 md:grid-cols-2">
        <select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing} required>
          <option value="">{text.owner}</option>
          {owners.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={submitting || isRefreshing} />
      </div>
      <Button size="sm" type="submit" disabled={submitting || isRefreshing}>
        {submitting ? text.creatingAction : text.createAction}
      </Button>
      {message ? <p className={`text-xs ${messageIsError ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}
    </form>
  );
}
