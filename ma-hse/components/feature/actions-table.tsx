"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseApiResponse } from "@/lib/client-api";
import { formatActionCode, getActionStatusClasses } from "@/lib/helpers";
import {
  BASE_ACTIONS_UI,
  formatLocalizedActionPriority,
  formatLocalizedActionStatus,
  type ActionsUi,
} from "@/lib/actions-ui";
import { formatRecordLevel } from "@/lib/record-level";

type ActionRow = {
  id: string;
  plantCode?: string;
  plantName?: string;
  sequenceNumber: number | null;
  title: string;
  description: string;
  level?: string | null;
  priority: string;
  status: string;
  ownerUserId: string;
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
};

type DateSortDirection = "asc" | "desc";

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
  showPlant = false,
}: {
  plant: string;
  actions: ActionRow[];
  canDelete?: boolean;
  showPlant?: boolean;
  labels?: ActionsUi["table"];
  statusLabels?: ActionsUi["statusLabels"];
  priorityLabels?: ActionsUi["priorityLabels"];
}) {
  const text = labels ?? BASE_ACTIONS_UI.table;
  const localizedStatusLabels = statusLabels ?? BASE_ACTIONS_UI.statusLabels;
  const localizedPriorityLabels = priorityLabels ?? BASE_ACTIONS_UI.priorityLabels;
  const [message, setMessage] = useState("");
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
  async function deleteAction(actionId: string) {
    const action = actions.find((entry) => entry.id === actionId);
    const actionPlant = action?.plantCode ?? plant;
    if (!window.confirm(text.confirmDelete)) {
      return;
    }

    setDeletingId(actionId);
    setMessage("");
    try {
      const response = await fetch(`/api/plants/${actionPlant}/actions/${actionId}`, {
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

  async function exportFiltered(format: "xlsx" | "pdf") {
    setExportingFormat(format);
    setMessage("");

    try {
      if (showPlant) {
        throw new Error("Export is available after selecting a single plant.");
      }

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
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid max-w-[90rem] gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 [&>label]:min-w-0">
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

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
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
        <div className="relative isolate overflow-x-auto rounded-b-xl">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {showPlant ? <th className="px-4 py-3">Plant</th> : null}
                <th className="px-4 py-3">{text.action}</th>
                <th className="px-4 py-3">{text.local}</th>
                <th className="px-4 py-3">{text.source}</th>
                <th className="w-28 px-4 py-3">{text.priority}</th>
                <th className="w-32 px-4 py-3">{text.status}</th>
                <th className="px-4 py-3">{text.owner}</th>
                <th className="w-32 px-4 py-3">{text.due}</th>
                <th className="sticky right-0 z-10 w-44 min-w-44 bg-slate-50 px-4 py-3 shadow-[-6px_0_12px_-8px_var(--border)]">{text.followUp}</th>
              </tr>
            </thead>
            <tbody>
              {filteredActions.map((row) => {
                return (
                    <tr key={row.id} className="border-t border-slate-200">
                      {showPlant ? <td className="px-4 py-3 font-semibold text-slate-700">{row.plantName ?? row.plantCode?.toUpperCase() ?? "-"}</td> : null}
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-slate-500">{formatActionCode(row.plantCode ?? plant, row.sequenceNumber)}</div>
                        <Link href={`/app/${row.plantCode ?? plant}/actions/${row.id}`} className="block min-w-48 max-w-sm break-words font-semibold text-slate-900 hover:text-teal-700 hover:underline">
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
                        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-center text-xs font-semibold ${getActionStatusClasses(row.status)}`}>
                          {formatLocalizedActionStatus(row.status, { statusLabels: localizedStatusLabels })}
                        </span>
                      </td>
                      <td className="px-4 py-3"><div className="max-w-56 break-words">{row.ownerName}</div></td>
                      <td className="whitespace-nowrap px-4 py-3">{row.dueDate}</td>
                      <td className="sticky right-0 z-10 bg-[var(--surface)] px-4 py-3 shadow-[-6px_0_12px_-8px_var(--border)]">
                        <div className="flex flex-col items-start gap-2">
                          <Link href={`/app/${row.plantCode ?? plant}/actions/${row.id}`} className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            {text.followUp}
                          </Link>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void deleteAction(row.id)}
                              disabled={deletingId === row.id}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingId === row.id ? text.deleting : text.delete}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                );
              })}
              {filteredActions.length === 0 ? (
                <tr className="border-t border-slate-200">
                  <td colSpan={8 + (showPlant ? 1 : 0)} className="px-4 py-6 text-center text-sm text-slate-500">
                    {text.noRows}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
