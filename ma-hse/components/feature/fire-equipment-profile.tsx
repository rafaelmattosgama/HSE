"use client";

import { useState } from "react";
import Link from "next/link";
import { FireChecklistFrequency, FireComplianceCellState, FireChecklistResult, FireEquipmentTagType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import {
  CreateFireEquipmentAction,
  type FireEquipmentActionOwnerOption,
  type FireEquipmentActionReasonOption,
} from "@/components/feature/create-fire-equipment-action";
import { FireChecklistExecutionForm } from "@/components/feature/fire-checklist-execution-form";
import { FIRE_COMPLIANCE_STATE_META } from "@/components/feature/fire-equipment-list";
import { FireEquipmentTagScanButton } from "@/components/feature/fire-equipment-tag-scan-button";
import { AppHero, AppPanel } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import { formatFireComplianceCellText } from "@/lib/fire-compliance-cell-text";
import type { FireEquipmentActionContext } from "@/lib/fire-equipment-action-prefill";
import type { FireEquipmentProfileView } from "@/lib/services/fire-equipment-service";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

const STATE_URGENCY: Record<FireComplianceCellState, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  NEVER_DONE: 2,
  VALID: 3,
  NOT_APPLICABLE: 4,
};

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}

function RESULT_BADGE_CLASS(result: FireChecklistResult) {
  if (result === FireChecklistResult.FAILED) return "bg-red-100 text-red-700";
  if (result === FireChecklistResult.PASSED_WITH_OBSERVATIONS) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function resultLabel(result: FireChecklistResult, labels: FireEquipmentUiDictionary) {
  if (result === FireChecklistResult.FAILED) return labels.resultFailed;
  if (result === FireChecklistResult.PASSED_WITH_OBSERVATIONS) return labels.resultPassedWithObservations;
  return labels.resultPassed;
}

function CurrentStateCell({
  label,
  state,
  dueDate,
  labels,
  onCreateAction,
}: {
  label: string;
  state: FireComplianceCellState;
  dueDate: Date | null;
  labels: FireEquipmentUiDictionary;
  onCreateAction?: () => void;
}) {
  const meta = FIRE_COMPLIANCE_STATE_META[state];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {formatFireComplianceCellText({ state, dueDate }, labels)}
      </span>
      {state === FireComplianceCellState.OVERDUE && onCreateAction ? (
        <button type="button" onClick={onCreateAction} className="mt-2 block text-xs font-semibold text-slate-600 hover:underline">
          {labels.actionButtonLabel}
        </button>
      ) : null}
    </div>
  );
}

