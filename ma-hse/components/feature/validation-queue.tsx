"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCommunicationType } from "@/lib/helpers";
import { ValidationActions } from "@/components/feature/validation-actions";

type ValidationRow = {
  id: string;
  type: string;
  reporterName: string;
  eventDatetime: string;
  department: string;
  location: string;
  description: string;
};

export function ValidationQueue({ plant, rows }: { plant: string; rows: ValidationRow[] }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const filteredRows = useMemo(
    () => rows.filter((row) => (typeFilter === "all" ? true : row.type === typeFilter)),
    [rows, typeFilter],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          {Array.from(new Set(rows.map((row) => row.type))).map((type) => (
            <option key={type} value={type}>{formatCommunicationType(type)}</option>
          ))}
        </select>
      </div>

      {filteredRows.map((row) => (
        <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-semibold text-slate-900">{formatCommunicationType(row.type)}</h2>
              <p className="text-sm text-slate-500">Reporter: {row.reporterName}</p>
              <p className="text-sm text-slate-500">Department: {row.department}</p>
              <p className="text-sm text-slate-500">Local: {row.location}</p>
              <p className="text-sm text-slate-500">Date: {row.eventDatetime.replace("T", " ").slice(0, 16)}</p>
            </div>
            <Link href={`/app/${plant}/communications/${row.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Open / Edit
            </Link>
          </div>

          <p className="mb-4 text-sm text-slate-700">{row.description}</p>
          <ValidationActions communicationId={row.id} />
        </article>
      ))}
    </div>
  );
}
