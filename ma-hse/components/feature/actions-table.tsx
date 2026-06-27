"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseApiResponse, requireApiResponse } from "@/lib/client-api";
import { formatActionCode, getActionStatusClasses } from "@/lib/helpers";
import {
  BASE_ACTIONS_UI,
  formatLocalizedActionPriority,
  formatLocalizedActionStatus,
  type ActionsUi,
} from "@/lib/actions-ui";
import { formatRecordLevel } from "@/lib/record-level";

type EvidenceRow = {
  id: string;
  fileName: string;
};

type ActionRow = {
  id: string;
  sequenceNumber: number | null;
  title: string;
  description: string;
  level?: string | null;
  priority: string;
  status: string;
  ownerName: string;
  dueDate: string;
  closedDate: string | null;
  local: string;
  sourceLabel: string;
  sourceHref: string | null;
  manualOrigin: string;
  communicationId: string | null;
  communicationCode: string | null;
  sewoId: string | null;
  sewoCode: string | null;
  smatAuditId: string | null;
  smatCode: string | null;
  evidence: EvidenceRow[];
};

type DateSortDirection = "asc" | "desc";

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

async function readExportError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null) as { message?: string } | null;
    return json?.message ?? `${fallback} (${response.status})`;
  }

  const text = await response.text().catch(() => "");
  const compactText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return compactText ? `${fallback} (${response.status}): ${compactText.slice(0, 180)}` : `${fallback} (${response.status})`;
}

