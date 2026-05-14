"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatActionCode, getActionStatusClasses } from "@/lib/helpers";

type EvidenceRow = {
  id: string;
  fileName: string;
};

type ActionRow = {
  id: string;
  sequenceNumber: number | null;
  title: string;
  priority: string;
  status: string;
  ownerName: string;
  dueDate: string;
  local: string;
  sourceLabel: string;
  sourceHref: string | null;
  communicationId: string | null;
  sewoId: string | null;
  evidence: EvidenceRow[];
};

export function ActionsTable({
  plant,
  actions,
}: {
  plant: string;
  actions: ActionRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bulkComment, setBulkComment] = useState("");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [rowComments, setRowComments] = useState<Record<string, string>>({});
  const [rowFiles, setRowFiles] = useState<Record<string, File[]>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const openActions = useMemo(
    () => actions.filter((action) => action.status === "OPEN" || action.status === "ONGOING"),
    [actions],
  );

  async function uploadFiles(files: File[]) {
    const uploaded: Array<{ fileKey: string; fileName: string; contentType: string }> = [];
    for (const file of files) {
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantCode: plant,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          folder: "actions",
        }),
      });
      const presignJson = await presignResponse.json();
      if (!presignResponse.ok || !presignJson.ok) {
        throw new Error(presignJson.message ?? "Failed to prepare evidence upload");
      }

      const putResponse = await fetch(presignJson.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }

      uploaded.push({
        fileKey: presignJson.data.key,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      });
    }
    return uploaded;
  }

  async function closeAction(actionId: string) {
    const comment = rowComments[actionId] ?? "";
    if (comment.trim().length < 5) {
      setMessage("Write at least 5 characters in the closure comment.");
      return;
    }

    setBusyId(actionId);
    setMessage("");
    try {
      const evidence = await uploadFiles(rowFiles[actionId] ?? []);
      const response = await fetch(`/api/plants/${plant}/actions/${actionId}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          closureComment: comment,
          evidence,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to close action");
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to close action");
    } finally {
      setBusyId(null);
    }
  }

  async function closeSelected() {
    if (!selectedIds.length) {
      setMessage("Select at least one action.");
      return;
    }
    if (bulkComment.trim().length < 5) {
      setMessage("Write at least 5 characters in the bulk closure comment.");
      return;
    }

    setBusyId("bulk");
    setMessage("");
    try {
      const evidence = await uploadFiles(bulkFiles);
      const response = await fetch(`/api/plants/${plant}/actions/close-batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionIds: selectedIds,
          closureComment: bulkComment,
          evidence,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to close selected actions");
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to close selected actions");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelection(actionId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, actionId] : current.filter((entry) => entry !== actionId)));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Bulk closure comment</label>
            <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="What was done to close the selected actions?" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Photos / documents</label>
            <input type="file" multiple onChange={(event) => setBulkFiles(Array.from(event.target.files ?? []))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <Button type="button" size="sm" onClick={closeSelected} disabled={busyId === "bulk"}>
            {busyId === "bulk" ? "Closing..." : "Close selected"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Select multiple actions in the list and close them together. Attachments are optional.</p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Select</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((row) => {
              const isOpen = row.status === "OPEN" || row.status === "ONGOING";
              const isExpanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      {isOpen ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(event) => toggleSelection(row.id, event.target.checked)}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-500">{formatActionCode(plant, row.sequenceNumber)}</div>
                      <Link href={`/app/${plant}/actions/${row.id}`} className="font-semibold text-slate-900 hover:text-teal-700 hover:underline">
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.local}</td>
                    <td className="px-4 py-3">
                      {row.sourceHref ? (
                        <Link href={row.sourceHref} className="font-medium text-teal-700 hover:underline">
                          {row.sourceLabel}
                        </Link>
                      ) : (
                        row.sourceLabel
                      )}
                    </td>
                    <td className="px-4 py-3">{row.priority}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getActionStatusClasses(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.ownerName}</td>
                    <td className="px-4 py-3">{row.dueDate}</td>
                    <td className="px-4 py-3">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                        {isExpanded ? "Hide" : isOpen ? "Open / close" : "Open"}
                      </Button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Linked records</p>
                              <p className="mt-2 text-sm text-slate-700">
                                Communication: {row.communicationId ?? "-"} | S-EWO: {row.sewoId ?? "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence already attached</p>
                              <div className="mt-2 space-y-1 text-sm text-slate-700">
                                {row.evidence.length ? row.evidence.map((item) => <p key={item.id}>{item.fileName}</p>) : <p>-</p>}
                              </div>
                            </div>
                          </div>
                          {isOpen ? (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="text-sm font-semibold text-slate-900">Close action</h3>
                              <textarea
                                value={rowComments[row.id] ?? ""}
                                onChange={(event) => setRowComments((current) => ({ ...current, [row.id]: event.target.value }))}
                                rows={3}
                                placeholder="Describe what was done."
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              />
                              <input
                                type="file"
                                multiple
                                onChange={(event) => setRowFiles((current) => ({ ...current, [row.id]: Array.from(event.target.files ?? []) }))}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              />
                              <Button type="button" size="sm" onClick={() => closeAction(row.id)} disabled={busyId === row.id}>
                                {busyId === row.id ? "Closing..." : "Close action"}
                              </Button>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                              This action is already closed.
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {actions.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                  No actions were found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="text-sm text-slate-600">
        <p>{openActions.length} open action(s).</p>
        {message ? <p className="mt-1 text-rose-700">{message}</p> : null}
      </div>
    </div>
  );
}
