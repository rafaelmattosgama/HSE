"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCommunicationStatus, formatCommunicationType, getCommunicationStatusClasses, normalizeCommunicationStatus } from "@/lib/helpers";

type CommunicationRow = {
  id: string;
  eventDatetime: string;
  type: string;
  status: string;
  reporterName: string;
  department: string;
  location: string;
};

export function CommunicationsTable({ plant, rows }: { plant: string; rows: CommunicationRow[] }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reporterFilter, setReporterFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (typeFilter !== "all" && row.type !== typeFilter) return false;
        if (statusFilter !== "all" && normalizeCommunicationStatus(row.status) !== statusFilter) return false;
        if (reporterFilter && !row.reporterName.toLowerCase().includes(reporterFilter.toLowerCase())) return false;
        if (dateFilter && !row.eventDatetime.startsWith(dateFilter)) return false;
        return true;
      }),
    [dateFilter, reporterFilter, rows, statusFilter, typeFilter],
  );

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          {Array.from(new Set(rows.map((row) => row.type))).map((type) => (
            <option key={type} value={type}>{formatCommunicationType(type)}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="to_do">To Do</option>
          <option value="on_going">On Going</option>
          <option value="closed">Closed</option>
        </select>
        <input value={reporterFilter} onChange={(event) => setReporterFilter(event.target.value)} placeholder="Reporter" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{row.eventDatetime.replace("T", " ").slice(0, 16)}</td>
                <td className="px-4 py-3">{formatCommunicationType(row.type)}</td>
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
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">No communications found for the selected filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
