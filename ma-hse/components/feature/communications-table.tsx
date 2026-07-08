"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCommunicationStatusClasses, normalizeCommunicationStatus } from "@/lib/helpers";
import { formatRecordLevel } from "@/lib/record-level";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";

type CommunicationRow = {
  id: string;
  plantCode?: string;
  plantName?: string;
  codigoCompleto?: string | null;
  codigoAbreviado?: string | null;
  eventDatetime: string;
  level?: string | null;
  type: string;
  status: string;
  reporterName: string;
  department: string;
  location: string;
  involvedWorker: string;
  description: string;
  unsafeActType?: string;
  unsafeConditionType?: string;
  nearMissType?: string;
};

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

export function CommunicationsTable({
  plant,
  rows,
  canDelete = false,
  canViewClassification = false,
  labels,
  typeLabels,
  statusLabels,
  showPlant = false,
}: {
  plant: string;
  rows: CommunicationRow[];
  canDelete?: boolean;
  canViewClassification?: boolean;
  showPlant?: boolean;
  labels?: CommunicationUi["communicationsTable"];
  typeLabels?: CommunicationUi["communicationTypeLabels"];
  statusLabels?: CommunicationUi["communicationStatusLabels"];
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.communicationsTable;
  const communicationTypeLabels =
    typeLabels ?? BASE_COMMUNICATION_UI.communicationTypeLabels;
  const communicationStatusLabels =
    statusLabels ?? BASE_COMMUNICATION_UI.communicationStatusLabels;
  const router = useRouter();
  const [tableRows, setTableRows] = useState(rows);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reporterFilter, setReporterFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [unsafeActTypeFilter, setUnsafeActTypeFilter] = useState("all");
  const [unsafeConditionTypeFilter, setUnsafeConditionTypeFilter] = useState("all");
  const [nearMissTypeFilter, setNearMissTypeFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"xlsx" | "pdf" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTableRows(rows);
  }, [rows]);

  const departmentOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.department).filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)),
    [tableRows],
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.location).filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)),
    [tableRows],
  );
  const nearMissTypeOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.nearMissType).filter((value): value is string => Boolean(value && value !== "-")))).sort((a, b) => a.localeCompare(b)),
    [tableRows],
  );
  const unsafeActTypeOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.unsafeActType).filter((value): value is string => Boolean(value && value !== "-")))).sort((a, b) => a.localeCompare(b)),
    [tableRows],
  );
  const unsafeConditionTypeOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.unsafeConditionType).filter((value): value is string => Boolean(value && value !== "-")))).sort((a, b) => a.localeCompare(b)),
    [tableRows],
  );

  const filteredRows = useMemo(
    () =>
      tableRows.filter((row) => {
        const eventDate = row.eventDatetime.slice(0, 10);
        if (typeFilter !== "all" && row.type !== typeFilter) return false;
        if (statusFilter !== "all" && normalizeCommunicationStatus(row.status) !== statusFilter) return false;
        if (reporterFilter && !row.reporterName.toLowerCase().includes(reporterFilter.toLowerCase())) return false;
        if (dateFromFilter && eventDate < dateFromFilter) return false;
        if (dateToFilter && eventDate > dateToFilter) return false;
        if (departmentFilter !== "all" && row.department !== departmentFilter) return false;
        if (locationFilter !== "all" && row.location !== locationFilter) return false;
        if (canViewClassification && unsafeActTypeFilter !== "all" && row.unsafeActType !== unsafeActTypeFilter) return false;
        if (canViewClassification && unsafeConditionTypeFilter !== "all" && row.unsafeConditionType !== unsafeConditionTypeFilter) return false;
        if (canViewClassification && nearMissTypeFilter !== "all" && row.nearMissType !== nearMissTypeFilter) return false;
        return true;
      }),
    [canViewClassification, dateFromFilter, dateToFilter, departmentFilter, locationFilter, nearMissTypeFilter, reporterFilter, tableRows, statusFilter, typeFilter, unsafeActTypeFilter, unsafeConditionTypeFilter],
  );

  function formatLabel(template: string, replacements: Record<string, string>) {
    return Object.entries(replacements).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, value),
      template,
    );
  }

  async function exportFiltered(format: "xlsx" | "pdf") {
    setExportingFormat(format);
    setMessage("");

    try {
      if (showPlant) {
        throw new Error("Export is available after selecting a single plant.");
      }

      const response = await fetch(`/api/plants/${plant}/communications/export?format=${format}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: filteredRows.map((row) => ({
            code: row.codigoCompleto ?? row.codigoAbreviado ?? "Requires code update",
            event: row.eventDatetime.replace("T", " ").slice(0, 16),
            level: formatRecordLevel(row.level),
            type: communicationTypeLabels[row.type as keyof typeof communicationTypeLabels] ?? row.type,
            status: communicationStatusLabels[row.status as keyof typeof communicationStatusLabels] ?? row.status,
            reporter: row.reporterName,
            department: row.department,
            location: row.location,
            description: row.description,
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
      link.download = `comunicacoes_filtradas.${format}`;
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

  async function deleteCommunication(row: CommunicationRow) {
    if (
      !window.confirm(
        formatLabel(text.confirmDelete, {
          event: row.eventDatetime.replace("T", " ").slice(0, 16),
        }),
      )
    ) {
      return;
    }

    setDeletingId(row.id);
    setMessage("");

    try {
      const rowPlant = row.plantCode ?? plant;
      const response = await fetch(`/api/plants/${rowPlant}/communications/${row.id}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? text.deleteFailed);
      }

      setTableRows((current) => current.filter((entry) => entry.id !== row.id));
      setMessage(text.deleted);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.type}</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allTypes}</option>
            {Array.from(new Set(tableRows.map((row) => row.type))).map((type) => (
              <option key={type} value={type}>{communicationTypeLabels[type as keyof typeof communicationTypeLabels] ?? type}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.status}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allStatuses}</option>
            <option value="to_do">{text.toDo}</option>
            <option value="on_going">{text.onGoing}</option>
            <option value="closed">{text.closed}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.reporter}</span>
          <input value={reporterFilter} onChange={(event) => setReporterFilter(event.target.value)} placeholder={text.reporter} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dateFrom}</span>
          <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dateTo}</span>
          <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.department}</span>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allDepartments}</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.location}</span>
          <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">{text.allLocations}</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </label>
        {canViewClassification ? (
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.unsafeActType}</span>
            <select value={unsafeActTypeFilter} onChange={(event) => setUnsafeActTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allUnsafeActTypes}</option>
              {unsafeActTypeOptions.map((unsafeActType) => (
                <option key={unsafeActType} value={unsafeActType}>{unsafeActType}</option>
              ))}
            </select>
          </label>
        ) : null}
        {canViewClassification ? (
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.unsafeConditionType}</span>
            <select value={unsafeConditionTypeFilter} onChange={(event) => setUnsafeConditionTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allUnsafeConditionTypes}</option>
              {unsafeConditionTypeOptions.map((unsafeConditionType) => (
                <option key={unsafeConditionType} value={unsafeConditionType}>{unsafeConditionType}</option>
              ))}
            </select>
          </label>
        ) : null}
        {canViewClassification ? (
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.nearMissType}</span>
            <select value={nearMissTypeFilter} onChange={(event) => setNearMissTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allNearMissTypes}</option>
              {nearMissTypeOptions.map((nearMissType) => (
                <option key={nearMissType} value={nearMissType}>{nearMissType}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {formatLabel(text.shownCount, { count: String(filteredRows.length) })}
        </p>
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

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{text.event}</th>
              {showPlant ? <th className="px-4 py-3">Plant</th> : null}
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">{text.type}</th>
              <th className="px-4 py-3">{text.status}</th>
              <th className="px-4 py-3">{text.reporter}</th>
              <th className="px-4 py-3">{text.department}</th>
              <th className="px-4 py-3">{text.location}</th>
              <th className="px-4 py-3">{text.involvedWorker}</th>
              <th className="px-4 py-3">{text.detail}</th>
              {canDelete ? <th className="px-4 py-3">{text.delete}</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{row.eventDatetime.replace("T", " ").slice(0, 16)}</td>
                {showPlant ? <td className="px-4 py-3 font-semibold text-slate-700">{row.plantName ?? row.plantCode?.toUpperCase() ?? "-"}</td> : null}
                <td className="px-4 py-3 font-semibold text-slate-900">{row.codigoCompleto ?? row.codigoAbreviado ?? "Requires code update"}</td>
                <td className="px-4 py-3">{communicationTypeLabels[row.type as keyof typeof communicationTypeLabels] ?? row.type}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getCommunicationStatusClasses(row.status)}`}>
                    {communicationStatusLabels[row.status as keyof typeof communicationStatusLabels] ?? row.status}
                  </span>
                </td>
                <td className="px-4 py-3">{row.reporterName}</td>
                <td className="px-4 py-3">{row.department}</td>
                <td className="px-4 py-3">{row.location}</td>
                <td className="px-4 py-3">{row.involvedWorker}</td>
                <td className="px-4 py-3">
                  <Link href={`/app/${row.plantCode ?? plant}/communications/${row.id}`} className="font-semibold text-teal-700 hover:underline">
                    {text.openEdit}
                  </Link>
                </td>
                {canDelete ? (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void deleteCommunication(row)}
                      disabled={deletingId === row.id}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === row.id ? text.deleting : text.delete}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={(canDelete ? 10 : 9) + (showPlant ? 1 : 0)} className="px-4 py-6 text-center text-sm text-slate-500">{text.noRows}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