function TagSection({
  plant,
  fireEquipmentId,
  tag,
  labels,
  onChanged,
}: {
  plant: string;
  fireEquipmentId: string;
  tag: FireEquipmentProfileView["tag"];
  labels: FireEquipmentUiDictionary;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tagType, setTagType] = useState<FireEquipmentTagType>(tag?.tagType ?? FireEquipmentTagType.NFC_AND_QR);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment/${fireEquipmentId}/tag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagType, unassignReason: tag ? reason.trim() || null : null }),
      });
      await requireApiResponse(response, labels.formError);
      setShowForm(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPanel>
      <h2 className="app-section-eyebrow">{labels.tagSectionTitle}</h2>
      {tag ? (
        <div className="mt-2 space-y-2 text-sm">
          <Row label={labels.tagColumnLabel} value={tag.tagCode} />
          <Row
            label={labels.tagTypeLabel}
            value={tag.tagType === FireEquipmentTagType.QR_ONLY ? labels.tagTypeQrOnly : labels.tagTypeNfcAndQr}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={`/api/plants/${plant}/fire-equipment/${fireEquipmentId}/tag/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-slate-600 hover:underline"
            >
              {labels.tagPrintLabel}
            </a>
            {tag.tagType !== FireEquipmentTagType.QR_ONLY ? (
              <FireEquipmentTagScanButton mode="write" url={tag.url} labels={labels} />
            ) : null}
            <Button type="button" variant="ghost" onClick={() => setShowForm((current) => !current)}>
              {labels.tagReplace}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <Button type="button" variant="ghost" onClick={() => setShowForm((current) => !current)}>
            {labels.tagAssign}
          </Button>
        </div>
      )}

      {showForm ? (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{labels.tagTypeLabel}</span>
            <select
              value={tagType}
              onChange={(event) => setTagType(event.target.value as FireEquipmentTagType)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={FireEquipmentTagType.NFC_AND_QR}>{labels.tagTypeNfcAndQr}</option>
              <option value={FireEquipmentTagType.QR_ONLY}>{labels.tagTypeQrOnly}</option>
            </select>
          </label>
          {tag ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.tagReplaceReasonLabel}</span>
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={labels.tagReplaceReasonPlaceholder}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void submit()} disabled={saving}>
              {tag ? labels.tagConfirmReplace : labels.tagAssign}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
              {labels.cancel}
            </Button>
          </div>
          {message ? <p className="text-sm text-rose-600">{message}</p> : null}
        </div>
      ) : null}
    </AppPanel>
  );
}

export function FireEquipmentProfile({
  plant,
  labels,
  profile,
  owners,
  autoOpenExecutionForm = false,
}: {
  plant: string;
  labels: FireEquipmentUiDictionary;
  profile: FireEquipmentProfileView;
  owners: FireEquipmentActionOwnerOption[];
  autoOpenExecutionForm?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(autoOpenExecutionForm);
  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);
  const [actionReasons, setActionReasons] = useState<FireEquipmentActionReasonOption[] | null>(null);

  const defaultFrequency = STATE_URGENCY[profile.quarterly.state] <= STATE_URGENCY[profile.annual.state] ? "QUARTERLY" : "ANNUAL";

  const actionContext: FireEquipmentActionContext = {
    equipmentInternalCode: profile.equipment.internalCode,
    equipmentTypeName: profile.equipment.fireEquipmentTypeName,
    areaName: profile.equipment.areaName,
  };

  function openOverdueAction(frequency: FireChecklistFrequency, dueDate: Date | null) {
    const label = frequency === FireChecklistFrequency.QUARTERLY
      ? `${labels.actionReasonOverduePrefix} ${labels.profileQuarterlyLabel}`
      : `${labels.actionReasonOverduePrefix} ${labels.profileAnnualLabel}`;
    setActionReasons([{ reason: { kind: "OVERDUE", frequency, dueDate }, label }]);
  }

  function openNonConformityAction(execution: FireEquipmentProfileView["history"][number]) {
    setActionReasons([{
      reason: {
        kind: "NON_CONFORMITY",
        overallResult: execution.overallResult,
        nokItems: execution.itemResponses
          .filter((response) => response.value === "NOK")
          .map((response) => ({ label: response.itemLabel, isCritical: response.isCritical, notes: response.notes })),
      },
      label: labels.actionReasonNonConformity,
    }]);
  }

  function formatDate(value: Date | string | null) {
    return value ? new Date(value).toLocaleDateString() : "—";
  }

  return (
    <div className="space-y-5">
      <AppHero
        eyebrow={
          <Link href={`/app/${plant}/fire-equipment`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {labels.profileBackToList}
          </Link>
        }
        title={profile.equipment.internalCode}
        description={profile.equipment.fireEquipmentTypeName}
        actions={<Button type="button" onClick={() => setFormOpen(true)}>{labels.profileNewVerification}</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AppPanel>
          <h2 className="app-section-eyebrow">{labels.profileIdentificationTitle}</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Row label={labels.fieldType} value={profile.equipment.fireEquipmentTypeName} />
            <Row
              label={labels.columnLocation}
              value={[profile.equipment.areaName, profile.equipment.workstationName, profile.equipment.locationDescription]
                .filter(Boolean)
                .join(" — ") || "—"}
            />
            <Row label={labels.fieldManufacturer} value={profile.equipment.manufacturer ?? "—"} />
            <Row label={labels.fieldModel} value={profile.equipment.model ?? "—"} />
            <Row label={labels.fieldSerialNumber} value={profile.equipment.serialNumber ?? "—"} />
            <Row label={labels.fieldCapacity} value={profile.equipment.capacity ?? "—"} />
            <Row label={labels.fieldInstalledAt} value={formatDate(profile.equipment.installedAt)} />
            <Row label={labels.fieldManufactureDate} value={formatDate(profile.equipment.manufactureDate)} />
          </dl>
        </AppPanel>

        <AppPanel>
          <h2 className="app-section-eyebrow">{labels.profileCurrentStateTitle}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <CurrentStateCell
              label={labels.profileQuarterlyLabel}
              state={profile.quarterly.state}
              dueDate={profile.quarterly.dueDate}
              labels={labels}
              onCreateAction={() => openOverdueAction(FireChecklistFrequency.QUARTERLY, profile.quarterly.dueDate)}
            />
            <CurrentStateCell
              label={labels.profileAnnualLabel}
              state={profile.annual.state}
              dueDate={profile.annual.dueDate}
              labels={labels}
              onCreateAction={() => openOverdueAction(FireChecklistFrequency.ANNUAL, profile.annual.dueDate)}
            />
          </div>
          {profile.hasOpenNonConformity ? (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              {labels.openNonConformityBadge}
            </span>
          ) : null}
        </AppPanel>
      </div>

      <TagSection
        plant={plant}
        fireEquipmentId={profile.equipment.id}
        tag={profile.tag}
        labels={labels}
        onChanged={() => window.location.reload()}
      />

      <AppPanel>
        <h2 className="app-section-eyebrow">{labels.profileHistoryTitle}</h2>
        {profile.history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{labels.profileNoHistory}</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {profile.history.map((execution) => {
              const expanded = expandedExecutionId === execution.id;
              return (
                <li key={execution.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {execution.frequency === "QUARTERLY" ? labels.profileQuarterlyLabel : labels.profileAnnualLabel}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_BADGE_CLASS(execution.overallResult)}`}>
                        {resultLabel(execution.overallResult, labels)}
                      </span>
                    </div>
                    <span className="text-slate-500">{formatDateTime(execution.performedAt)}</span>
                  </div>
                  <p className="mt-1 text-slate-600">{labels.historyPerformedBy.replace("{name}", execution.performedByName)}</p>
                  {execution.externalProviderName ? (
                    <p className="text-slate-600">{labels.historyExternalProvider.replace("{name}", execution.externalProviderName)}</p>
                  ) : null}
                  {execution.observations ? (
                    <p className="mt-1 text-slate-600">
                      <span className="font-medium">{labels.historyObservationsLabel}:</span> {execution.observations}
                    </p>
                  ) : null}
                  {execution.attachments.length > 0 ? (
                    <p className="mt-1 text-slate-500">
                      {labels.historyAttachmentsLabel}: {execution.attachments.map((attachment) => attachment.fileName).join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedExecutionId(expanded ? null : execution.id)}
                      className="text-xs font-semibold text-slate-500 hover:underline"
                    >
                      {expanded ? labels.historyItemResponsesHide : labels.historyItemResponsesShow}
                    </button>
                    {execution.overallResult !== "PASSED" ? (
                      <button
                        type="button"
                        onClick={() => openNonConformityAction(execution)}
                        className="text-xs font-semibold text-slate-600 hover:underline"
                      >
                        {labels.actionButtonLabel}
                      </button>
                    ) : null}
                  </div>
                  {expanded ? (
                    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                      {execution.itemResponses.map((response) => (
                        <li key={response.itemId} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700">
                            {response.itemLabel}
                            {response.isCritical ? <span className="ml-1 text-red-600">*</span> : null}
                          </span>
                          <span className="font-semibold text-slate-900">
                            {response.value}
                            {response.numericValue !== null ? ` (${response.numericValue})` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </AppPanel>

      {formOpen ? (
        <FireChecklistExecutionForm
          plant={plant}
          fireEquipmentId={profile.equipment.id}
          labels={labels}
          quarterlyItems={profile.checklists.quarterly}
          annualItems={profile.checklists.annual}
          defaultFrequency={defaultFrequency}
          onClose={() => setFormOpen(false)}
          onRecorded={() => window.location.reload()}
        />
      ) : null}

      {actionReasons ? (
        <AppPanel>
          <CreateFireEquipmentAction
            plant={plant}
            labels={labels}
            fireEquipmentId={profile.equipment.id}
            context={actionContext}
            reasons={actionReasons}
            owners={owners}
            onCreated={() => window.location.reload()}
            onCancel={() => setActionReasons(null)}
          />
        </AppPanel>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
