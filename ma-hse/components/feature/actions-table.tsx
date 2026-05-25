"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseApiResponse, requireApiResponse } from "@/lib/client-api";
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
  closedDate: string | null;
  local: string;
  sourceLabel: string;
  sourceHref: string | null;
  communicationId: string | null;
  sewoId: string | null;
  evidence: EvidenceRow[];
};

type DateSortDirection = "asc" | "desc";

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [bulkClosedAt, setBulkClosedAt] = useState(todayDateInputValue());
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [rowComments, setRowComments] = useState<Record<string, string>>({});
  const [rowClosedDates, setRowClosedDates] = useState<Record<string, string>>({});
  const [rowFiles, setRowFiles] = useState<Record<string, File[]>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localFilter, setLocalFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [dateSortDirection, setDateSortDirection] = useState<DateSortDirection>("asc");

  const localOptions = useMemo(
    () => Array.from(new Set(actions.map((action) => action.local).filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)),
    [actions],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(actions.map((action) => action.status))).sort((a, b) => a.localeCompare(b)),
    [actions],
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(actions.map((action) => action.ownerName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [actions],
  );

  const filteredActions = useMemo(
    () =>
      actions
        .filter((action) => {
          if (localFilter !== "all" && action.local !== localFilter) return false;
          if (statusFilter !== "all" && action.status !== statusFilter) return false;
          if (ownerFilter !== "all" && action.ownerName !== ownerFilter) return false;
          if (dateFromFilter && action.dueDate < dateFromFilter) return false;
          if (dateToFilter && action.dueDate > dateToFilter) return false;
          return true;
        })
        .toSorted((left, right) => {
          const direction = dateSortDirection === "asc" ? 1 : -1;
          const dateComparison = left.dueDate.localeCompare(right.dueDate) * direction;

          if (dateComparison !== 0) return dateComparison;
          return left.title.localeCompare(right.title);
        }),
    [actions, dateFromFilter, dateSortDirection, dateToFilter, localFilter, ownerFilter, statusFilter],
  );

  const openActions = useMemo(
    () => filteredActions.filter((action) => action.status === "OPEN" || action.status === "ONGOING"),
    [filteredActions],
  );

  useEffect(() => {
    const visibleActionIds = new Set(filteredActions.map((action) => action.id));
    setSelectedIds((current) => current.filter((actionId) => visibleActionIds.has(actionId)));
  }, [filteredActions]);

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
      const presignJson = await requireApiResponse<{
        uploadUrl: string;
        key: string;
      }>(presignResponse, "Failed to prepare evidence upload");
      const presignData = presignJson.data;

      if (!presignData) {
        throw new Error("Failed to prepare evidence upload");
      }

      const putResponse = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }

      uploaded.push({
        fileKey: presignData.key,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      });
    }
    return uploaded;
  }

  async function closeAction(actionId: string) {
    const comment = rowComments[actionId] ?? "";
    const closedAt = rowClosedDates[actionId] ?? todayDateInputValue();
    if (comment.trim().length < 5) {
      setMessage("Write at least 5 characters in the closure comment.");
      return;
    }
    if (!closedAt) {
      setMessage("Select a closure date.");
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
          closedAt,
          evidence,
        }),
      });
      const json = await parseApiResponse(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? "Failed to close action");
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
    if (!bulkClosedAt) {
      setMessage("Select a closure date.");
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
          closedAt: bulkClosedAt,
          evidence,
        }),
      });
      const json = await parseApiResponse(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? "Failed to close selected actions");
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Local</span>
            <select value={localFilter} onChange={(event) => setLocalFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All locations</option>
              {localOptions.map((local) => (
                <option key={local} value={local}>{local}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</span>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All owners</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Due from</span>
            <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Due to</span>
            <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Date order</span>
            <select value={dateSortDirection} onChange={(event) => setDateSortDirection(event.target.value as DateSortDirection)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="asc">Due date ascending</option>
              <option value="desc">Due date descending</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Bulk closure comment</label>
            <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="What was done to close the selected actions?" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Closure date</label>
            <input type="date" value={bulkClosedAt} onChange={(event) => setBulkClosedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
            {filteredActions.map((row) => {
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
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closure date</p>
                              <p className="mt-2 text-sm text-slate-700">{row.closedDate ?? "-"}</p>
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
                              <label className="space-y-1 text-sm">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Closure date</span>
                                <input
                                  type="date"
                                  value={rowClosedDates[row.id] ?? todayDateInputValue()}
                                  onChange={(event) => setRowClosedDates((current) => ({ ...current, [row.id]: event.target.value }))}
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  required
                                />
                              </label>
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
            {filteredActions.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                  No actions were found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="text-sm text-slate-600">
        <p>{filteredActions.length} action(s) shown. {openActions.length} open action(s).</p>
        {message ? <p className="mt-1 text-rose-700">{message}</p> : null}
      </div>
    </div>
  );
}
