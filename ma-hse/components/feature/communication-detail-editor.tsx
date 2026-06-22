"use client";

import { ActionStatus, CommunicationImprovementSubtype, CommunicationStatus, CommunicationType } from "@prisma/client";
import { useState } from "react";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { ProfessionalRiskSelect } from "@/components/feature/professional-risk-select";
import { UnsafeActTypeSelect } from "@/components/feature/unsafe-act-type-select";
import { UnsafeConditionTypeSelect } from "@/components/feature/unsafe-condition-type-select";
import { Button } from "@/components/ui/button";
import { sanitizeCommunicationPdfFileName, supportsCommunicationPdfReport } from "@/lib/communication-report";
import { hasOpenLinkedActions } from "@/lib/communication-status";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";
import type { BodyZonePickerLabels } from "@/lib/sewo-ui";

type Option = {
  id: string;
  name: string;
  employeeNo?: string;
  code?: string;
  category?: string;
};

type ActionOwnerOption = {
  id: string;
  label: string;
};

const COMMUNICATION_TYPES: CommunicationType[] = [
  "UNSAFE_ACT",
  "UNSAFE_CONDITION",
  "NEAR_MISS",
  "FIRST_AID",
  "ACCIDENT",
  "FIVE_S_IMPROVEMENT",
  "IMPROVEMENT_SUGGESTION",
];

const FIVE_S_IMPROVEMENT_SUBTYPES: CommunicationImprovementSubtype[] = [
  "FIVE_S_AREA_IMPROVEMENT",
  "FIVE_S_DISORGANIZATION",
];

const IMPROVEMENT_SUGGESTION_SUBTYPES: CommunicationImprovementSubtype[] = [
  "IMPROVEMENT_SAFETY",
  "IMPROVEMENT_HEALTH",
  "IMPROVEMENT_ENVIRONMENT",
];

type CommunicationRecord = {
  id: string;
  codigoCompleto: string | null;
  codigoAbreviado: string | null;
  type: CommunicationType;
  level: string | null;
  status: CommunicationStatus;
  eventDatetime: string;
  reporterName: string;
  reporterEmployeeNo: string | null;
  targetText: string | null;
  targetEmployeeNo: string | null;
  targetEmployeeId: string | null;
  areaId: string | null;
  workstationId: string | null;
  equipmentId: string | null;
  riskThemeId: string | null;
  unsafeActTypeId: string | null;
  unsafeConditionTypeId: string | null;
  nearMissTypeId: string | null;
  improvementSubtype: CommunicationImprovementSubtype | null;
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
  linkedActionStatuses: ActionStatus[];
};

