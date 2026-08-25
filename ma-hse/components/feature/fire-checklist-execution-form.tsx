"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse, uploadAttachment } from "@/lib/client-api";
import type { FireEquipmentChecklistItemOption } from "@/lib/services/fire-equipment-service";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type FireChecklistFrequencyValue = "QUARTERLY" | "ANNUAL";
type ItemValue = "OK" | "NOK" | "NOT_APPLICABLE" | "";

type ItemResponseState = {
  value: ItemValue;
  numericValue: string;
  textValue: string;
  notes: string;
  photoUploading: boolean;
};

const EMPTY_RESPONSE: ItemResponseState = { value: "", numericValue: "", textValue: "", notes: "", photoUploading: false };

export function FireChecklistExecutionForm({
  plant,
  fireEquipmentId,
  labels,
  quarterlyItems,
  annualItems,
  defaultFrequency,
  onClose,
  onRecorded,
}: {
  plant: string;
  fireEquipmentId: string;
  labels: FireEquipmentUiDictionary;
  quarterlyItems: FireEquipmentChecklistItemOption[] | null;
  annualItems: FireEquipmentChecklistItemOption[] | null;
  defaultFrequency: FireChecklistFrequencyValue;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const availableFrequencies: FireChecklistFrequencyValue[] = [
    ...(quarterlyItems ? (["QUARTERLY"] as const) : []),
    ...(annualItems ? (["ANNUAL"] as const) : []),
  ];

  const [frequency, setFrequency] = useState<FireChecklistFrequencyValue>(
    availableFrequencies.includes(defaultFrequency) ? defaultFrequency : availableFrequencies[0] ?? defaultFrequency,
  );
  const items = frequency === "QUARTERLY" ? quarterlyItems : annualItems;

  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [externalProviderName, setExternalProviderName] = useState("");
  const [externalCertificateFileKey, setExternalCertificateFileKey] = useState<string | null>(null);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [observations, setObservations] = useState("");
  const [responses, setResponses] = useState<Record<string, ItemResponseState>>({});
  const [attachments, setAttachments] = useState<Array<{ fileKey: string; fileName: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function responseFor(itemId: string): ItemResponseState {
    return responses[itemId] ?? EMPTY_RESPONSE;
  }

  function updateResponse(itemId: string, patch: Partial<ItemResponseState>) {
    setResponses((current) => ({ ...current, [itemId]: { ...responseFor(itemId), ...patch } }));
  }

  async function handleCertificateFile(file: File) {
    setMessage("");
    setCertificateUploading(true);
    try {
      const uploaded = await uploadAttachment({
        plantCode: plant,
        folder: "fire-equipment",
        file,
        fallbackErrorMessage: labels.executionUploadError,
      });
      setExternalCertificateFileKey(uploaded.key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.executionUploadError);
    } finally {
      setCertificateUploading(false);
    }
  }

  async function handleItemPhoto(itemId: string, file: File) {
    setMessage("");
    updateResponse(itemId, { photoUploading: true });
    try {
      const uploaded = await uploadAttachment({
        plantCode: plant,
        folder: "fire-equipment",
        file,
        fallbackErrorMessage: labels.executionUploadError,
      });
      setAttachments((current) => [...current, { fileKey: uploaded.key, fileName: file.name }]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.executionUploadError);
    } finally {
      updateResponse(itemId, { photoUploading: false });
    }
  }

  function removeAttachment(fileKey: string) {
    setAttachments((current) => current.filter((attachment) => attachment.fileKey !== fileKey));
  }

  async function submit() {
    setMessage("");

    if (!items || items.length === 0) {
      setMessage(labels.executionNoTemplate);
      return;
    }

    const itemResponses = items.map((item) => {
      const response = responseFor(item.id);
      return {
        itemId: item.id,
        value: response.value,
        numericValue: response.numericValue.trim() ? Number(response.numericValue) : null,
        textValue: response.textValue.trim() || null,
        notes: response.notes.trim() || null,
      };
    });

    if (itemResponses.some((response) => !response.value)) {
      setMessage(labels.executionMissingResponses);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment/executions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fireEquipmentId,
          frequency,
          performedAt,
          externalProviderName: frequency === "ANNUAL" ? externalProviderName.trim() || null : null,
          externalCertificateFileKey: frequency === "ANNUAL" ? externalCertificateFileKey : null,
          observations: observations.trim() || null,
          itemResponses,
          attachments,
        }),
      });
      await requireApiResponse(response, labels.formError);
      onRecorded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-[2px]">
      <div className="app-panel flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{labels.executionFormTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.executionFormDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label={labels.cancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {availableFrequencies.length > 1 ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{labels.executionFieldFrequency}</span>
                <select
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value as FireChecklistFrequencyValue)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {availableFrequencies.map((option) => (
                    <option key={option} value={option}>
                      {option === "QUARTERLY" ? labels.frequencyQuarterly : labels.frequencyAnnual}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.executionFieldPerformedAt}</span>
              <input
                type="date"
                value={performedAt}
                onChange={(event) => setPerformedAt(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            {frequency === "ANNUAL" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">{labels.executionFieldExternalProviderName}</span>
                  <input
                    type="text"
                    value={externalProviderName}
                    onChange={(event) => setExternalProviderName(event.target.value)}
                    placeholder={labels.executionFieldExternalProviderPlaceholder}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">{labels.executionFieldExternalCertificate}</span>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleCertificateFile(file);
                    }}
                    disabled={certificateUploading}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  {certificateUploading ? <p className="mt-1 text-xs text-slate-500">{labels.executionUploading}</p> : null}
                  {externalCertificateFileKey ? <p className="mt-1 text-xs text-emerald-700">✓</p> : null}
                </label>
              </>
            ) : null}
          </div>

          {!items || items.length === 0 ? (
            <p className="app-empty mt-6 py-6 text-center" role="status">{labels.executionNoTemplate}</p>
          ) : (
            <ol className="mt-6 space-y-3">
              {items.map((item) => {
                const response = responseFor(item.id);
                const options: ItemValue[] = item.responseType === "OK_NOK" ? ["OK", "NOK"] : ["OK", "NOK", "NOT_APPLICABLE"];
                return (
                  <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{item.label}</p>
                        {item.helpText ? <p className="text-xs text-slate-500">{item.helpText}</p> : null}
                      </div>
                      {item.isCritical ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          {labels.executionCriticalBadge}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateResponse(item.id, { value: option })}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            response.value === option
                              ? option === "OK"
                                ? "bg-emerald-600 text-white"
                                : option === "NOK"
                                  ? "bg-red-600 text-white"
                                  : "bg-slate-600 text-white"
                              : "border border-slate-300 bg-white text-slate-600"
                          }`}
                        >
                          {option === "OK" && labels.executionItemValueOk}
                          {option === "NOK" && labels.executionItemValueNok}
                          {option === "NOT_APPLICABLE" && labels.executionItemValueNA}
                        </button>
                      ))}

                      {item.responseType === "NUMERIC" ? (
                        <input
                          type="number"
                          value={response.numericValue}
                          onChange={(event) => updateResponse(item.id, { numericValue: event.target.value })}
                          placeholder={labels.executionFieldReading}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                      ) : null}
                      {item.responseType === "TEXT" ? (
                        <input
                          type="text"
                          value={response.textValue}
                          onChange={(event) => updateResponse(item.id, { textValue: event.target.value })}
                          placeholder={labels.executionFieldNotes}
                          className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={response.notes}
                        onChange={(event) => updateResponse(item.id, { notes: event.target.value })}
                        placeholder={labels.executionFieldNotes}
                        className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                      />
                      {response.value === "NOK" ? (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">
                          {response.photoUploading ? labels.executionUploading : labels.executionAttachPhoto}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={response.photoUploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleItemPhoto(item.id, file);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {attachments.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-600">{labels.executionAttachmentsLabel}</p>
              <ul className="mt-1 space-y-1">
                {attachments.map((attachment) => (
                  <li key={attachment.fileKey} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="truncate">{attachment.fileName}</span>
                    <button type="button" onClick={() => removeAttachment(attachment.fileKey)} className="text-red-600 hover:underline">
                      {labels.executionRemoveAttachment}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{labels.executionFieldObservations}</span>
            <textarea
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div className="text-sm text-slate-600">
            {message ? <span className="font-medium text-rose-600">{message}</span> : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {labels.cancel}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving || !items || items.length === 0}>
              {saving ? labels.saving : labels.executionSubmit}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
