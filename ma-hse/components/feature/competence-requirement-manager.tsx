"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type ScopeType = "ROLE" | "AREA" | "WORKSTATION" | "ALL_WORKERS";

type CompetenceTypeOption = { id: string; name: string };
type AreaOption = { id: string; name: string };
type WorkstationOption = { id: string; name: string };

type RequirementWire = {
  id: string;
  competenceTypeId: string;
  competenceTypeName: string;
  scopeType: ScopeType;
  scopeRoleName: string | null;
  scopeAreaId: string | null;
  scopeAreaName: string | null;
  scopeWorkstationId: string | null;
  scopeWorkstationName: string | null;
  isMandatory: boolean;
  notes: string | null;
  isActive: boolean;
};

type CoverageWire = {
  totalRoles: number;
  rolesWithRequirement: number;
  roleNamesWithoutRequirement: string[];
  workersWithoutRoleName: number;
  totalWorkers: number;
};

type ListResponse = { requirements: RequirementWire[]; coverage: CoverageWire };

function scopeLabel(labels: CompetencesUiDictionary, scopeType: ScopeType) {
  switch (scopeType) {
    case "ROLE":
      return labels.requirementScopeRole;
    case "AREA":
      return labels.requirementScopeArea;
    case "WORKSTATION":
      return labels.requirementScopeWorkstation;
    case "ALL_WORKERS":
      return labels.requirementScopeAllWorkers;
  }
}

function scopeValueLabel(requirement: RequirementWire) {
  switch (requirement.scopeType) {
    case "ROLE":
      return requirement.scopeRoleName ?? "—";
    case "AREA":
      return requirement.scopeAreaName ?? requirement.scopeAreaId ?? "—";
    case "WORKSTATION":
      return requirement.scopeWorkstationName ?? requirement.scopeWorkstationId ?? "—";
    case "ALL_WORKERS":
      return "—";
  }
}

