"use client";

import { useState } from "react";
import { CompetenceCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

export type CompetenceTypeWire = {
  id: string;
  code: string;
  name: string;
  category: CompetenceCategory;
  requiresTraining: boolean;
  requiresAssessment: boolean;
  requiresAuthorization: boolean;
  validityMonths: number;
  refresherMonths: number | null;
  legalReference: string | null;
  displayOrder: number;
  isActive: boolean;
};

const CATEGORIES: CompetenceCategory[] = [
  CompetenceCategory.EQUIPMENT_OPERATION,
  CompetenceCategory.HIGH_RISK_ACTIVITY,
  CompetenceCategory.SAFETY_ROLE,
  CompetenceCategory.LEGAL_MANDATORY,
  CompetenceCategory.OTHER,
];

function categoryLabel(labels: CompetencesUiDictionary, category: CompetenceCategory) {
  switch (category) {
    case CompetenceCategory.EQUIPMENT_OPERATION:
      return labels.typeCategoryEquipmentOperation;
    case CompetenceCategory.HIGH_RISK_ACTIVITY:
      return labels.typeCategoryHighRiskActivity;
    case CompetenceCategory.SAFETY_ROLE:
      return labels.typeCategorySafetyRole;
    case CompetenceCategory.LEGAL_MANDATORY:
      return labels.typeCategoryLegalMandatory;
    case CompetenceCategory.OTHER:
      return labels.typeCategoryOther;
  }
}

function sortTypes(types: CompetenceTypeWire[]) {
  return [...types].sort(
    (left, right) =>
      Number(right.isActive) - Number(left.isActive) ||
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name),
  );
}

function emptyForm(displayOrder: number) {
  return {
    code: "",
    name: "",
    category: CompetenceCategory.EQUIPMENT_OPERATION as CompetenceCategory,
    requiresTraining: true,
    requiresAssessment: true,
    requiresAuthorization: true,
    validityMonths: "12",
    refresherMonths: "",
    legalReference: "",
    displayOrder: String(displayOrder),
  };
}

