"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import {
  AlertTriangle,
  BarChart3,
  Ban,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Minus,
  PauseCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AddCompetenceWorkerModal } from "@/components/feature/add-competence-worker-modal";
import { CompetenceCellDetailPanel } from "@/components/feature/competence-cell-detail-panel";
import type { CompetenceActionOwnerOption } from "@/components/feature/create-competence-action";
import { AppHero, AppKpiCard, AppPanel } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { formatCompetenceCellText } from "@/lib/competence-cell-text";
import type { CompetenceMatrixView } from "@/lib/services/competence-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type EmployeeOption = { id: string; employeeNo: string; name: string; dept: string | null };
type AreaOption = { id: string; name: string };

async function readExportError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as { message?: string } | null;
    return json?.message ?? `${fallback} (${response.status})`;
  }
  return `${fallback} (${response.status})`;
}

export type StateKey = keyof Pick<
  CompetencesUiDictionary,
  | "stateValid"
  | "stateExpiring"
  | "stateExpired"
  | "stateMissing"
  | "stateAwaitingAssessment"
  | "stateAwaitingAuthorization"
  | "stateSuspended"
  | "stateRevoked"
  | "stateNotApplicable"
>;

export const STATE_META: Record<string, { icon: typeof CheckCircle2; badgeClass: string; labelKey: StateKey }> = {
  VALID: { icon: CheckCircle2, badgeClass: "bg-emerald-100 text-emerald-700", labelKey: "stateValid" },
  EXPIRING: { icon: Clock3, badgeClass: "bg-amber-100 text-amber-700", labelKey: "stateExpiring" },
  EXPIRED: { icon: XCircle, badgeClass: "bg-red-100 text-red-700", labelKey: "stateExpired" },
  MISSING: { icon: AlertTriangle, badgeClass: "bg-red-100 text-red-700", labelKey: "stateMissing" },
  AWAITING_ASSESSMENT: { icon: HelpCircle, badgeClass: "bg-sky-100 text-sky-700", labelKey: "stateAwaitingAssessment" },
  AWAITING_AUTHORIZATION: { icon: ShieldCheck, badgeClass: "bg-sky-100 text-sky-700", labelKey: "stateAwaitingAuthorization" },
  SUSPENDED: { icon: PauseCircle, badgeClass: "bg-red-100 text-red-700", labelKey: "stateSuspended" },
  REVOKED: { icon: Ban, badgeClass: "bg-red-100 text-red-700", labelKey: "stateRevoked" },
  NOT_APPLICABLE: { icon: Minus, badgeClass: "bg-slate-100 text-slate-500", labelKey: "stateNotApplicable" },
};

const ALL_STATES = Object.keys(STATE_META);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

type ActiveCell = {
  competenceWorkerId: string;
  competenceTypeId: string;
  competenceTypeName: string;
  workerName: string;
};