export function CompetenceRequirementManager({
  plant,
  labels,
  competenceTypes,
  areas,
  workstations,
  initialRequirements,
  initialCoverage,
  readOnly = false,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  competenceTypes: CompetenceTypeOption[];
  areas: AreaOption[];
  workstations: WorkstationOption[];
  initialRequirements: RequirementWire[];
  initialCoverage: CoverageWire;
  readOnly?: boolean;
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [competenceTypeId, setCompetenceTypeId] = useState(competenceTypes[0]?.id ?? "");
  const [scopeType, setScopeType] = useState<ScopeType>("ROLE");
  const [scopeRoleName, setScopeRoleName] = useState("");
  const [scopeAreaId, setScopeAreaId] = useState("");
  const [scopeWorkstationId, setScopeWorkstationId] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const endpoint = `/api/plants/${plant}/admin/competence-requirements`;

  async function reload() {
    const response = await fetch(endpoint);
    const envelope = await requireApiResponse<ListResponse>(response, labels.formError);
    if (envelope.data) {
      setRequirements(envelope.data.requirements);
      setCoverage(envelope.data.coverage);
    }
  }

  async function submitNewRule(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!competenceTypeId) {
      setError(labels.requirementSelectCompetence);
      return;
    }
    if (scopeType === "ROLE" && !scopeRoleName.trim()) {
      setError(labels.requirementScopeRoleNameLabel);
      return;
    }
    if (scopeType === "AREA" && !scopeAreaId) {
      setError(labels.requirementSelectArea);
      return;
    }
    if (scopeType === "WORKSTATION" && !scopeWorkstationId) {
      setError(labels.requirementSelectWorkstation);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competenceTypeId,
          scopeType,
          scopeRoleName: scopeType === "ROLE" ? scopeRoleName.trim() : null,
          scopeAreaId: scopeType === "AREA" ? scopeAreaId : null,
          scopeWorkstationId: scopeType === "WORKSTATION" ? scopeWorkstationId : null,
          isMandatory,
          notes: notes.trim() || null,
        }),
      });
      await requireApiResponse(response, labels.formError);
      setScopeRoleName("");
      setScopeAreaId("");
      setScopeWorkstationId("");
      setNotes("");
      await reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await requireApiResponse(response, labels.formError);
      await reload();
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-panel space-y-5 rounded-2xl p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{labels.requirementManagerTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{labels.requirementManagerDescription}</p>
      </div>

      {readOnly ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{labels.readOnlyCatalogNotice}</p> : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="app-section-eyebrow">{labels.requirementCoverageTitle}</h3>
        {coverage.totalRoles === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{labels.requirementCoverageNone}</p>
        ) : (
          <p className="mt-2 text-sm text-slate-700">
            {labels.requirementCoverageSummary
              .replace("{covered}", String(coverage.rolesWithRequirement))
              .replace("{total}", String(coverage.totalRoles))}
          </p>
        )}
        {coverage.roleNamesWithoutRequirement.length > 0 ? (
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.requirementMissingRolesTitle}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {coverage.roleNamesWithoutRequirement.map((roleName) => (
                <li key={roleName} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {roleName}
                </li>
              ))}
            </ul>
          </div>
        ) : coverage.totalRoles > 0 ? (
          <p className="mt-2 text-sm text-emerald-700">{labels.requirementMissingRolesEmpty}</p>
        ) : null}
        {coverage.workersWithoutRoleName > 0 ? (
          <p className="mt-3 text-sm font-medium text-rose-600">
            {labels.requirementRoleWarning.replace("{count}", String(coverage.workersWithoutRoleName))}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-slate-500">
              <th className="py-2">{labels.requirementColumnCompetence}</th>
              <th className="py-2">{labels.requirementColumnScope}</th>
              <th className="py-2">{labels.requirementColumnValue}</th>
              <th className="py-2">{labels.requirementColumnMandatory}</th>
              <th className="py-2">{labels.requirementColumnStatus}</th>
              {readOnly ? null : <th className="py-2">{labels.requirementColumnActions}</th>}
            </tr>
          </thead>
          <tbody>
            {requirements.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : 6} className="app-empty py-6 text-center">{labels.requirementEmptyState}</td>
              </tr>
            ) : (
              requirements.map((requirement) => (
                <tr key={requirement.id} className={`border-t border-slate-100 ${requirement.isActive ? "" : "opacity-50"}`}>
                  <td className="py-2 font-medium text-slate-900">{requirement.competenceTypeName}</td>
                  <td className="py-2 text-slate-700">{scopeLabel(labels, requirement.scopeType)}</td>
                  <td className="py-2 text-slate-700">{scopeValueLabel(requirement)}</td>
                  <td className="py-2 text-slate-700">{requirement.isMandatory ? "✓" : "—"}</td>
                  <td className="py-2 text-slate-700">
                    {requirement.isActive ? labels.requirementStatusActive : labels.requirementStatusInactive}
                  </td>
                  {readOnly ? null : (
                    <td className="py-2">
                      {requirement.isActive ? (
                        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => deactivate(requirement.id)}>
                          {labels.requirementDeactivateButton}
                        </Button>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      {readOnly ? null : (
      <form className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2" onSubmit={submitNewRule}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{labels.requirementCompetenceTypeLabel}</span>
          <select
            value={competenceTypeId}
            onChange={(event) => setCompetenceTypeId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{labels.requirementSelectCompetence}</option>
            {competenceTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{labels.requirementScopeLabel}</span>
          <select
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value as ScopeType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ROLE">{labels.requirementScopeRole}</option>
            <option value="AREA">{labels.requirementScopeArea}</option>
            <option value="WORKSTATION">{labels.requirementScopeWorkstation}</option>
            <option value="ALL_WORKERS">{labels.requirementScopeAllWorkers}</option>
          </select>
        </label>

        {scopeType === "ROLE" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">{labels.requirementScopeRoleNameLabel}</span>
            <input
              type="text"
              value={scopeRoleName}
              onChange={(event) => setScopeRoleName(event.target.value)}
              placeholder={labels.requirementScopeRoleNamePlaceholder}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        {scopeType === "AREA" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">{labels.requirementScopeArea}</span>
            <select
              value={scopeAreaId}
              onChange={(event) => setScopeAreaId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{labels.requirementSelectArea}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {scopeType === "WORKSTATION" ? (
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">{labels.requirementScopeWorkstation}</span>
            <select
              value={scopeWorkstationId}
              onChange={(event) => setScopeWorkstationId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{labels.requirementSelectWorkstation}</option>
              {workstations.map((workstation) => (
                <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isMandatory} onChange={(event) => setIsMandatory(event.target.checked)} />
          <span className="font-medium text-slate-700">{labels.requirementMandatoryLabel}</span>
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">{labels.requirementNotesLabel}</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
        </label>

        <div className="md:col-span-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? labels.formSaving : labels.requirementAddButton}
          </Button>
        </div>
      </form>
      )}
    </section>
  );
}
