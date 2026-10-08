"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseApiResponse, uploadAttachment } from "@/lib/client-api";

type FollowUpAttachment = { id: string; fileName: string };
type FollowUpEvent = {
  id: string;
  kind: "CREATED" | "COMMENT" | "DETAILS_CHANGED" | "STATUS_CHANGED" | "CLOSED" | "REOPENED";
  content: string;
  statusFrom: string | null;
  statusTo: string | null;
  createdAt: string;
  createdByName: string | null;
  attachments: FollowUpAttachment[];
};

type FollowUpLabels = {
  followUpTitle: string;
  addUpdateTitle: string;
  commentLabel: string;
  commentPlaceholder: string;
  evidenceLabel: string;
  addUpdate: string;
  postingUpdate: string;
  noUpdates: string;
  closedMessage: string;
  closeTitle: string;
  closureCommentPlaceholder: string;
  closeDate: string;
  closeButton: string;
  closing: string;
  timelineCreated: string;
  timelineComment: string;
  timelineDetailsChanged: string;
  timelineStatusChanged: string;
  timelineClosed: string;
  timelineReopened: string;
  by: string;
  viewEvidence: string;
  updateFailed: string;
  closeFailed: string;
  closureCommentRequired: string;
  selectClosureDate: string;
  statusLabels: { OPEN: string; ONGOING: string; CLOSED: string };
};

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function ActionFollowUp({
  plant,
  actionId,
  status,
  updates,
  canAddUpdate,
  canClose,
  labels,
}: {
  plant: string;
  actionId: string;
  status: string;
  updates: FollowUpEvent[];
  canAddUpdate: boolean;
  canClose: boolean;
  labels: FollowUpLabels;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [closureComment, setClosureComment] = useState("");
  const [closedAt, setClosedAt] = useState(todayDateInputValue());
  const [closureFiles, setClosureFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"update" | "close" | null>(null);
  const [error, setError] = useState("");
  const isClosed = status === "CLOSED";

  async function uploadFiles(selected: File[]) {
    const uploaded: Array<{ fileKey: string; fileName: string; contentType: string }> = [];
    for (const file of selected) {
      const result = await uploadAttachment({
        plantCode: plant,
        folder: "actions",
        file,
        contentType: file.type || "application/octet-stream",
        fallbackErrorMessage: labels.updateFailed,
      });
      uploaded.push({ fileKey: result.key, fileName: file.name, contentType: file.type || "application/octet-stream" });
    }
    return uploaded;
  }

  async function addUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy("update");
    setError("");
    try {
      const evidence = await uploadFiles(files);
      const response = await fetch(`/api/plants/${plant}/actions/${actionId}/updates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: comment.trim(), evidence }),
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result?.ok) throw new Error(result?.message ?? labels.updateFailed);
      setComment("");
      setFiles([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.updateFailed);
    } finally {
      setBusy(null);
    }
  }

  async function closeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (closureComment.trim().length < 5) {
      setError(labels.closureCommentRequired);
      return;
    }
    if (!closedAt) {
      setError(labels.selectClosureDate);
      return;
    }
    setBusy("close");
    setError("");
    try {
      const evidence = await uploadFiles(closureFiles);
      const response = await fetch(`/api/plants/${plant}/actions/${actionId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ closureComment: closureComment.trim(), closedAt, evidence }),
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result?.ok) throw new Error(result?.message ?? labels.closeFailed);
      setClosureComment("");
      setClosureFiles([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.closeFailed);
    } finally {
      setBusy(null);
    }
  }

  function eventTitle(kind: FollowUpEvent["kind"]) {
    if (kind === "CREATED") return labels.timelineCreated;
    if (kind === "DETAILS_CHANGED") return labels.timelineDetailsChanged;
    if (kind === "STATUS_CHANGED") return labels.timelineStatusChanged;
    if (kind === "CLOSED") return labels.timelineClosed;
    if (kind === "REOPENED") return labels.timelineReopened;
    return labels.timelineComment;
  }

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.followUpTitle}</h2>
        {updates.length ? (
          <ol className="mt-4 space-y-4 border-l-2 border-slate-200 pl-5">
            {updates.map((update) => (
              <li key={update.id} className="relative rounded-lg border border-slate-200 p-4">
                <span className="absolute -left-[1.68rem] top-5 h-3 w-3 rounded-full border-2 border-white bg-sky-600" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{eventTitle(update.kind)}</h3>
                  <time className="text-xs text-slate-500">{new Date(update.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{update.content}</p>
                {update.statusFrom && update.statusTo && update.statusFrom !== update.statusTo ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {labels.statusLabels[update.statusFrom as keyof FollowUpLabels["statusLabels"]] ?? update.statusFrom}
                    {" → "}
                    {labels.statusLabels[update.statusTo as keyof FollowUpLabels["statusLabels"]] ?? update.statusTo}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">{labels.by} {update.createdByName ?? "-"}</p>
                {update.attachments.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {update.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a
                          className="inline-flex rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50"
                          href={`/api/plants/${plant}/actions/${actionId}/attachments/${attachment.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {labels.viewEvidence}: {attachment.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-sm text-slate-500">{labels.noUpdates}</p>}
      </div>

      {!isClosed && canAddUpdate ? (
        <form onSubmit={addUpdate} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">{labels.addUpdateTitle}</h3>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">{labels.commentLabel}</span>
            <textarea required value={comment} onChange={(event) => setComment(event.target.value)} rows={4} maxLength={5000} placeholder={labels.commentPlaceholder} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">{labels.evidenceLabel}</span>
            <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={busy !== null || !comment.trim()} className="rounded-md bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {busy === "update" ? labels.postingUpdate : labels.addUpdate}
          </button>
        </form>
      ) : null}

      {isClosed ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{labels.closedMessage}</p> : null}

      {!isClosed && canClose ? (
        <form onSubmit={closeAction} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">{labels.closeTitle}</h3>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">{labels.closeDate}</span>
            <input type="date" required value={closedAt} onChange={(event) => setClosedAt(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">{labels.commentLabel}</span>
            <textarea required minLength={5} value={closureComment} onChange={(event) => setClosureComment(event.target.value)} rows={3} maxLength={5000} placeholder={labels.closureCommentPlaceholder} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">{labels.evidenceLabel}</span>
            <input type="file" multiple onChange={(event) => setClosureFiles(Array.from(event.target.files ?? []))} className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={busy !== null} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {busy === "close" ? labels.closing : labels.closeButton}
          </button>
        </form>
      ) : null}

      {error ? <p role="alert" className="text-sm font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}
