"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatCommunicationStatus, formatCommunicationType, getCommunicationStatusClasses, normalizeCommunicationStatus } from "@/lib/helpers";

type CommunicationRow = {
  id: string;
  eventDatetime: string;
  type: string;
  status: string;
  reporterName: string;
  department: string;
  location: string;
  unsafeConditionType?: string;
  nearMissType?: string;
};

export function CommunicationsTable({
  plant,
  rows,
  canDelete = false,
  canViewClassification = false,
}: {
  plant: string;
  rows: CommunicationRow[];
  canDelete?: boolean;
  canViewClassification?: boolean;
}) {
  const router = useRouter();
  const [tableRows, setTableRows] = useState(rows);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reporterFilter, setReporterFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [unsafeConditionTypeFilter, setUnsafeConditionTypeFilter] = useState("all");
  const [nearMissTypeFilter, setNearMissTypeFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
        if (canViewClassification && unsafeConditionTypeFilter !== "all" && row.unsafeConditionType !== unsafeConditionTypeFilter) return false;
        if (canViewClassification && nearMissTypeFilter !== "all" && row.nearMissType !== nearMissTypeFilter) return false;
        return true;
      }),
    [canViewClassification, dateFromFilter, dateToFilter, departmentFilter, locationFilter, nearMissTypeFilter, reporterFilter, tableRows, statusFilter, typeFilter, unsafeConditionTypeFilter],
  );

  async function deleteCommunication(row: CommunicationRow) {
    if (!window.confirm(`Delete communication from ${row.eventDatetime.replace("T", " ").slice(0, 16)}? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(row.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/communications/${row.id}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to delete communication");
      }

      setTableRows((current) => current.filter((entry) => entry.id !== row.id));
      setMessage("Communication deleted.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete communication");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All types</option>
            {Array.from(new Set(tableRows.map((row) => row.type))).map((type) => (
              <option key={type} value={type}>{formatCommunicationType(type)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="to_do">To Do</option>
            <option value="on_going">On Going</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Reporter</span>
          <input value={reporterFilter} onChange={(event) => setReporterFilter(event.target.value)} placeholder="Reporter" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Date from</span>
          <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Date to</span>
          <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Department</span>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
          <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All locations</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </label>
        {canViewClassification ? (
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Unsafe condition type</span>
            <select value={unsafeConditionTypeFilter} onChange={(event) => setUnsafeConditionTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All unsafe condition types</option>
              {unsafeConditionTypeOptions.map((unsafeConditionType) => (
                <option key={unsafeConditionType} value={unsafeConditionType}>{unsafeConditionType}</option>
              ))}
            </select>
          </label>
        ) : null}
        {canViewClassification ? (
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Near miss type</span>
            <select value={nearMissTypeFilter} onChange={(event) => setNearMissTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">All near miss types</option>
              {nearMissTypeOptions.map((nearMissType) => (
                <option key={nearMissType} value={nearMissType}>{nearMissType}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              {canViewClassification ? <th className="px-4 py-3">Unsafe condition type</th> : null}
              {canViewClassification ? <th className="px-4 py-3">Near miss type</th> : null}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Detail</th>
              {canDelete ? <th className="px-4 py-3">Delete</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{row.eventDatetime.replace("T", " ").slice(0, 16)}</td>
                <td className="px-4 py-3">{formatCommunicationType(row.type)}</td>
                {canViewClassification ? <td className="px-4 py-3">{row.unsafeConditionType ?? "-"}</td> : null}
                {canViewClassification ? <td className="px-4 py-3">{row.nearMissType ?? "-"}</td> : null}
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getCommunicationStatusClasses(row.status)}`}>
                    {formatCommunicationStatus(row.status)}
                  </span>
                </td>
                <td className="px-4 py-3">{row.reporterName}</td>
                <td className="px-4 py-3">{row.department}</td>
                <td className="px-4 py-3">{row.location}</td>
                <td className="px-4 py-3">
                  <Link href={`/app/${plant}/communications/${row.id}`} className="font-semibold text-teal-700 hover:underline">
                    Open / Edit
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
                      {deletingId === row.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={(canDelete ? 8 : 7) + (canViewClassification ? 2 : 0)} className="px-4 py-6 text-center text-sm text-slate-500">No communications found for the selected filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