export function CompetenceTypeManager({
  plant,
  labels,
  initialTypes,
  readOnly,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  initialTypes: CompetenceTypeWire[];
  readOnly: boolean;
}) {
  const [types, setTypes] = useState(sortTypes(initialTypes));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(initialTypes.length));
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const endpoint = `/api/plants/${plant}/admin/competence-types`;

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm(types.length));
  }

  function startEdit(type: CompetenceTypeWire) {
    setEditingId(type.id);
    setForm({
      code: type.code,
      name: type.name,
      category: type.category,
      requiresTraining: type.requiresTraining,
      requiresAssessment: type.requiresAssessment,
      requiresAuthorization: type.requiresAuthorization,
      validityMonths: String(type.validityMonths),
      refresherMonths: type.refresherMonths != null ? String(type.refresherMonths) : "",
      legalReference: type.legalReference ?? "",
      displayOrder: String(type.displayOrder),
    });
    setMessage("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          code: form.code,
          name: form.name,
          category: form.category,
          requiresTraining: form.requiresTraining,
          requiresAssessment: form.requiresAssessment,
          requiresAuthorization: form.requiresAuthorization,
          validityMonths: Number(form.validityMonths),
          refresherMonths: form.refresherMonths.trim() ? Number(form.refresherMonths) : null,
          legalReference: form.legalReference.trim() || null,
          displayOrder: Number(form.displayOrder),
        }),
      });
      const envelope = await requireApiResponse<{ type: CompetenceTypeWire }>(response, labels.formError);
      if (envelope.data) {
        setTypes((current) => sortTypes([...current.filter((entry) => entry.id !== envelope.data!.type.id), envelope.data!.type]));
      }
      const wasEditing = Boolean(editingId);
      clearForm();
      setMessage(wasEditing ? labels.typeSavedUpdated : labels.typeSavedCreated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  async function activate(type: CompetenceTypeWire) {
    setTogglingId(type.id);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: type.id,
          code: type.code,
          name: type.name,
          category: type.category,
          requiresTraining: type.requiresTraining,
          requiresAssessment: type.requiresAssessment,
          requiresAuthorization: type.requiresAuthorization,
          validityMonths: type.validityMonths,
          refresherMonths: type.refresherMonths,
          legalReference: type.legalReference,
          displayOrder: type.displayOrder,
        }),
      });
      const envelope = await requireApiResponse<{ type: CompetenceTypeWire }>(response, labels.formError);
      if (envelope.data) {
        setTypes((current) => sortTypes(current.map((entry) => (entry.id === envelope.data!.type.id ? envelope.data!.type : entry))));
      }
      setMessage(labels.typeActivateSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setTogglingId(null);
    }
  }

  async function deactivate(type: CompetenceTypeWire) {
    if (!window.confirm(labels.typeDeactivateConfirm.replace("{code}", type.code))) {
      return;
    }

    setTogglingId(type.id);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: type.id }),
      });
      await requireApiResponse(response, labels.formError);
      setTypes((current) => sortTypes(current.map((entry) => (entry.id === type.id ? { ...entry, isActive: false } : entry))));
      if (editingId === type.id) clearForm();
      setMessage(labels.typeDeactivateSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="app-panel space-y-5 rounded-2xl p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{labels.typeManagerTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{labels.typeManagerDescription}</p>
      </div>

      {readOnly ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{labels.readOnlyCatalogNotice}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-slate-500">
              <th className="py-2">{labels.typeColumnCode}</th>
              <th className="py-2">{labels.typeColumnName}</th>
              <th className="py-2">{labels.typeColumnCategory}</th>
              <th className="py-2">{labels.typeColumnValidity}</th>
              <th className="py-2">{labels.typeColumnStatus}</th>
              {readOnly ? null : <th className="py-2">{labels.typeColumnActions}</th>}
            </tr>
          </thead>
          <tbody>
            {types.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : 6} className="app-empty py-6 text-center">{labels.typeEmptyState}</td>
              </tr>
            ) : (
              types.map((type) => (
                <tr key={type.id} className={`border-t border-slate-100 ${type.isActive ? "" : "opacity-50"}`}>
                  <td className="py-2 font-medium text-slate-900">{type.code}</td>
                  <td className="py-2 text-slate-700">{type.name}</td>
                  <td className="py-2 text-slate-700">{categoryLabel(labels, type.category)}</td>
                  <td className="py-2 text-slate-700">{type.validityMonths}</td>
                  <td className="py-2 text-slate-700">{type.isActive ? labels.typeStatusActive : labels.typeStatusInactive}</td>
                  {readOnly ? null : (
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" variant="ghost" disabled={Boolean(togglingId)} onClick={() => startEdit(type)}>
                          {labels.typeEditButton}
                        </Button>
                        {type.isActive ? (
                          <Button type="button" size="sm" variant="ghost" disabled={Boolean(togglingId)} onClick={() => void deactivate(type)}>
                            {togglingId === type.id ? labels.typeDeactivating : labels.typeDeactivateButton}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="ghost" disabled={Boolean(togglingId)} onClick={() => void activate(type)}>
                            {togglingId === type.id ? labels.typeActivating : labels.typeActivateButton}
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {message ? <p className="text-sm font-medium text-slate-600">{message}</p> : null}

      {readOnly ? null : (
        <form className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2" onSubmit={submit}>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <h3 className="text-sm font-bold text-slate-900">{editingId ? labels.typeEditTitle : labels.typeCreateTitle}</h3>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={clearForm}>
                {labels.typeCancelEdit}
              </button>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldCode}</span>
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldName}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldCategory}</span>
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CompetenceCategory }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(labels, category)}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldDisplayOrder}</span>
            <input
              type="number"
              min={0}
              value={form.displayOrder}
              onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldValidityMonths}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={form.validityMonths}
              onChange={(event) => setForm((current) => ({ ...current, validityMonths: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldRefresherMonths}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={form.refresherMonths}
              onChange={(event) => setForm((current) => ({ ...current, refresherMonths: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">{labels.typeFieldLegalReference}</span>
            <input
              value={form.legalReference}
              onChange={(event) => setForm((current) => ({ ...current, legalReference: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requiresTraining}
                onChange={(event) => setForm((current) => ({ ...current, requiresTraining: event.target.checked }))}
              />
              <span className="font-medium text-slate-700">{labels.typeFieldRequiresTraining}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requiresAssessment}
                onChange={(event) => setForm((current) => ({ ...current, requiresAssessment: event.target.checked }))}
              />
              <span className="font-medium text-slate-700">{labels.typeFieldRequiresAssessment}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requiresAuthorization}
                onChange={(event) => setForm((current) => ({ ...current, requiresAuthorization: event.target.checked }))}
              />
              <span className="font-medium text-slate-700">{labels.typeFieldRequiresAuthorization}</span>
            </label>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? labels.formSaving : editingId ? labels.typeSaveButton : labels.typeAddButton}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
