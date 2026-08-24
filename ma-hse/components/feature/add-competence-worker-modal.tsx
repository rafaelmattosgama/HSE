"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type EmployeeOption = {
  id: string;
  employeeNo: string;
  name: string;
  dept: string | null;
};

type AreaOption = {
  id: string;
  name: string;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

export function AddCompetenceWorkerModal({
  plant,
  labels,
  employees,
  areas,
  enrolledEmployeeIds,
  onClose,
  onEnrolled,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  employees: EmployeeOption[];
  areas: AreaOption[];
  enrolledEmployeeIds: Set<string>;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [areaByEmployeeId, setAreaByEmployeeId] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const filteredEmployees = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return employees;
    return employees.filter((employee) =>
      normalizeText(employee.employeeNo).includes(query) || normalizeText(employee.name).includes(query),
    );
  }, [employees, search]);

  function toggleEmployee(employeeId: string) {
    if (enrolledEmployeeIds.has(employeeId)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  function setEmployeeArea(employeeId: string, areaId: string) {
    setAreaByEmployeeId((current) => ({ ...current, [employeeId]: areaId }));
  }

  async function submit() {
    setMessage("");

    const selected = Array.from(selectedIds);
    if (selected.length === 0) {
      setMessage(labels.enrollNoSelection);
      return;
    }

    const workers: Array<{ employeeDirectoryId: string; areaId: string }> = [];
    for (const employeeId of selected) {
      const areaId = areaByEmployeeId[employeeId];
      if (!areaId) {
        setMessage(labels.enrollMissingArea);
        return;
      }
      workers.push({ employeeDirectoryId: employeeId, areaId });
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/plants/${plant}/competences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workers }),
      });
      await requireApiResponse(response, labels.enrollError);
      onEnrolled();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.enrollError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-[2px]">
      <div className="app-panel flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{labels.addWorkerModalTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.addWorkerModalDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label={labels.cancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-6 py-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.employeeSearchPlaceholder}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {filteredEmployees.length === 0 ? (
            <p className="app-empty py-6 text-center" role="status">{labels.noEmployeesFound}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="w-10 py-2" />
                  <th className="py-2">{labels.employeeNoColumn}</th>
                  <th className="py-2">{labels.employeeNameColumn}</th>
                  <th className="py-2">{labels.employeeDeptHintColumn}</th>
                  <th className="py-2">{labels.employeeAreaColumn}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const alreadyEnrolled = enrolledEmployeeIds.has(employee.id);
                  const isSelected = selectedIds.has(employee.id);
                  return (
                    <tr key={employee.id} className={`border-t border-slate-100 ${alreadyEnrolled ? "opacity-50" : ""}`}>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={alreadyEnrolled || isSelected}
                          disabled={alreadyEnrolled}
                          onChange={() => toggleEmployee(employee.id)}
                          aria-label={employee.name}
                        />
                      </td>
                      <td className="py-2 text-slate-700">{employee.employeeNo}</td>
                      <td className="py-2 font-medium text-slate-900">
                        {employee.name}
                        {alreadyEnrolled ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            {labels.alreadyEnrolledLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-slate-500">{employee.dept ?? "—"}</td>
                      <td className="py-2">
                        <select
                          value={areaByEmployeeId[employee.id] ?? ""}
                          disabled={alreadyEnrolled || !isSelected}
                          onChange={(event) => setEmployeeArea(employee.id, event.target.value)}
                          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">{labels.areaSelectPlaceholder}</option>
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>{area.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div className="text-sm text-slate-600">
            {message ? <span className="font-medium text-rose-600">{message}</span> : formatSelectedCount(labels, selectedIds.size)}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {labels.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? labels.adding : labels.addSelected}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSelectedCount(labels: CompetencesUiDictionary, count: number) {
  return labels.selectedCountLabel.replace("{count}", String(count));
}