export function CommunicationDetailEditor({
  plant,
  communication,
  canEdit,
  canManageStatus,
  canManageClassification,
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
  typeLabels,
  statusLabel,
  labels,
  createActionLabels,
  bodyZonePickerLabels,
}: {
  plant: string;
  communication: CommunicationRecord;
  canEdit: boolean;
  canManageStatus: boolean;
  canManageClassification: boolean;
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
  typeLabels: CommunicationUi["communicationTypeLabels"];
  statusLabel: string;
  labels?: CommunicationUi["detailEditor"];
  createActionLabels?: CommunicationUi["createActionQuick"];
  bodyZonePickerLabels?: BodyZonePickerLabels;
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.detailEditor;
  const improvementSubtypeLabels = BASE_COMMUNICATION_UI.communicationImprovementSubtypeLabels;
  const [type, setType] = useState<CommunicationType>(communication.type);
  const [eventDatetime, setEventDatetime] = useState(communication.eventDatetime.slice(0, 16));
  const [reporterEmployeeNo, setReporterEmployeeNo] = useState(communication.reporterEmployeeNo ?? "");
  const [reporterName, setReporterName] = useState(communication.reporterName);
  const [targetEmployeeId, setTargetEmployeeId] = useState(communication.targetEmployeeId ?? "");
  const [areaId, setAreaId] = useState(communication.areaId ?? "");
  const [workstationId, setWorkstationId] = useState(communication.workstationId ?? "");
  const [equipmentId, setEquipmentId] = useState(communication.equipmentId ?? "");
  const [riskThemeId, setRiskThemeId] = useState(communication.riskThemeId ?? "");
  const [unsafeActTypeId, setUnsafeActTypeId] = useState(communication.unsafeActTypeId ?? "");
  const [unsafeConditionTypeId, setUnsafeConditionTypeId] = useState(communication.unsafeConditionTypeId ?? "");
  const [nearMissTypeId, setNearMissTypeId] = useState(communication.nearMissTypeId ?? "");
  const [improvementSubtype, setImprovementSubtype] = useState<CommunicationImprovementSubtype | "">(communication.improvementSubtype ?? "");
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
  const [statusReason, setStatusReason] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const needsInvolvedWorker = type === "UNSAFE_ACT" || type === "NEAR_MISS";
  const needsRestrictedProfessionalRisk = type === "NEAR_MISS" || type === "FIRST_AID";
  const needsProfessionalRisk = type === "ACCIDENT" || (needsRestrictedProfessionalRisk && canManageClassification);
  const needsUnsafeActType = type === "UNSAFE_ACT" || (type === "FIRST_AID" && canManageClassification);
  const needsUnsafeConditionType = type === "UNSAFE_CONDITION" && canManageClassification;
  const needsNearMissType = type === "NEAR_MISS" && canManageClassification;
  const improvementSubtypeOptions =
    type === "FIVE_S_IMPROVEMENT"
      ? FIVE_S_IMPROVEMENT_SUBTYPES
      : type === "IMPROVEMENT_SUGGESTION"
        ? IMPROVEMENT_SUGGESTION_SUBTYPES
        : [];
  const needsImprovementSubtype = improvementSubtypeOptions.length > 0;
  const needsClinicalFields = type === "FIRST_AID" || type === "ACCIDENT";
  const selectedReporter = employees.find((employee) => employee.employeeNo === reporterEmployeeNo) ?? null;
  const selectedTarget = employees.find((employee) => employee.id === targetEmployeeId) ?? null;
  const communicationCode = communication.codigoCompleto ?? communication.codigoAbreviado ?? "Requires code update";
  const communicationLabel = `${communicationCode} | ${typeLabels[communication.type] ?? communication.type} | ${statusLabel}`;
  const hasBlockingLinkedActions = hasOpenLinkedActions(communication.linkedActionStatuses);
  const canExportPdf = supportsCommunicationPdfReport(communication.type);

  function getFileNameFromDisposition(disposition: string | null) {
    const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : sanitizeCommunicationPdfFileName(communicationCode);
  }

  async function exportPdf() {
    setExportingPdf(true);
    setExportMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/communications/${communication.id}/report`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(text.exportPdfFailed);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFileNameFromDisposition(response.headers.get("content-disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportMessage(text.exportPdfFailed);
    } finally {
      setExportingPdf(false);
    }
  }

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
          riskThemeId: needsProfessionalRisk ? riskThemeId || undefined : undefined,
          unsafeActTypeId: needsUnsafeActType ? unsafeActTypeId || undefined : undefined,
          unsafeConditionTypeId: needsUnsafeConditionType ? unsafeConditionTypeId || undefined : undefined,
          nearMissTypeId: needsNearMissType ? nearMissTypeId || undefined : undefined,
          improvementSubtype: needsImprovementSubtype ? improvementSubtype || undefined : undefined,
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
        throw new Error(text.updateFailed);
      }

      setMessage(text.updatedSuccessfully);
      window.location.reload();
    } catch {
      setMessage(text.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(nextStatus: "closed" | "to_do") {
    const trimmedReason = statusReason.trim();

    if (trimmedReason.length < 5) {
      setStatusMessage(text.statusReasonRequired);
      return;
    }

    if (nextStatus === "closed" && hasBlockingLinkedActions) {
      setStatusMessage(text.cannotCloseWithOpenActions);
      return;
    }

    setChangingStatus(true);
    setStatusMessage("");

    try {
      const endpoint = nextStatus === "closed" ? "manual-close" : "reopen";
      const response = await fetch(`/api/plants/${plant}/communications/${communication.id}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        if (json?.errorCode === "COMMUNICATION_HAS_OPEN_ACTIONS") {
          throw new Error(text.cannotCloseWithOpenActions);
        }
        throw new Error(text.statusChangeFailed);
      }

      setStatusMessage(text.statusChangeSaved);
      window.location.reload();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : text.statusChangeFailed);
    } finally {
      setChangingStatus(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{text.communicationRecord}</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canExportPdf ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={exportingPdf}
                onClick={() => void exportPdf()}
              >
                {exportingPdf ? text.generatingPdf : text.exportPdf}
              </Button>
            ) : null}
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {statusLabel}
            </div>
          </div>
        </div>
        {exportMessage ? <p className="text-sm text-red-700">{exportMessage}</p> : null}

        {canManageStatus ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-900">{text.statusManagement}</h3>
              <span className="text-xs text-slate-500">
                {text.linkedActions}: {communication.linkedActionStatuses.length}
              </span>
            </div>
            <textarea
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={text.statusChangeReason}
              disabled={changingStatus}
            />
            <div className="flex flex-wrap gap-3">
              {communication.status !== CommunicationStatus.CLOSED ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={changingStatus || hasBlockingLinkedActions}
                  onClick={() => void changeStatus("closed")}
                >
                  {changingStatus ? text.applyingStatus : text.closeCommunication}
                </Button>
              ) : null}
              {communication.status === CommunicationStatus.CLOSED ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={changingStatus}
                  onClick={() => void changeStatus("to_do")}
                >
                  {changingStatus ? text.applyingStatus : text.reopenCommunication}
                </Button>
              ) : null}
            </div>
            {communication.status !== CommunicationStatus.CLOSED && hasBlockingLinkedActions ? (
              <p className="text-sm text-amber-700">{text.cannotCloseWithOpenActions}</p>
            ) : null}
            {statusMessage ? <p className="text-sm text-slate-600">{statusMessage}</p> : null}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <select value={type} onChange={(event) => {
            const nextType = event.target.value as CommunicationType;
            setType(nextType);
            setImprovementSubtype("");
            if (nextType === "FIVE_S_IMPROVEMENT" || nextType === "IMPROVEMENT_SUGGESTION") {
              setTargetEmployeeId("");
            }
          }} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            {COMMUNICATION_TYPES.map((option) => (
              <option key={option} value={option}>{typeLabels[option] ?? option}</option>
            ))}
          </select>
          <input type="datetime-local" value={eventDatetime} onChange={(event) => setEventDatetime(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2" disabled={!canEdit} required />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select value={reporterEmployeeNo} onChange={(event) => {
            setReporterEmployeeNo(event.target.value);
            const employee = employees.find((entry) => entry.employeeNo === event.target.value);
            if (employee) setReporterName(employee.name);
          }} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.reporterFromPlantWorkers}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.employeeNo}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
            ))}
          </select>
          <input value={reporterName} onChange={(event) => setReporterName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.department}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <select value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.location}</option>
            {workstations.map((workstation) => (
              <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
            ))}
          </select>
          <select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            <option value="">{text.equipment}</option>
            {equipments.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {needsProfessionalRisk ? (
            <ProfessionalRiskSelect
              value={riskThemeId}
              onChange={setRiskThemeId}
              risks={riskThemes}
              placeholder={text.professionalRisk}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!canEdit}
              required
            />
          ) : null}
          <select value={severityPotential} onChange={(event) => setSeverityPotential(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit}>
            <option value="">{text.severityPotential}</option>
            <option value="LOW">{text.low}</option>
            <option value="MED">{text.medium}</option>
            <option value="HIGH">{text.high}</option>
          </select>
        </div>

        {needsUnsafeActType ? (
          <UnsafeActTypeSelect
            value={unsafeActTypeId}
            onChange={setUnsafeActTypeId}
            types={unsafeActTypes}
            placeholder={text.unsafeActType}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canEdit}
            required
          />
        ) : null}

        {needsUnsafeConditionType ? (
          <UnsafeConditionTypeSelect
            value={unsafeConditionTypeId}
            onChange={setUnsafeConditionTypeId}
            types={unsafeConditionTypes}
            placeholder={text.unsafeConditionType}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canEdit}
            required
          />
        ) : null}

        {needsNearMissType ? (
          <select value={nearMissTypeId} onChange={(event) => setNearMissTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.nearMissType}</option>
            {nearMissTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        ) : null}

        {needsImprovementSubtype ? (
          <select value={improvementSubtype} onChange={(event) => setImprovementSubtype(event.target.value as CommunicationImprovementSubtype)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.improvementSubtype}</option>
            {improvementSubtypeOptions.map((option) => (
              <option key={option} value={option}>{improvementSubtypeLabels[option] ?? option}</option>
            ))}
          </select>
        ) : null}

        {needsInvolvedWorker || needsClinicalFields ? (
          <select value={targetEmployeeId} onChange={(event) => setTargetEmployeeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
            <option value="">{text.involvedWorker}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
            ))}
          </select>
        ) : null}

        {needsClinicalFields ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select value={injuryTypeId} onChange={(event) => setInjuryTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required>
                <option value="">{text.injuryType}</option>
                {injuryTypes.map((injuryType) => (
                  <option key={injuryType.id} value={injuryType.id}>{injuryType.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={isContractor} onChange={(event) => setIsContractor(event.target.checked)} disabled={!canEdit} />
                {text.contractorInvolved}
              </label>
            </div>
            <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} labels={bodyZonePickerLabels} />
            {type === "ACCIDENT" ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <input type="number" min="0" value={initialLostDays} onChange={(event) => setInitialLostDays(event.target.value)} placeholder={text.lostDays} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
                  <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={isFatal} onChange={(event) => setIsFatal(event.target.checked)} disabled={!canEdit} />
                  {text.fatalInjury}
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {!needsClinicalFields ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={isContractor} onChange={(event) => setIsContractor(event.target.checked)} disabled={!canEdit} />
            {text.contractorInvolved}
          </label>
        ) : null}

        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} required />
        <textarea value={suggestedAction} onChange={(event) => setSuggestedAction(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} placeholder={text.suggestedAction} />

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? text.saving : text.saveCommunication}
            </Button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{text.editingRestricted}</p>
        )}
      </form>

      {canEdit ? (
        <CreateActionQuick
          owners={actionOwners}
          communicationOptions={[]}
          lockedCommunicationId={communication.id}
          lockedCommunicationLabel={communicationLabel}
          labels={createActionLabels}
        />
      ) : null}
    </div>
  );
}
