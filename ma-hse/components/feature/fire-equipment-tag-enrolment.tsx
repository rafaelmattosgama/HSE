"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { FireEquipmentTagScanButton, type FireEquipmentTagWire } from "@/components/feature/fire-equipment-tag-scan-button";
import { Button } from "@/components/ui/button";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type AreaOption = { id: string; name: string };
export type EnrolmentEquipmentOption = {
  id: string;
  internalCode: string;
  fireEquipmentTypeName: string;
  areaId: string | null;
};

/**
 * §5.3 "modo de associação em série": pick an area, work through every
 * piece of equipment in it that has no tag yet, one scan each — bind
 * succeeds, the queue advances to the next automatically. No manual
 * "next" step; the scan button's own onBound callback IS the advance.
 */
export function FireEquipmentTagEnrolment({
  plant,
  labels,
  areas,
  equipmentWithoutTag,
  onClose,
  onBound,
}: {
  plant: string;
  labels: FireEquipmentUiDictionary;
  areas: AreaOption[];
  equipmentWithoutTag: EnrolmentEquipmentOption[];
  onClose: () => void;
  onBound: (equipmentId: string, tag: FireEquipmentTagWire) => void;
}) {
  const [areaId, setAreaId] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());

  const queue = useMemo(
    () => equipmentWithoutTag.filter((row) => !done.has(row.id) && (!areaId || row.areaId === areaId)),
    [equipmentWithoutTag, done, areaId],
  );
  const current = queue[0];

  function handleBound(equipmentId: string) {
    return (tag: FireEquipmentTagWire) => {
      setDone((prev) => new Set(prev).add(equipmentId));
      onBound(equipmentId, tag);
    };
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-[2px]">
      <div className="app-panel w-full max-w-lg rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{labels.enrolmentTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.enrolmentDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label={labels.cancel}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{labels.enrolmentAreaLabel}</span>
            <select
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{labels.areaFilterAll}</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>

          <p className="text-sm text-slate-600">{labels.enrolmentRemaining.replace("{count}", String(queue.length))}</p>

          {current ? (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{current.internalCode}</p>
              <p className="text-xs text-slate-500">{current.fireEquipmentTypeName}</p>
              <div className="mt-3">
                <FireEquipmentTagScanButton
                  mode="bind"
                  plant={plant}
                  labels={labels}
                  fireEquipmentId={current.id}
                  fireEquipmentInternalCode={current.internalCode}
                  onBound={handleBound(current.id)}
                />
              </div>
            </div>
          ) : (
            <p className="app-empty py-6 text-center" role="status">{labels.enrolmentEmpty}</p>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>{labels.enrolmentDone}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
