"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";
import { ValidationActions } from "@/components/feature/validation-actions";
import { Button } from "@/components/ui/button";
import { toUtcDateKey } from "@/lib/safety-days";

type ValidationRow = {
  id: string;
  plantCode?: string;
  plantName?: string;
  type: string;
  typeLabel: string;
  reporterName: string;
  eventDatetime: string;
  department: string;
  location: string;
  description: string;
};

function normalizeReporterName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function getCommunicationDateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toUtcDateKey(date);
}

export function ValidationQueue({
  plant,
  rows,
  labels,
  actionLabels,
  showPlant = false,
}: {
  plant: string;
  rows: ValidationRow[];
  showPlant?: boolean;
  labels?: CommunicationUi["validationQueue"];
  actionLabels?: CommunicationUi["validationActions"];
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.validationQueue;
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [reporterFilter, setReporterFilter] = useState("");
  const hasInvalidDateRange = Boolean(dateFromFilter && dateToFilter && dateFromFilter > dateToFilter);
  const filteredRows = useMemo(
    () => {
      if (hasInvalidDateRange) return [];

      const normalizedReporterFilter = normalizeReporterName(reporterFilter);
      return rows.filter((row) => {
        const communicationDate = getCommunicationDateKey(row.eventDatetime);

        if (typeFilter !== "all" && row.type !== typeFilter) return false;
        if (normalizedReporterFilter && !normalizeReporterName(row.reporterName).includes(normalizedReporterFilter)) return false;
        if (dateFromFilter && (!communicationDate || communicationDate < dateFromFilter)) return false;
        if (dateToFilter && (!communicationDate || communicationDate > dateToFilter)) return false;
        return true;
      });
    },
    [dateFromFilter, dateToFilter, hasInvalidDateRange, reporterFilter, rows, typeFilter],
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
  const reporterOptions = useMemo(() => {
    const options = new Map<string, string>();

    rows.forEach((row) => {
      const reporterName = row.reporterName.trim();
      const normalizedName = normalizeReporterName(reporterName);
      if (normalizedName && !options.has(normalizedName)) {
        options.set(normalizedName, reporterName);
      }
    });

    return Array.from(options.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [rows]);

  function clearFilters() {
    setDateFromFilter("");
    setDateToFilter("");
    setReporterFilter("");
    setTypeFilter("all");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label htmlFor="validation-date-from" className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dateFrom}</span>
            <input
              type="date"
              id="validation-date-from"
              value={dateFromFilter}
              max={dateToFilter || undefined}
              onChange={(event) => setDateFromFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label htmlFor="validation-date-to" className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.dateTo}</span>
            <input
              type="date"
              id="validation-date-to"
              value={dateToFilter}
              min={dateFromFilter || undefined}
              onChange={(event) => setDateToFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label htmlFor="validation-reporter" className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.reporter}</span>
            <input
              type="search"
              id="validation-reporter"
              list="validation-reporter-options"
              value={reporterFilter}
              onChange={(event) => setReporterFilter(event.target.value)}
              placeholder={text.allReporters}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label htmlFor="validation-communication-type" className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.type}</span>
            <select id="validation-communication-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="all">{text.allTypes}</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="secondary" className="w-full" onClick={clearFilters}>
              {text.clearFilters}
            </Button>
          </div>
        </div>
        <datalist id="validation-reporter-options">
          <option value="">{text.allReporters}</option>
          {reporterOptions.map((reporter) => (
            <option key={reporter} value={reporter} />
          ))}
        </datalist>
        {hasInvalidDateRange ? <p role="alert" className="mt-3 text-sm text-red-700">{text.invalidDateRange}</p> : null}
      </div>

      {filteredRows.map((row) => (
        <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-semibold text-slate-900">{row.typeLabel}</h2>
              {showPlant ? <p className="text-sm font-semibold text-teal-800">Plant: {row.plantName ?? row.plantCode?.toUpperCase() ?? "-"}</p> : null}
              <p className="text-sm text-slate-500">{text.reporter}: {row.reporterName}</p>
              <p className="text-sm text-slate-500">{text.department}: {row.department}</p>
              <p className="text-sm text-slate-500">{text.location}: {row.location}</p>
              <p className="text-sm text-slate-500">{text.date}: {row.eventDatetime.replace("T", " ").slice(0, 16)}</p>
            </div>
            <Link href={`/app/${row.plantCode ?? plant}/communications/${row.id}?from=validation`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {text.openEdit}
            </Link>
          </div>

          <p className="mb-4 text-sm text-slate-700">{row.description}</p>
          <ValidationActions plant={row.plantCode ?? plant} communicationId={row.id} labels={actionLabels} />
        </article>
      ))}

      {filteredRows.length === 0 ? <div className="app-empty rounded-xl border border-dashed border-slate-300 p-6 text-sm">{text.noRows}</div> : null}
    </div>
  );
}