export function ActionsTable({
  plant,
  actions,
  canDelete = false,
  labels,
  statusLabels,
  priorityLabels,
}: {
  plant: string;
  actions: ActionRow[];
  canDelete?: boolean;
  labels?: ActionsUi["table"];
  statusLabels?: ActionsUi["statusLabels"];
  priorityLabels?: ActionsUi["priorityLabels"];
}) {
  const text = labels ?? BASE_ACTIONS_UI.table;
  const localizedStatusLabels = statusLabels ?? BASE_ACTIONS_UI.statusLabels;
  const localizedPriorityLabels = priorityLabels ?? BASE_ACTIONS_UI.priorityLabels;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localFilter, setLocalFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [dateSortDirection, setDateSortDirection] = useState<DateSortDirection>("asc");
  const [exportingFormat, setExportingFormat] = useState<"xlsx" | "pdf" | null>(null);

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
      setMessage(text.closureCommentMin);
      return;
    }
    if (!closedAt) {
      setMessage(text.selectClosureDate);
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
        throw new Error(text.closeFailed);
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.closeFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAction(actionId: string) {
    if (!window.confirm(text.confirmDelete)) {
      return;
    }

    setDeletingId(actionId);
    setMessage("");
    try {
      const response = await fetch(`/api/plants/${plant}/actions/${actionId}`, {
        method: "DELETE",
      });
      const json = await parseApiResponse(response);
      if (!response.ok || !json?.ok) {
        throw new Error(text.deleteFailed);
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }

  async function closeSelected() {
    if (!selectedIds.length) {
      setMessage(text.selectAtLeastOne);
      return;
    }
    if (bulkComment.trim().length < 5) {
      setMessage(text.bulkClosureCommentMin);
      return;
    }
    if (!bulkClosedAt) {
      setMessage(text.selectClosureDate);
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
        throw new Error(text.bulkCloseFailed);
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.bulkCloseFailed);
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelection(actionId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, actionId] : current.filter((entry) => entry !== actionId)));
  }

  async function exportFiltered(format: "xlsx" | "pdf") {
    setExportingFormat(format);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/actions/export?format=${format}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: filteredActions.map((action) => ({
            action: `${formatActionCode(plant, action.sequenceNumber)} | ${action.title}`,
            level: formatRecordLevel(action.level),
            local: action.local,
            source: [
              action.sourceLabel,
              action.communicationCode ?? action.sewoCode ?? action.smatCode,
              action.manualOrigin !== "-" ? action.manualOrigin : null,
            ].filter(Boolean).join(" | "),
            priority: action.priority,
            status: action.status,
            owner: action.ownerName,
            due: action.dueDate,
            description: action.description,
          })),
        }),
      });

      const fallbackMessage = `${text.exportFailed} (${format.toUpperCase()})`;
      if (!response.ok) {
        throw new Error(await readExportError(response, fallbackMessage));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acoes_filtradas.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.exportFailed);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.local}</span>
            <select value={localFilter} onChange={(event) => setLocalFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allLocations}</option>
              {localOptions.map((local) => (
                <option key={local} value={local}>{local}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.status}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allStatuses}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{formatLocalizedActionStatus(status, { statusLabels: localizedStatusLabels })}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.owner}</span>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allOwners}</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dueFrom}</span>
            <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dueTo}</span>
            <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dateOrder}</span>
            <select value={dateSortDirection} onChange={(event) => setDateSortDirection(event.target.value as DateSortDirection)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="asc">{text.dueDateAscending}</option>
              <option value="desc">{text.dueDateDescending}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.bulkClosureComment}</label>
            <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={text.bulkClosurePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.closureDate}</label>
            <input type="date" value={bulkClosedAt} onChange={(event) => setBulkClosedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.photosDocuments}</label>
            <input type="file" multiple onChange={(event) => setBulkFiles(Array.from(event.target.files ?? []))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <Button type="button" size="sm" onClick={closeSelected} disabled={busyId === "bulk"}>
            {busyId === "bulk" ? text.closing : text.closeSelected}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{text.bulkHelp}</p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-600">{formatLabel(text.shownCount, { count: String(filteredActions.length), openCount: String(openActions.length) })}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportFiltered("xlsx")}
              disabled={exportingFormat !== null}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exportingFormat === "xlsx" ? text.exporting : text.exportExcel}
            </button>
            <button
              type="button"
              onClick={() => void exportFiltered("pdf")}
              disabled={exportingFormat !== null}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exportingFormat === "pdf" ? text.exporting : text.exportPdf}
            </button>
          </div>
        </div>
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{text.select}</th>
              <th className="px-4 py-3">{text.action}</th>
              <th className="px-4 py-3">{text.local}</th>
              <th className="px-4 py-3">{text.source}</th>
              <th className="px-4 py-3">{text.priority}</th>
              <th className="px-4 py-3">{text.status}</th>
              <th className="px-4 py-3">{text.owner}</th>
              <th className="px-4 py-3">{text.due}</th>
              <th className="px-4 py-3">{text.open}</th>
              {canDelete ? <th className="px-4 py-3">{text.delete}</th> : null}
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
                    <td className="px-4 py-3">{formatLocalizedActionPriority(row.priority, { priorityLabels: localizedPriorityLabels })}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getActionStatusClasses(row.status)}`}>
                        {formatLocalizedActionStatus(row.status, { statusLabels: localizedStatusLabels })}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.ownerName}</td>
                    <td className="px-4 py-3">{row.dueDate}</td>
                    <td className="px-4 py-3">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                        {isExpanded ? text.hide : isOpen ? text.openClose : text.openOnly}
                      </Button>
                    </td>
                    {canDelete ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void deleteAction(row.id)}
                          disabled={deletingId === row.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === row.id ? text.deleting : text.delete}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={canDelete ? 10 : 9} className="px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.linkedRecords}</p>
                              <p className="mt-2 text-sm text-slate-700">
                                {text.manualOrigin}: {row.manualOrigin} | {text.communication}: {row.communicationCode ?? "-"} | {text.sewo}: {row.sewoCode ?? "-"} | {text.smat}: {row.smatCode ?? "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.closureDate}</p>
                              <p className="mt-2 text-sm text-slate-700">{row.closedDate ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.evidenceAttached}</p>
                              <div className="mt-2 space-y-1 text-sm text-slate-700">
                                {row.evidence.length ? row.evidence.map((item) => <p key={item.id}>{item.fileName}</p>) : <p>-</p>}
                              </div>
                            </div>
                          </div>
                          {isOpen ? (
                            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="text-sm font-semibold text-slate-900">{text.closeAction}</h3>
                              <label className="space-y-1 text-sm">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.closureDate}</span>
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
                                placeholder={text.describeClosure}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              />
                              <input
                                type="file"
                                multiple
                                onChange={(event) => setRowFiles((current) => ({ ...current, [row.id]: Array.from(event.target.files ?? []) }))}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              />
                              <Button type="button" size="sm" onClick={() => closeAction(row.id)} disabled={busyId === row.id}>
                                {busyId === row.id ? text.closing : text.closeAction}
                              </Button>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                              {text.alreadyClosed}
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
                <td colSpan={canDelete ? 10 : 9} className="px-4 py-6 text-center text-sm text-slate-500">
                  {text.noRows}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="text-sm text-slate-600">
        {message ? <p className="mt-1 text-rose-700">{message}</p> : null}
      </div>
    </div>
  );
}
  function formatLabel(template: string, replacements: Record<string, string>) {
    return Object.entries(replacements).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, value),
      template,
    );
  }
