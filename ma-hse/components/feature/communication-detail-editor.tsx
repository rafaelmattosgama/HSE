"use client";

import { CommunicationType } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { Button } from "@/components/ui/button";
import { formatCommunicationType } from "@/lib/helpers";

type Option = {
  id: string;
  name: string;
  employeeNo?: string;
  code?: string;
};

type ActionOwnerOption = {
  id: string;
  label: string;
};

type CommunicationRecord = {
  id: string;
  type: CommunicationType;
  status: string;
  eventDatetime: string;
  reporterName: string;
  reporterEmployeeNo: string | null;
  targetText: string | null;
  targetEmployeeNo: string | null;
  targetEmployeeId: string | null;
  areaId: string | null;
  workstationId: string | null;
  equipmentId: string | null;
  riskThemeId: string;
  unsafeActTypeId: string | null;
  unsafeConditionTypeId: string | null;
  nearMissTypeId: string | null;
  description: string;
  suggestedAction: string | null;
  severityPotential: "LOW" | "MED" | "HIGH" | null;
  isContractor: boolean | null;
  bodyPartId: string | null;
  injuryTypeId: string | null;
  isFatal: boolean | null;
  initialLostDays: number | null;
  hasLeave: boolean | null;
  returnDate: string | null;
};

export function CommunicationDetailEditor({
  communication,
  canEdit,
  areas,
  workstations,
  equipments,
  riskThemes,
  unsafeActTypes,
  unsafeConditionTypes,
  nearMissTypes,
  employees,
  bodyParts,
  injuryTypes,
  actionOwners,
}: {
  communication: CommunicationRecord;
  canEdit: boolean;
  areas: Option[];
  workstations: Option[];
  equipments: Option[];
  riskThemes: Option[];
  unsafeActTypes: Option[];
  unsafeConditionTypes: Option[];
  nearMissTypes: Option[];
  employees: Option[];
  bodyParts: Option[];
  injuryTypes: Option[];
  actionOwners: ActionOwnerOption[];
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const [type, setType] = useState<CommunicationType>(communication.type);
  const [eventDatetime, setEventDatetime] = useState(communication.eventDatetime.slice(0, 16));
  const [reporterEmployeeNo, setReporterEmployeeNo] = useState(communication.reporterEmployeeNo ?? "");
  const [reporterName, setReporterName] = useState(communication.reporterName);
  const [targetEmployeeId, setTargetEmployeeId] = useState(communication.targetEmployeeId ?? "");
  const [areaId, setAreaId] = useState(communication.areaId ?? "");
  const [workstationId, setWorkstationId] = useState(communication.workstationId ?? "");
  const [equipmentId, setEquipmentId] = useState(communication.equipmentId ?? "");
  const [riskThemeId, setRiskThemeId] = useState(communication.riskThemeId);
  const [unsafeActTypeId, setUnsafeActTypeId] = useState(communication.unsafeActTypeId ?? "");
  const [unsafeConditionTypeId, setUnsafeConditionTypeId] = useState(communication.unsafeConditionTypeId ?? "");
  const [nearMissTypeId, setNearMissTypeId] = useState(communication.nearMissTypeId ?? "");
  const [description, setDescription] = useState(communication.description);
  const [suggestedAction, setSuggestedAction] = useState(communication.suggestedAction ?? "");
  const [severityPotential, setSeverityPotential] = useState(communication.severityPotential ?? "");
  const [isContractor, setIsContractor] = useState(Boolean(communication.isContractor));
  const [bodyPartId, setBodyPartId] = useState(communication.bodyPartId ?? "");
  const [injuryTypeId, setInjuryTypeId] = useState(communication.injuryTypeId ?? "");
  const [initialLostDays, setInitialLostDays] = useState(communication.initialLostDays?.toString() ?? "");
  const [returnDate, setReturnDate] = useState(communication.returnDate?.slice(0, 10) ?? "");
  const [isFatal, setIsFatal] = useState(Boolean(communication.isFatal));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const needsInvolvedWorker = type === "UNSAFE_ACT" || type === "NEAR_MISS";
  const needsClinicalFields = type === "FIRST_AID" || type === "ACCIDENT";
  const selectedReporter = employees.find((employee) => employee.employeeNo === reporterEmployeeNo) ?? null;
  const selectedTarget = employees.find((employee) => employee.id === targetEmployeeId) ?? null;
  const communicationLabel = `${communication.id} | ${formatCommunicationType(communication.type)} | ${communication.status}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/communications/${communication.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          eventDatetime,
          reporterName: selectedReporter?.name ?? reporterName,
          reporterEmployeeNo: reporterEmployeeNo || undefined,
          targetText: needsInvolvedWorker ? selectedTarget?.name || undefined : undefined,
          targetEmployeeNo: needsInvolvedWorker || needsClinicalFields ? selectedTarget?.employeeNo || undefined : undefined,
          targetEmployeeId: needsInvolvedWorker || needsClinicalFields ? targetEmployeeId || undefined : undefined,
          areaId: areaId || undefined,
          workstationId: workstationId || undefined,
          equipmentId: equipmentId || undefined,
          riskThemeId,
          unsafeActTypeId: type === "UNSAFE_ACT" ? unsafeActTypeId || undefined : undefined,
          unsafeConditionTypeId: type === "UNSAFE_CONDITION" ? unsafeConditionTypeId || undefined : undefined,
          nearMissTypeId: type === "NEAR_MISS" ? nearMissTypeId || undefined : undefined,
          description,
          suggestedAction: suggestedAction || undefined,
          severityPotential: severityPotential || undefined,
          isContractor,
          bodyPartId: needsClinicalFields ? bodyPartId || undefined : undefined,
          injuryTypeId: needsClinicalFields ? injuryTypeId || undefined : undefined,
          initialLostDays: type === "ACCIDENT" && initialLostDays ? Number(initialLostDays) : undefined,
          hasLeave: type === "ACCIDENT" ? Boolean(initialLostDays || returnDate) : false,
          returnDate: type === "ACCIDENT" && returnDate ? returnDate : undefined,
          isFatal: needsClinicalFields ? isFatal : false,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to update communication");
      }

      setMessage("Communication updated successfully.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update communication");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Communication record</h2>
            <p className="mt-1 text-sm text-slate-600">
              {canEdit ? "N1 and N3 can edit this communication from this screen, including before N3 validation when needed." : "Read-only detail for this communication."}
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {communication.status}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select value={type} onChange={(event) => setType(event.target.value as CommunicationType)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            {(["UNSAFE_ACT", "UNSAFE_CONDITION", "NEAR_MISS", "FIRST_AID", "ACCIDENT"] as CommunicationType[]).map((option) => (
              <option key={option} value={option}>{formatCommunicationType(option)}</option>
            ))}
          </select>
          <input type="datetime-local" value={eventDatetime} onChange={(event) => setEventDatetime(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select value={reporterEmployeeNo} onChange={(event) => {
            setReporterEmployeeNo(event.target.value);
            const employee = employees.find((entry) => entry.employeeNo === event.target.value);
            if (employee) setReporterName(employee.name);
          }} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Reporter from plant workers</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.employeeNo}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
            ))}
          </select>
          <input value={reporterName} onChange={(event) => setReporterName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Department</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <select value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Location</option>
            {workstations.map((workstation) => (
              <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
            ))}
          </select>
          <select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            <option value="">Equipment</option>
            {equipments.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select value={riskThemeId} onChange={(event) => setRiskThemeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            {riskThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.code ? `${theme.code} - ${theme.name}` : theme.name}</option>
            ))}
          </select>
          <select value={severityPotential} onChange={(event) => setSeverityPotential(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            <option value="">Severity potential</option>
            <option value="LOW">Low</option>
            <option value="MED">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        {type === "UNSAFE_ACT" ? (
          <select value={unsafeActTypeId} onChange={(event) => setUnsafeActTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Unsafe act type</option>
            {unsafeActTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        ) : null}

        {type === "UNSAFE_CONDITION" ? (
          <select value={unsafeConditionTypeId} onChange={(event) => setUnsafeConditionTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Unsafe condition type</option>
            {unsafeConditionTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        ) : null}

        {type === "NEAR_MISS" ? (
          <select value={nearMissTypeId} onChange={(event) => setNearMissTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Near miss type</option>
            {nearMissTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        ) : null}

        {needsInvolvedWorker || needsClinicalFields ? (
          <select value={targetEmployeeId} onChange={(event) => setTargetEmployeeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">Involved worker</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
            ))}
          </select>
        ) : null}

        {needsClinicalFields ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select value={injuryTypeId} onChange={(event) => setInjuryTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
                <option value="">Injury type</option>
                {injuryTypes.map((injuryType) => (
                  <option key={injuryType.id} value={injuryType.id}>{injuryType.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={isContractor} onChange={(event) => setIsContractor(event.target.checked)} disabled={!canEdit} />
                Contractor involved
              </label>
            </div>
            <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} />
            {type === "ACCIDENT" ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <input type="number" min="0" value={initialLostDays} onChange={(event) => setInitialLostDays(event.target.value)} placeholder="Lost days" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
                  <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={isFatal} onChange={(event) => setIsFatal(event.target.checked)} disabled={!canEdit} />
                  Fatal injury
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {!needsClinicalFields ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={isContractor} onChange={(event) => setIsContractor(event.target.checked)} disabled={!canEdit} />
            Contractor involved
          </label>
        ) : null}

        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required />
        <textarea value={suggestedAction} onChange={(event) => setSuggestedAction(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} placeholder="Suggested action" />

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save communication"}
            </Button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Editing is available only when the user has the required N1 or N3 permissions for the current workflow state.</p>
        )}
      </form>

      {canEdit ? (
        <CreateActionQuick
          owners={actionOwners}
          communicationOptions={[]}
          lockedCommunicationId={communication.id}
          lockedCommunicationLabel={communicationLabel}
        />
      ) : null}
    </div>
  );
}
