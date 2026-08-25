"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import { computeCompetenceActionPrefill, type CompetenceActionGapInput } from "@/lib/competence-action-prefill";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

export type CompetenceActionOwnerOption = { id: string; name: string };

/**
 * §8 of docs/modulo-competencias-autorizacoes.md: category/priority/title/
 * description/level are computed (computeCompetenceActionPrefill), not
 * editable — only ownerUserId and dueDate are, matching the doc's own
 * emphasis ("ownerUserId, editável"). Posts to the existing actions
 * endpoint with sourceType COMPETENCE (§3.8 CompetenceActionLink).
 */
export function CreateCompetenceAction({
  plant,
  labels,
  competenceWorkerId,
  competenceTypeId,
  gap,
  owners,
  onCreated,
  onCancel,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  competenceWorkerId: string;
  competenceTypeId: string;
  gap: CompetenceActionGapInput;
  owners: CompetenceActionOwnerOption[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const prefill = computeCompetenceActionPrefill(gap, labels);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [dueDate, setDueDate] = useState(prefill.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categoryLabel = prefill.category === "CORRECTIVE" ? labels.actionCategoryCorrective : labels.actionCategoryPreventive;
  const priorityLabel = prefill.priority === "HIGH"
    ? labels.actionPriorityHigh
    : prefill.priority === "MEDIUM"
      ? labels.actionPriorityMedium
      : labels.actionPriorityLow;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ownerUserId) {
      setError(labels.actionSelectOwner);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/plants/${plant}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "COMPETENCE",
          competenceWorkerId,
          competenceTypeId,
          category: prefill.category,
          priority: prefill.priority,
          title: prefill.title,
          description: prefill.description,
          ownerUserId,
          level: "N3",
          dueDate: dueDate || undefined,
        }),
      });
      await requireApiResponse(response, labels.actionCreateError);
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : labels.actionCreateError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h4 className="text-sm font-semibold text-slate-900">{labels.actionSectionTitle}</h4>

      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{labels.actionTitleLabel}</p>
        <p className="text-sm text-slate-800">{prefill.title}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{labels.actionDescriptionLabel}</p>
        <p className="whitespace-pre-line text-sm text-slate-700">{prefill.description}</p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <span><span className="font-semibold">{labels.actionCategoryLabel}:</span> {categoryLabel}</span>
        <span><span className="font-semibold">{labels.actionPriorityLabel}:</span> {priorityLabel}</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">{labels.actionOwnerLabel}</span>
        <select
          value={ownerUserId}
          onChange={(event) => setOwnerUserId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        >
          <option value="">{labels.actionSelectOwner}</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>{owner.name}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">{labels.actionDueDateLabel}</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {labels.formCancel}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? labels.actionCreating : labels.actionCreate}
        </Button>
      </div>
    </form>
  );
}
