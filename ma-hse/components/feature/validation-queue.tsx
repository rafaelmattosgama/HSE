"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";
import { ValidationActions } from "@/components/feature/validation-actions";

type ValidationRow = {
  id: string;
  type: string;
  typeLabel: string;
  reporterName: string;
  eventDatetime: string;
  department: string;
  location: string;
  description: string;
};

export function ValidationQueue({
  plant,
  rows,
  labels,
  actionLabels,
}: {
  plant: string;
  rows: ValidationRow[];
  labels?: CommunicationUi["validationQueue"];
  actionLabels?: CommunicationUi["validationActions"];
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.validationQueue;
  const [typeFilter, setTypeFilter] = useState("all");
  const filteredRows = useMemo(
    () => rows.filter((row) => (typeFilter === "all" ? true : row.type === typeFilter)),
    [rows, typeFilter],
  );
  const typeOptions = useMemo(() => {
    const options = new Map<string, string>();

    rows.forEach((row) => {
      if (!options.has(row.type)) {
        options.set(row.type, row.typeLabel);
      }
    });

    return Array.from(options, ([value, label]) => ({ value, label }));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="all">{text.allTypes}</option>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {filteredRows.map((row) => (
        <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-semibold text-slate-900">{row.typeLabel}</h2>
              <p className="text-sm text-slate-500">{text.reporter}: {row.reporterName}</p>
              <p className="text-sm text-slate-500">{text.department}: {row.department}</p>
              <p className="text-sm text-slate-500">{text.location}: {row.location}</p>
              <p className="text-sm text-slate-500">{text.date}: {row.eventDatetime.replace("T", " ").slice(0, 16)}</p>
            </div>
            <Link href={`/app/${plant}/communications/${row.id}?from=validation`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {text.openEdit}
            </Link>
          </div>

          <p className="mb-4 text-sm text-slate-700">{row.description}</p>
          <ValidationActions plant={plant} communicationId={row.id} labels={actionLabels} />
        </article>
      ))}
    </div>
  );
}
