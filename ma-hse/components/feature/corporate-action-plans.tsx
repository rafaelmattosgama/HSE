"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getActionStatusClasses } from "@/lib/helpers";

type CorporateActionPlanRow = {
  id: string;
  displayId: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  ownerName: string;
  dueDate: string;
  evidenceCount: number;
  plantName: string;
  plantCode: string;
  plantRouteCode: string;
};

type CorporateActionPlansProps = {
  actions: CorporateActionPlanRow[];
};

export function CorporateActionPlans({ actions }: CorporateActionPlansProps) {
  const [plantFilter, setPlantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFromFilter, setDueFromFilter] = useState("");
  const [dueToFilter, setDueToFilter] = useState("");

  const plantOptions = useMemo(
    () =>
      Array.from(new Map(actions.map((action) => [action.plantCode, action.plantName])).entries()).map(([code, name]) => ({
        code,
        name,
      })),
    [actions],
  );

  const statusOptions = useMemo(() => Array.from(new Set(actions.map((action) => action.status))), [actions]);

  const filteredActions = useMemo(
    () =>
      actions.filter((action) => {
        if (plantFilter !== "all" && action.plantCode !== plantFilter) {
          return false;
        }

        if (statusFilter !== "all" && action.status !== statusFilter) {
          return false;
        }

        if (dueFromFilter && action.dueDate < dueFromFilter) {
          return false;
        }

        if (dueToFilter && action.dueDate > dueToFilter) {
          return false;
        }

        return true;
      }),
    [actions, dueFromFilter, dueToFilter, plantFilter, statusFilter],
  );

  return (
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Corporate Action Plans</h2>
        </div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Factory</span>
          <select
            value={plantFilter}
            onChange={(event) => setPlantFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">All factories</option>
            {plantOptions.map((plant) => (
              <option key={plant.code} value={plant.code}>
                {plant.code} - {plant.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due from</span>
          <input
            type="date"
            value={dueFromFilter}
            onChange={(event) => setDueFromFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due to</span>
          <input
            type="date"
            value={dueToFilter}
            onChange={(event) => setDueToFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          />
        </label>
      </div>

      <div className="flex items-center justify-between px-5 py-3 text-sm text-slate-600">
        <span>{filteredActions.length} action plan(s)</span>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          onClick={() => {
            setPlantFilter("all");
            setStatusFilter("all");
            setDueFromFilter("");
            setDueToFilter("");
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Plant</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {filteredActions.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{row.plantName}</div>
                  <div className="text-xs text-slate-500">{row.plantCode}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/app/${row.plantRouteCode}/actions/${row.id}`} className="font-semibold text-teal-700 hover:underline">
                    {row.displayId}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/app/${row.plantRouteCode}/actions/${row.id}`} className="font-medium text-slate-900 hover:text-teal-700 hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.category}</td>
                <td className="px-4 py-3">{row.priority}</td>
                <td className="px-4 py-3">{row.ownerName}</td>
                <td className="px-4 py-3">{row.dueDate}</td>
                <td className="px-4 py-3">{row.evidenceCount}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getActionStatusClasses(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/app/${row.plantRouteCode}/actions/${row.id}`} className="font-semibold text-teal-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filteredActions.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                  No action plans found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