export function CompetenceMatrixManager({
  plant,
  title,
  labels,
  matrix,
  employees,
  areas,
  owners,
  viewerRole,
}: {
  plant: string;
  title: string;
  labels: CompetencesUiDictionary;
  matrix: CompetenceMatrixView;
  employees: EmployeeOption[];
  areas: AreaOption[];
  owners: CompetenceActionOwnerOption[];
  viewerRole: RoleCode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<Set<string>>(new Set());
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const enrolledEmployeeIds = useMemo(
    () => new Set(matrix.workers.map((worker) => worker.employeeDirectoryId)),
    [matrix.workers],
  );

  const departmentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    matrix.workers.forEach((worker) => {
      if (worker.areaId && worker.areaName) seen.set(worker.areaId, worker.areaName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [matrix.workers]);

  const roleOptions = useMemo(() => {
    const seen = new Set<string>();
    matrix.workers.forEach((worker) => {
      if (worker.roleName) seen.add(worker.roleName);
    });
    return Array.from(seen).sort();
  }, [matrix.workers]);

  const kpis = useMemo(() => {
    let expired = 0;
    let expiring30 = 0;
    let expiring60 = 0;
    let expiring90 = 0;
    let awaitingAssessment = 0;
    let awaitingAuthorization = 0;
    let criticalGaps = 0;
    const coverageByType = new Map<string, { required: number; authorized: number }>();
    matrix.competenceTypes.forEach((type) => coverageByType.set(type.id, { required: 0, authorized: 0 }));

    matrix.workers.forEach((worker) => {
      worker.cells.forEach((cell) => {
        if (cell.state === "EXPIRED") expired += 1;
        if (cell.state === "EXPIRING" && cell.daysToExpiry != null) {
          if (cell.daysToExpiry <= 30) expiring30 += 1;
          else if (cell.daysToExpiry <= 60) expiring60 += 1;
          else expiring90 += 1;
        }
        if (cell.state === "AWAITING_ASSESSMENT") awaitingAssessment += 1;
        if (cell.state === "AWAITING_AUTHORIZATION") awaitingAuthorization += 1;
        if (cell.isRequired && cell.state === "MISSING") criticalGaps += 1;

        const bucket = coverageByType.get(cell.competenceTypeId);
        if (bucket && cell.isRequired) {
          bucket.required += 1;
          if (cell.state === "VALID" || cell.state === "EXPIRING") bucket.authorized += 1;
        }
      });
    });

    const coverage = matrix.competenceTypes.map((type) => {
      const bucket = coverageByType.get(type.id) ?? { required: 0, authorized: 0 };
      const percentage = bucket.required > 0 ? Math.round((bucket.authorized / bucket.required) * 100) : null;
      return { typeId: type.id, name: type.name, percentage, required: bucket.required, authorized: bucket.authorized };
    });

    return { expired, expiring30, expiring60, expiring90, awaitingAssessment, awaitingAuthorization, criticalGaps, coverage };
  }, [matrix]);

  const filteredWorkers = useMemo(() => {
    const query = normalizeText(search);
    return matrix.workers.filter((worker) => {
      if (query && !normalizeText(worker.name).includes(query) && !normalizeText(worker.employeeNo).includes(query)) {
        return false;
      }
      if (departmentFilter && worker.areaId !== departmentFilter) return false;
      if (roleFilter && worker.roleName !== roleFilter) return false;

      const relevantCells = competenceFilter
        ? worker.cells.filter((cell) => cell.competenceTypeId === competenceFilter)
        : worker.cells;

      if (stateFilter.size > 0 && !relevantCells.some((cell) => stateFilter.has(cell.state))) return false;
      if (mandatoryOnly && !relevantCells.some((cell) => cell.isRequired)) return false;

      return true;
    });
  }, [matrix.workers, search, departmentFilter, roleFilter, competenceFilter, stateFilter, mandatoryOnly]);

  function toggleStateFilter(state: string) {
    setStateFilter((current) => {
      const next = new Set(current);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  }

  function focusState(state: string, opts?: { mandatoryOnly?: boolean }) {
    setStateFilter(new Set([state]));
    if (opts?.mandatoryOnly) setMandatoryOnly(true);
  }

  function clearFilters() {
    setSearch("");
    setDepartmentFilter("");
    setRoleFilter("");
    setCompetenceFilter("");
    setStateFilter(new Set());
    setMandatoryOnly(false);
  }

  const canExport = viewerRole === "N0_ADMIN"
    || viewerRole === "N1_CORPORATE"
    || viewerRole === "N2_PLANT_MANAGER"
    || viewerRole === "N3_SAFETY"
    || viewerRole === "N4_SUPERVISOR";

  async function exportFiltered() {
    setExporting(true);
    setExportError("");
    try {
      const columns = [
        { key: "no", header: labels.columnNumber },
        { key: "worker", header: labels.columnWorker },
        { key: "department", header: labels.columnDepartment },
        { key: "role", header: labels.columnRole },
        ...matrix.competenceTypes.map((type) => ({ key: type.id, header: type.name })),
      ];
      const rows = filteredWorkers.map((worker, index) => {
        const row: Record<string, string> = {
          no: String(index + 1),
          worker: worker.name,
          department: worker.areaName ?? worker.deptFallback ?? "—",
          role: worker.roleName ?? "—",
        };
        worker.cells.forEach((cell) => {
          row[cell.competenceTypeId] = formatCompetenceCellText(cell, labels);
        });
        return row;
      });

      const response = await fetch(`/api/plants/${plant}/competences/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns, rows }),
      });

      if (!response.ok) {
        throw new Error(await readExportError(response, labels.formError));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "competencias_matriz.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : labels.formError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AppHero
        title={title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canExport ? (
              <Button type="button" variant="secondary" onClick={() => void exportFiltered()} disabled={exporting}>
                {exporting ? labels.matrixExporting : labels.matrixExportButton}
              </Button>
            ) : null}
            <Button type="button" onClick={() => setModalOpen(true)}>{labels.addWorker}</Button>
          </div>
        }
      />
      {exportError ? <p className="text-sm font-medium text-rose-600">{exportError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <button type="button" className="text-left" onClick={() => focusState("EXPIRED")}>
          <AppKpiCard tone="danger" icon={<XCircle className="h-5 w-5" aria-hidden="true" />} label={labels.kpiExpiredTitle} value={kpis.expired} />
        </button>
        <button type="button" className="text-left" onClick={() => focusState("EXPIRING")}>
          <AppKpiCard
            tone="warning"
            icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
            label={labels.kpiExpiringTitle}
            value={kpis.expiring30 + kpis.expiring60 + kpis.expiring90}
            detail={`${labels.kpiExpiring30Label}: ${kpis.expiring30} · ${labels.kpiExpiring60Label}: ${kpis.expiring60} · ${labels.kpiExpiring90Label}: ${kpis.expiring90}`}
          />
        </button>
        <button type="button" className="text-left" onClick={() => focusState("AWAITING_ASSESSMENT")}>
          <AppKpiCard
            tone="info"
            icon={<HelpCircle className="h-5 w-5" aria-hidden="true" />}
            label={labels.kpiAwaitingAssessmentTitle}
            value={kpis.awaitingAssessment}
          />
        </button>
        <button type="button" className="text-left" onClick={() => focusState("AWAITING_AUTHORIZATION")}>
          <AppKpiCard
            tone="info"
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            label={labels.kpiAwaitingAuthorizationTitle}
            value={kpis.awaitingAuthorization}
          />
        </button>
        <button type="button" className="text-left" onClick={() => focusState("MISSING", { mandatoryOnly: true })}>
          <AppKpiCard
            tone="danger"
            icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            label={labels.kpiCriticalGapsTitle}
            value={kpis.criticalGaps}
            detail={labels.kpiCriticalGapsDetail}
          />
        </button>
        <AppKpiCard
          tone="brand"
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          label={labels.kpiCoverageTitle}
          value={
            kpis.coverage.length === 0 ? (
              labels.kpiCoverageEmpty
            ) : (
              <span className="sr-only">{labels.kpiCoverageTitle}</span>
            )
          }
          detail={
            kpis.coverage.length === 0 ? null : (
              <div className="mt-1 space-y-1">
                {kpis.coverage.map((row) => (
                  <button
                    key={row.typeId}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left text-xs text-slate-600 hover:text-slate-900"
                    onClick={() => setCompetenceFilter(row.typeId)}
                  >
                    <span className="truncate">{row.name}</span>
                    <span className="shrink-0 font-semibold">
                      {row.percentage === null ? "—" : labels.kpiCoverageBarLabel.replace("{percentage}", String(row.percentage)).replace("{required}", String(row.required))}
                    </span>
                  </button>
                ))}
              </div>
            )
          }
        />
      </div>

      <AppPanel>
        <h2 className="app-section-eyebrow">{labels.legendTitle}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_STATES.map((state) => {
            const meta = STATE_META[state];
            const Icon = meta.icon;
            return (
              <span
                key={state}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {labels[meta.labelKey]}
              </span>
            );
          })}
        </div>
      </AppPanel>

      <AppPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchWorkerPlaceholder}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.departmentFilterAll}</option>
            {departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.roleFilterAll}</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <select
            value={competenceFilter}
            onChange={(event) => setCompetenceFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.competenceFilterAll}</option>
            {matrix.competenceTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mandatoryOnly} onChange={(event) => setMandatoryOnly(event.target.checked)} />
            {labels.mandatoryOnlyLabel}
          </label>
          <Button type="button" variant="ghost" onClick={clearFilters}>{labels.clearFiltersLabel}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{labels.stateFilterLabel}:</span>
          {ALL_STATES.map((state) => {
            const meta = STATE_META[state];
            const active = stateFilter.has(state);
            return (
              <button
                key={state}
                type="button"
                onClick={() => toggleStateFilter(state)}
                aria-pressed={active}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? meta.badgeClass : "border border-slate-300 bg-white text-slate-500"}`}
              >
                {labels[meta.labelKey]}
              </button>
            );
          })}
        </div>
      </AppPanel>

      <AppPanel>
        {matrix.competenceTypes.length === 0 ? (
          <div className="app-empty py-10 text-center" role="status">
            <p className="font-semibold text-slate-700">{labels.catalogEmptyTitle}</p>
            <p className="mt-1">{labels.catalogEmptyDescription}</p>
            {viewerRole === "N1_CORPORATE" || viewerRole === "N3_SAFETY" ? (
              <Link href={`/app/${plant}/admin`} className="mt-3 inline-block font-semibold text-emerald-700 hover:underline">
                {labels.catalogEmptyLink}
              </Link>
            ) : null}
          </div>
        ) : filteredWorkers.length === 0 ? (
          <p className="app-empty py-10 text-center" role="status">
            {matrix.workers.length === 0 ? labels.noWorkersEnrolled : labels.noResultsForFilters}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-3">{labels.columnNumber}</th>
                  <th className="py-2 pr-3">{labels.columnWorker}</th>
                  <th className="py-2 pr-3">{labels.columnDepartment}</th>
                  <th className="py-2 pr-3">{labels.columnRole}</th>
                  {matrix.competenceTypes.map((type) => (
                    <th key={type.id} className="py-2 pr-3">{type.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 text-slate-500">{worker.employeeNo}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      <Link href={`/app/${plant}/competences/${worker.id}`} className="hover:underline">
                        {worker.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{worker.areaName ?? worker.deptFallback ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{worker.roleName ?? "—"}</td>
                    {worker.cells.map((cell) => {
                      const meta = STATE_META[cell.state];
                      const Icon = meta.icon;
                      const cellText = formatCompetenceCellText(cell, labels);
                      const type = matrix.competenceTypes.find((candidate) => candidate.id === cell.competenceTypeId);
                      return (
                        <td key={cell.competenceTypeId} className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCell({
                                competenceWorkerId: worker.id,
                                competenceTypeId: cell.competenceTypeId,
                                competenceTypeName: type?.name ?? cell.competenceTypeId,
                                workerName: worker.name,
                              })
                            }
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
                            aria-label={`${cellText} — ${worker.name}`}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {cellText}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppPanel>

      {modalOpen ? (
        <AddCompetenceWorkerModal
          plant={plant}
          labels={labels}
          employees={employees}
          areas={areas}
          enrolledEmployeeIds={enrolledEmployeeIds}
          onClose={() => setModalOpen(false)}
          onEnrolled={() => {
            window.location.reload();
          }}
        />
      ) : null}

      {activeCell ? (
        <CompetenceCellDetailPanel
          plant={plant}
          labels={labels}
          viewerRole={viewerRole}
          competenceWorkerId={activeCell.competenceWorkerId}
          competenceTypeId={activeCell.competenceTypeId}
          competenceTypeName={activeCell.competenceTypeName}
          workerName={activeCell.workerName}
          owners={owners}
          onClose={() => setActiveCell(null)}
          onChanged={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}
