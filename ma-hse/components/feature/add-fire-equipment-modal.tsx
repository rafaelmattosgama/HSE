"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse, uploadAttachment } from "@/lib/client-api";
import { FIRE_EQUIPMENT_EXTINGUISHER_CODE } from "@/lib/defaults/fire-equipment-types";
import type { FireEquipmentTypeOption } from "@/lib/services/fire-equipment-service";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type WorkstationOption = { id: string; name: string };
type ExtinguishingAgentValue = "CO2" | "ABC" | "ABF" | "WATER";

const EXTINGUISHING_AGENTS: ExtinguishingAgentValue[] = ["CO2", "ABC", "ABF", "WATER"];

function extinguishingAgentLabel(labels: FireEquipmentUiDictionary, agent: ExtinguishingAgentValue) {
  switch (agent) {
    case "CO2":
      return labels.extinguishingAgentCo2;
    case "ABC":
      return labels.extinguishingAgentAbc;
    case "ABF":
      return labels.extinguishingAgentAbf;
    case "WATER":
      return labels.extinguishingAgentWater;
  }
}

export function AddFireEquipmentModal({
  plant,
  labels,
  types,
  workstations,
  onClose,
  onCreated,
}: {
  plant: string;
  labels: FireEquipmentUiDictionary;
  types: FireEquipmentTypeOption[];
  workstations: WorkstationOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fireEquipmentTypeId, setFireEquipmentTypeId] = useState("");
  const [internalCode, setInternalCode] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [extinguishingAgent, setExtinguishingAgent] = useState<ExtinguishingAgentValue | "">("");
  const [locationPhotoFileKey, setLocationPhotoFileKey] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [installedAt, setInstalledAt] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedType = types.find((type) => type.id === fireEquipmentTypeId);
  const isExtinguisher = selectedType?.code === FIRE_EQUIPMENT_EXTINGUISHER_CODE;

  function selectType(id: string) {
    setFireEquipmentTypeId(id);
    if (types.find((type) => type.id === id)?.code !== FIRE_EQUIPMENT_EXTINGUISHER_CODE) {
      setExtinguishingAgent("");
    }
  }

  async function handleLocationPhoto(file: File) {
    setMessage("");
    setPhotoUploading(true);
    try {
      const uploaded = await uploadAttachment({
        plantCode: plant,
        folder: "fire-equipment",
        file,
        fallbackErrorMessage: labels.photoUploadError,
      });
      setLocationPhotoFileKey(uploaded.key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.photoUploadError);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function submit() {
    setMessage("");

    if (!fireEquipmentTypeId) {
      setMessage(labels.selectTypeRequired);
      return;
    }
    if (!internalCode.trim()) {
      setMessage(labels.internalCodeRequired);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fireEquipmentTypeId,
          internalCode: internalCode.trim(),
          workstationId: workstationId || null,
          locationDescription: locationDescription.trim() || null,
          extinguishingAgent: isExtinguisher && extinguishingAgent ? extinguishingAgent : null,
          locationPhotoFileKey,
          installedAt: installedAt || null,
          manufactureDate: manufactureDate || null,
        }),
      });
      await requireApiResponse(response, labels.formError);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-[2px]">
      <div className="app-panel flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{labels.addEquipmentModalTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.addEquipmentModalDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label={labels.cancel}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldType}</span>
              <select
                value={fireEquipmentTypeId}
                onChange={(event) => selectType(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{labels.fieldTypePlaceholder}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldInternalCode}</span>
              <input
                type="text"
                value={internalCode}
                onChange={(event) => setInternalCode(event.target.value)}
                placeholder={labels.fieldInternalCodePlaceholder}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            {isExtinguisher ? (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldExtinguishingAgent}</span>
                <select
                  value={extinguishingAgent}
                  onChange={(event) => setExtinguishingAgent(event.target.value as ExtinguishingAgentValue | "")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{labels.fieldExtinguishingAgentPlaceholder}</option>
                  {EXTINGUISHING_AGENTS.map((agent) => (
                    <option key={agent} value={agent}>{extinguishingAgentLabel(labels, agent)}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldArea}</span>
              <select
                value={workstationId}
                onChange={(event) => setWorkstationId(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{labels.fieldAreaPlaceholder}</option>
                {workstations.map((workstation) => (
                  <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldLocationDescription}</span>
              <input
                type="text"
                value={locationDescription}
                onChange={(event) => setLocationDescription(event.target.value)}
                placeholder={labels.fieldLocationDescriptionPlaceholder}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldLocationPhoto}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleLocationPhoto(file);
                }}
                disabled={photoUploading}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {photoUploading ? <p className="mt-1 text-xs text-slate-500">{labels.photoUploading}</p> : null}
              {locationPhotoFileKey ? <p className="mt-1 text-xs text-emerald-700">✓</p> : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldInstalledAt}</span>
              <input
                type="date"
                value={installedAt}
                onChange={(event) => setInstalledAt(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldManufactureDate}</span>
              <input
                type="date"
                value={manufactureDate}
                onChange={(event) => setManufactureDate(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div className="text-sm text-slate-600">
            {message ? <span className="font-medium text-rose-600">{message}</span> : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {labels.cancel}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving || photoUploading}>
              {saving ? labels.saving : labels.addEquipment}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
