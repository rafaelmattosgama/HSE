"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";

export function ValidationActions({
  plant,
  communicationId,
  labels,
  onRejectedHref,
}: {
  plant: string;
  communicationId: string;
  labels?: CommunicationUi["validationActions"];
  onRejectedHref?: string;
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.validationActions;
  const router = useRouter();

  const [notes, setNotes] = useState(() => text.defaultNotes);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(isValid: boolean) {
    if (!isValid && !window.confirm(text.confirmReject)) {
      return;
    }

    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/plants/${plant}/communications/${communicationId}/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isValid, notes }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        setMessage(
          json.message
            ?? (json.errorCode === "REPORTER_REVIEW_REQUIRED"
            ? text.reporterReviewRequired
            : json.errorCode === "CLASSIFICATION_REQUIRED"
              ? text.classificationRequired
              : text.failed),
        );
        return;
      }

      setMessage(isValid ? text.saved : text.rejectedDeleted);
      if (!isValid && onRejectedHref) {
        router.replace(onRejectedHref);
      } else {
        router.refresh();
      }
    } catch {
      setMessage(text.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => submit(true)} disabled={submitting} aria-label={text.validateCommunication} title={text.validate}>
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => submit(false)} disabled={submitting} aria-label={text.rejectCommunication} title={text.reject}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
