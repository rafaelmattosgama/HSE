"use client";

import { useRef } from "react";

export function DashboardDepartmentFilter({ departmentId, departments, label, allLabel, dates }: {
  departmentId: string;
  departments: Array<{ id: string; code: string; name: string }>;
  label: string;
  allLabel: string;
  dates: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} action="" className="w-full min-w-0 max-w-full sm:w-72 sm:shrink-0" data-testid="dashboard-department-filter">
    {Object.entries(dates).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
      {label}
      <select name="departmentId" defaultValue={departmentId} className="app-field h-11 w-full" onChange={() => form.current?.requestSubmit()}>
        <option value="all">{allLabel}</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.code} - {department.name}</option>)}
      </select>
    </label>
  </form>;
}
