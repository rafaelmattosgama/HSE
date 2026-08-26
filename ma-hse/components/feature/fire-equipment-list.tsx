"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FireChecklistResult, FireComplianceCellState } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Clock3, Download, Minus, Printer, Tag, XCircle } from "lucide-react";
import { AddFireEquipmentModal } from "@/components/feature/add-fire-equipment-modal";
import {
  CreateFireEquipmentAction,
  type FireEquipmentActionOwnerOption,
  type FireEquipmentActionReasonOption,
} from "@/components/feature/create-fire-equipment-action";
import { FireEquipmentTagScanButton } from "@/components/feature/fire-equipment-tag-scan-button";
import { AppHero, AppKpiCard, AppPanel } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { formatFireComplianceCellText } from "@/lib/fire-compliance-cell-text";
import type { FireEquipmentActionContext } from "@/lib/fire-equipment-action-prefill";
import type { FireEquipmentKpis, FireEquipmentListRow, FireEquipmentTypeOption } from "@/lib/services/fire-equipment-service";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type AreaOption = { id: string; name: string };
type WorkstationOption = { id: string; name: string };

export const FIRE_COMPLIANCE_STATE_META: Record<
  FireComplianceCellState,
  { icon: typeof CheckCircle2; badgeClass: string }
> = {
  VALID: { icon: CheckCircle2, badgeClass: "bg-emerald-100 text-emerald-700" },
  DUE_SOON: { icon: Clock3, badgeClass: "bg-amber-100 text-amber-700" },
  OVERDUE: { icon: XCircle, badgeClass: "bg-red-100 text-red-700" },
  NEVER_DONE: { icon: AlertTriangle, badgeClass: "bg-red-100 text-red-700" },
  NOT_APPLICABLE: { icon: Minus, badgeClass: "bg-slate-100 text-slate-500" },
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

function CellBadge({ state, dueDate, labels }: { state: FireComplianceCellState; dueDate: Date | null; labels: FireEquipmentUiDictionary }) {
  const meta = FIRE_COMPLIANCE_STATE_META[state];
  const Icon = meta.icon;
  const text = formatFireComplianceCellText({ state, dueDate }, labels);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

type QuickFilter = "quarterlyOverdue" | "annualOverdue" | "dueSoon" | "openNonConformity" | null;

/**
 * §9, "linha do dashboard" entry point: the list row only knows the two
 * periodicity states plus hasOpenNonConformity (a boolean, §6's own
 * simplification pending §9's own Action linkage) — not which checklist
 * items failed. That item-level detail is only available from the
 * equipment profile's execution history (fire-equipment-profile.tsx).
 * hasOpenNonConformity is only ever true when the most recent execution's
 * overallResult was FAILED (fire-equipment-service.ts's own definition), so
 * FAILED is not a guess here.
 */
function buildRowActionReasons(row: FireEquipmentListRow, labels: FireEquipmentUiDictionary): FireEquipmentActionReasonOption[] {
  const reasons: FireEquipmentActionReasonOption[] = [];
  if (row.quarterly.state === FireComplianceCellState.OVERDUE) {
    reasons.push({
      reason: { kind: "OVERDUE", frequency: "QUARTERLY", dueDate: row.quarterly.dueDate },
      label: `${labels.actionReasonOverduePrefix} ${labels.profileQuarterlyLabel}`,
    });
  }
  if (row.annual.state === FireComplianceCellState.OVERDUE) {
    reasons.push({
      reason: { kind: "OVERDUE", frequency: "ANNUAL", dueDate: row.annual.dueDate },
      label: `${labels.actionReasonOverduePrefix} ${labels.profileAnnualLabel}`,
    });
  }
  if (row.hasOpenNonConformity) {
    reasons.push({
      reason: { kind: "NON_CONFORMITY", overallResult: FireChecklistResult.FAILED, nokItems: [] },
      label: labels.actionReasonNonConformity,
    });
  }
  return reasons;
}

export function FireEquipmentList({
  plant,
  title,
  labels,
  types,
  equipment,
  kpis,
  areas,
  workstations,
  owners,
}: {
  plant: string;
  title: string;
  labels: FireEquipmentUiDictionary;
  types: FireEquipmentTypeOption[];
  equipment: FireEquipmentListRow[];
  kpis: FireEquipmentKpis;
  areas: AreaOption[];
  workstations: WorkstationOption[];
  owners: FireEquipmentActionOwnerOption[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [onlyWithoutTag, setOnlyWithoutTag] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [actionTarget, setActionTarget] = useState<{
    fireEquipmentId: string;
    context: FireEquipmentActionContext;
    reasons: FireEquipmentActionReasonOption[];
  } | null>(null);

  const filteredEquipment = useMemo(() => {
    const query = normalizeText(search);
    return equipment.filter((row) => {
      if (typeFilter && row.fireEquipmentTypeId !== typeFilter) return false;
      if (areaFilter && row.areaId !== areaFilter) return false;
      if (onlyWithoutTag && row.tag) return false;
      if (quickFilter === "quarterlyOverdue" && row.quarterly.state !== FireComplianceCellState.OVERDUE) return false;
      if (quickFilter === "annualOverdue" && row.annual.state !== FireComplianceCellState.OVERDUE) return false;
      if (
        quickFilter === "dueSoon"
        && row.quarterly.state !== FireComplianceCellState.DUE_SOON
        && row.annual.state !== FireComplianceCellState.DUE_SOON
      ) {
        return false;
      }
      if (quickFilter === "openNonConformity" && !row.hasOpenNonConformity) return false;
      if (
        query
        && !normalizeText(row.internalCode).includes(query)
        && !normalizeText(row.locationDescription ?? "").includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [equipment, search, typeFilter, areaFilter, quickFilter, onlyWithoutTag]);

  function clearFilters() {
    setSearch("");
    setTypeFilter("");
    setAreaFilter("");
    setQuickFilter(null);
    setOnlyWithoutTag(false);
  }

  function toggleQuickFilter(next: QuickFilter) {
    setQuickFilter((current) => (current === next ? null : next));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredEquipment.map((row) => row.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : filteredIds);
  }

  function printSelectedLabels() {
    if (selectedIds.length === 0) return;
    const anchor = selectedIds[0];
    window.open(`/api/plants/${plant}/fire-equipment/${anchor}/tag/pdf?ids=${selectedIds.join(",")}`, "_blank");
  }

  /** §9: server-side computed columns, mirroring actions-table.tsx's exportFiltered — client sends the already-filtered, already-formatted rows. */
  async function exportFiltered() {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: filteredEquipment.map((row) => ({
            code: row.internalCode,
            type: row.fireEquipmentTypeName,
            location: [row.areaName, row.workstationName, row.locationDescription].filter(Boolean).join(" — ") || "—",
            status: row.status,
            quarterlyState: formatFireComplianceCellText({ state: row.quarterly.state, dueDate: row.quarterly.dueDate }, labels),
            annualState: formatFireComplianceCellText({ state: row.annual.state, dueDate: row.annual.dueDate }, labels),
            hasOpenNonConformity: row.hasOpenNonConformity ? labels.openNonConformityBadge : "",
            tag: row.tag?.tagCode ?? labels.tagNone,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(labels.exportError);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "equipamentos_incendio.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : labels.exportError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AppHero
        title={title}
        actions={
          <>
            <FireEquipmentTagScanButton mode="read" labels={labels} />
            <Button type="button" variant="ghost" onClick={() => void exportFiltered()} disabled={exporting}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting ? labels.exporting : labels.exportXlsx}
            </Button>
            <Button type="button" variant="ghost" onClick={printSelectedLabels} disabled={selectedIds.length === 0}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {labels.printSelectedLabels}
            </Button>
            <Button type="button" onClick={() => setModalOpen(true)}>{labels.addEquipment}</Button>
          </>
        }
      />
      {exportError ? <p className="text-sm text-rose-600">{exportError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <button type="button" className="text-left" onClick={() => toggleQuickFilter("quarterlyOverdue")}>
          <AppKpiCard
            label={labels.kpiQuarterlyOverdueTitle}
            value={kpis.quarterlyOverdueCount}
            tone={kpis.quarterlyOverdueCount > 0 ? "danger" : "default"}
            className={quickFilter === "quarterlyOverdue" ? "ring-2 ring-offset-1" : undefined}
          />
        </button>
        <button type="button" className="text-left" onClick={() => toggleQuickFilter("annualOverdue")}>
          <AppKpiCard
            label={labels.kpiAnnualOverdueTitle}
            value={kpis.annualOverdueCount}
            tone={kpis.annualOverdueCount > 0 ? "danger" : "default"}
            className={quickFilter === "annualOverdue" ? "ring-2 ring-offset-1" : undefined}
          />
        </button>
        <button type="button" className="text-left" onClick={() => toggleQuickFilter("dueSoon")}>
          <AppKpiCard
            label={labels.kpiDueSoonTitle}
            value={kpis.dueSoonCount}
            tone={kpis.dueSoonCount > 0 ? "warning" : "default"}
            className={quickFilter === "dueSoon" ? "ring-2 ring-offset-1" : undefined}
          />
        </button>
        <button type="button" className="text-left" onClick={() => toggleQuickFilter("openNonConformity")}>
          <AppKpiCard
            label={labels.kpiOpenNonConformitiesTitle}
            value={kpis.openNonConformityCount}
            tone={kpis.openNonConformityCount > 0 ? "danger" : "default"}
            className={quickFilter === "openNonConformity" ? "ring-2 ring-offset-1" : undefined}
          />
        </button>
        <AppKpiCard label={labels.kpiNoTagTitle} value={kpis.noTagAssignedCount} tone="default" />
        <AppPanel className="sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <p className="app-kpi-card__label">{labels.kpiCoverageByTypeTitle}</p>
          {kpis.coverageByType.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{labels.kpiCoverageByTypeEmpty}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {kpis.coverageByType.map((coverage) => (
                <li key={coverage.fireEquipmentTypeId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{coverage.fireEquipmentTypeName}</span>
                  <span className="font-semibold text-slate-900">
                    {coverage.compliantPercent === null ? "—" : `${coverage.compliantPercent}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AppPanel>
      </div>

      <AppPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.typeFilterAll}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
          <select
            value={areaFilter}
            onChange={(event) => setAreaFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.areaFilterAll}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <Button type="button" variant="ghost" onClick={clearFilters}>{labels.clearFiltersLabel}</Button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyWithoutTag} onChange={(event) => setOnlyWithoutTag(event.target.checked)} />
          {labels.tagFilterOnlyWithoutTag}
        </label>
      </AppPanel>

      <AppPanel>
        {filteredEquipment.length === 0 ? (
          <p className="app-empty py-10 text-center" role="status">
            {equipment.length === 0 ? labels.noEquipmentFound : labels.noResultsForFilters}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={filteredEquipment.length > 0 && filteredEquipment.every((row) => selectedIds.includes(row.id))}
                      onChange={toggleSelectAllFiltered}
                      aria-label={labels.printSelectedLabels}
                    />
                  </th>
                  <th className="py-2 pr-3">{labels.columnCode}</th>
                  <th className="py-2 pr-3">{labels.columnType}</th>
                  <th className="py-2 pr-3">{labels.columnLocation}</th>
                  <th className="py-2 pr-3">{labels.columnQuarterlyState}</th>
                  <th className="py-2 pr-3">{labels.columnAnnualState}</th>
                  <th className="py-2 pr-3">{labels.tagColumnLabel}</th>
                  <th className="py-2 pr-3">{labels.actionColumnLabel}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipment.map((row) => {
                  const rowActionReasons = buildRowActionReasons(row, labels);
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={row.internalCode}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Link href={`/app/${plant}/fire-equipment/${row.id}`} className="font-medium text-slate-900 hover:underline">
                          {row.internalCode}
                        </Link>
                        {row.hasOpenNonConformity ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {labels.openNonConformityBadge}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{row.fireEquipmentTypeName}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {[row.areaName, row.workstationName, row.locationDescription].filter(Boolean).join(" — ") || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <CellBadge state={row.quarterly.state} dueDate={row.quarterly.dueDate} labels={labels} />
                      </td>
                      <td className="py-2 pr-3">
                        <CellBadge state={row.annual.state} dueDate={row.annual.dueDate} labels={labels} />
                      </td>
                      <td className="py-2 pr-3">
                        {row.tag ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                            {row.tag.tagCode}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{labels.tagNone}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {rowActionReasons.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActionTarget({
                              fireEquipmentId: row.id,
                              context: { equipmentInternalCode: row.internalCode, equipmentTypeName: row.fireEquipmentTypeName, areaName: row.areaName },
                              reasons: rowActionReasons,
                            })}
                            className="text-xs font-semibold text-slate-600 hover:underline"
                          >
                            {labels.actionButtonLabel}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AppPanel>

      {modalOpen ? (
        <AddFireEquipmentModal
          plant={plant}
          labels={labels}
          types={types}
          workstations={workstations}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            window.location.reload();
          }}
        />
      ) : null}

      {actionTarget ? (
        <AppPanel>
          <CreateFireEquipmentAction
            plant={plant}
            labels={labels}
            fireEquipmentId={actionTarget.fireEquipmentId}
            context={actionTarget.context}
            reasons={actionTarget.reasons}
            owners={owners}
            onCreated={() => window.location.reload()}
            onCancel={() => setActionTarget(null)}
          />
        </AppPanel>
      ) : null}
    </div>
  );
}
