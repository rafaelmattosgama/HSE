"use client";

import { Button } from "@/components/ui/button";
import type { HistoryEventWire } from "@/components/feature/competence-cell-detail-panel";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type EditableRecord = Extract<HistoryEventWire, { type: "TRAINING" | "ASSESSMENT" | "AUTHORIZATION_GRANTED" }>;
type Field = { name: string; label: string; value: string | number | null; type?: string; required?: boolean; options?: [string, string][] };

export function CompetenceRecordEditForm({ record, labels, saving, onSubmit, onCancel }: {
  record: EditableRecord;
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const date = (value: string | null) => value?.slice(0, 10) ?? "";
  const fields: Field[] = record.type === "TRAINING" ? [
    { name: "completedAt", label: labels.formCompletedAt, type: "date", value: date(record.occurredAt), required: true },
    { name: "certificateExpiresAt", label: labels.formCertificateExpiresAt, type: "date", value: date(record.certificateExpiresAt) },
    { name: "result", label: labels.formTrainingResult, value: record.result, options: [["PASSED", labels.trainingResultPassed], ["FAILED", labels.trainingResultFailed]] },
    { name: "provider", label: labels.formProvider, value: record.provider },
    { name: "trainerName", label: labels.formTrainerName, value: record.trainerName },
    { name: "durationHours", label: labels.formDurationHours, type: "number", value: record.durationHours },
    { name: "certificateNumber", label: labels.formCertificateNumber, value: record.certificateNumber },
    { name: "notes", label: labels.formNotes, type: "textarea", value: record.notes },
  ] : record.type === "ASSESSMENT" ? [
    { name: "assessedAt", label: labels.formAssessedAt, type: "date", value: date(record.occurredAt), required: true },
    { name: "result", label: labels.formAssessmentResult, value: record.result, options: [["COMPETENT", labels.assessmentResultCompetent], ["NOT_YET_COMPETENT", labels.assessmentResultNotYetCompetent]] },
    { name: "method", label: labels.formAssessmentMethod, value: record.method, options: [["PRACTICAL_TEST", labels.assessmentMethodPracticalTest], ["OBSERVATION", labels.assessmentMethodObservation], ["THEORY_TEST", labels.assessmentMethodTheoryTest], ["SIMULATOR", labels.assessmentMethodSimulator]] },
    { name: "score", label: labels.formScore, type: "number", value: record.score },
    { name: "observations", label: labels.formObservations, type: "textarea", value: record.observations },
  ] : [
    { name: "validFrom", label: labels.formValidFrom, type: "date", value: date(record.validFrom), required: true },
    { name: "validUntil", label: labels.formValidUntil, type: "date", value: date(record.validUntil), required: true },
    { name: "restrictions", label: labels.formRestrictions, type: "textarea", value: record.restrictions },
  ];
  const inputClass = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <form className="mt-3 space-y-3 border-t border-slate-200 pt-3" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries(fields.map((field) => {
      const raw = String(form.get(field.name) ?? "").trim();
      return [field.name, raw === "" ? null : field.type === "number" ? Number(raw) : raw];
    })));
  }}>
    <h4 className="font-semibold">{labels.recordEdit}</h4>
    <fieldset disabled={saving} className="space-y-3">
      {fields.map((field) => <label key={field.name} className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">{field.label}</span>
        {field.options ? <select name={field.name} defaultValue={field.value ?? ""} className={inputClass}>
          {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={field.value ?? ""} className={inputClass} rows={2} />
          : <input name={field.name} type={field.type ?? "text"} defaultValue={field.value ?? ""} required={field.required} className={inputClass}
            step={field.type === "number" ? field.name === "score" ? "1" : "0.01" : undefined}
            min={field.type === "number" ? field.name === "score" ? 0 : 0.01 : undefined}
            max={field.type === "number" ? field.name === "score" ? 100 : 999 : undefined} />}
      </label>)}
    </fieldset>
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>{labels.formCancel}</Button>
      <Button type="submit" size="sm" disabled={saving}>{saving ? labels.formSaving : labels.formSave}</Button>
    </div>
  </form>;
}
