"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { FireEquipmentTypeOption } from "@/lib/services/fire-equipment-service";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type AreaOption = { id: string; name: string };
type WorkstationOption = { id: string; name: string };

export function AddFireEquipmentModal({
  plant,
  labels,
  types,
  areas,
  workstations,
  onClose,
  onCreated,
}: {
  plant: string;
  labels: FireEquipmentUiDictionary;
  types: FireEquipmentTypeOption[];
  areas: AreaOption[];
  workstations: WorkstationOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fireEquipmentTypeId, setFireEquipmentTypeId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");

    if (!fireEquipmentTypeId) {
      setMessage(labels.selectTypeRequired);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fireEquipmentTypeId,
          areaId: areaId || null,
          workstationId: workstationId || null,
          locationDescription: locationDescription.trim() || null,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          serialNumber: serialNumber.trim() || null,
          capacity: capacity.trim() || null,
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
                onChange={(event) => setFireEquipmentTypeId(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{labels.fieldTypePlaceholder}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldArea}</span>
              <select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{labels.fieldAreaPlaceholder}</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldWorkstation}</span>
              <select
                value={workstationId}
                onChange={(event) => setWorkstationId(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{labels.fieldWorkstationPlaceholder}</option>
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

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldManufacturer}</span>
              <input
                type="text"
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldModel}</span>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldSerialNumber}</span>
              <input
                type="text"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{labels.fieldCapacity}</span>
              <input
                type="text"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
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
            <Button type="button" onClick={() => void submit()} disabled={saving}>
              {saving ? labels.saving : labels.addEquipment}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
