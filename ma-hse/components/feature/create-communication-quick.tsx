"use client";

import { useState } from "react";
import { ActionPriority, CommunicationType } from "@prisma/client";
import { usePathname } from "next/navigation";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { ProfessionalRiskSelect } from "@/components/feature/professional-risk-select";
import { UnsafeActTypeSelect } from "@/components/feature/unsafe-act-type-select";
import { UnsafeConditionTypeSelect } from "@/components/feature/unsafe-condition-type-select";
import { Button } from "@/components/ui/button";
import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";

type Option = {
  id: string;
  name: string;
  employeeNo?: string;
  code?: string;
  category?: string;
};

export function CreateCommunicationQuick({
  areas,
  workstations,
  actionOwners,
  employees,
  bodyParts,
  injuryTypes,
  riskThemes,
  unsafeActTypes,
  unsafeConditionTypes,
  nearMissTypes,
  canLinkAction,
  canManageClassification,
  labels,
  typeLabels,
}: {
  areas: Option[];
  workstations: Option[];
  actionOwners: Option[];
  employees: Option[];
  bodyParts: Option[];
  injuryTypes: Option[];
  riskThemes: Option[];
  unsafeActTypes: Option[];
  unsafeConditionTypes: Option[];
  nearMissTypes: Option[];
  canLinkAction: boolean;
  canManageClassification: boolean;
  labels?: CommunicationUi["createCommunicationQuick"];
  typeLabels?: CommunicationUi["communicationTypeLabels"];
}) {
  const text = labels ?? BASE_COMMUNICATION_UI.createCommunicationQuick;
  const communicationTypeLabels =
    typeLabels ?? BASE_COMMUNICATION_UI.communicationTypeLabels;
  const pathname = usePathname();
  const [type, setType] = useState<CommunicationType>("UNSAFE_CONDITION");
  const [eventDatetime, setEventDatetime] = useState("");
  const [reporterEmployeeId, setReporterEmployeeId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [riskThemeId, setRiskThemeId] = useState("");
  const [unsafeActTypeId, setUnsafeActTypeId] = useState("");
  const [unsafeConditionTypeId, setUnsafeConditionTypeId] = useState("");
  const [nearMissTypeId, setNearMissTypeId] = useState("");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [bodyPartId, setBodyPartId] = useState("");
  const [injuryTypeId, setInjuryTypeId] = useState("");
  const [initialLostDays, setInitialLostDays] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [isFatal, setIsFatal] = useState(false);
  const [actionTitle, setActionTitle] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionOwnerUserId, setActionOwnerUserId] = useState("");
  const [actionPriority, setActionPriority] = useState<ActionPriority>("MEDIUM");
  const [actionDueDate, setActionDueDate] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const needsInvolvedWorker = type === "UNSAFE_ACT" || type === "NEAR_MISS";
  const needsRestrictedProfessionalRisk = type === "NEAR_MISS" || type === "FIRST_AID";
  const needsProfessionalRisk = type === "ACCIDENT" || (needsRestrictedProfessionalRisk && canManageClassification);
  const needsUnsafeActType = type === "UNSAFE_ACT" || (type === "FIRST_AID" && canManageClassification);
  const needsUnsafeConditionType = type === "UNSAFE_CONDITION" && canManageClassification;
  const needsNearMissType = type === "NEAR_MISS" && canManageClassification;
  const needsClinicalFields = type === "FIRST_AID" || type === "ACCIDENT";
  const shouldCreateAction = canLinkAction && (actionTitle.trim().length > 0 || actionDescription.trim().length > 0);
  const reporterEmployee = employees.find((employee) => employee.id === reporterEmployeeId) ?? null;
  const targetEmployee = employees.find((employee) => employee.id === targetEmployeeId) ?? null;

  async function uploadPhotos(plant: string) {
    const uploaded = [];

    for (const photo of photos) {
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantCode: plant,
          fileName: photo.name,
          contentType: photo.type || "image/jpeg",
          folder: "communications",
        }),
      });

      const presignJson = await presignResponse.json();
      if (!presignResponse.ok || !presignJson.ok) {
        throw new Error(presignJson.message ?? "Failed to prepare photo upload");
      }

      const putResponse = await fetch(presignJson.data.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": photo.type || "image/jpeg",
        },
        body: photo,
      });

      if (!putResponse.ok) {
        throw new Error(`Failed to upload ${photo.name}`);
      }

      uploaded.push({
        fileKey: presignJson.data.key,
        fileName: photo.name,
        contentType: photo.type || "image/jpeg",
      });
    }

    return uploaded;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const plant = pathname.split("/")[2];
      const attachments = photos.length ? await uploadPhotos(plant) : [];

      const response = await fetch(`/api/plants/${plant}/communications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          eventDatetime,
          reporterName: reporterEmployee?.name ?? "",
          reporterEmployeeNo: reporterEmployee?.employeeNo || undefined,
          areaId: areaId || undefined,
          workstationId: workstationId || undefined,
          riskThemeId: needsProfessionalRisk ? riskThemeId || undefined : undefined,
          unsafeActTypeId: needsUnsafeActType ? unsafeActTypeId || undefined : undefined,
          unsafeConditionTypeId: needsUnsafeConditionType ? unsafeConditionTypeId || undefined : undefined,
          nearMissTypeId: needsNearMissType ? nearMissTypeId || undefined : undefined,
          targetText: needsInvolvedWorker ? targetEmployee?.name || undefined : undefined,
          targetEmployeeId: needsInvolvedWorker || needsClinicalFields ? targetEmployeeId || undefined : undefined,
          description,
          suggestedAction: suggestedAction || undefined,
          bodyPartId: needsClinicalFields ? bodyPartId || undefined : undefined,
          injuryTypeId: needsClinicalFields ? injuryTypeId || undefined : undefined,
          initialLostDays: type === "ACCIDENT" && initialLostDays ? Number(initialLostDays) : undefined,
          hasLeave: type === "ACCIDENT" ? Boolean(initialLostDays || returnDate) : false,
          returnDate: type === "ACCIDENT" && returnDate ? returnDate : undefined,
          isFatal: type === "ACCIDENT" ? isFatal : false,
          attachments,
          quickAction: shouldCreateAction
            ? {
                title: actionTitle,
                description: actionDescription,
                ownerUserId: actionOwnerUserId,
                priority: actionPriority,
                dueDate: actionDueDate || undefined,
              }
            : undefined,
        }),
      });

      const json = await response.json();
      setMessage(json.ok ? text.created : text.createFailed);

      if (json.ok) {
        setType("UNSAFE_CONDITION");
        setDescription("");
        setSuggestedAction("");
        setReporterEmployeeId("");
        setEventDatetime("");
        setAreaId("");
        setWorkstationId("");
        setRiskThemeId("");
        setUnsafeActTypeId("");
        setUnsafeConditionTypeId("");
        setNearMissTypeId("");
        setTargetEmployeeId("");
        setBodyPartId("");
        setInjuryTypeId("");
        setInitialLostDays("");
        setReturnDate("");
        setIsFatal(false);
        setActionTitle("");
        setActionDescription("");
        setActionOwnerUserId("");
        setActionPriority("MEDIUM");
        setActionDueDate("");
        setPhotos([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.createFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{text.title}</h3>
      <select value={type} onChange={(event) => setType(event.target.value as CommunicationType)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        {(["UNSAFE_ACT", "UNSAFE_CONDITION", "NEAR_MISS", "FIRST_AID", "ACCIDENT"] as CommunicationType[]).map((option) => (
          <option key={option} value={option}>
            {communicationTypeLabels[option] ?? option}
          </option>
        ))}
      </select>
      <div className="grid gap-3 md:grid-cols-2">
        <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.department}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>{area.name}</option>
          ))}
        </select>
        <select value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.location}</option>
          {workstations.map((workstation) => (
            <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
          ))}
        </select>
      </div>
      <input type="datetime-local" aria-label={text.eventDatetime} value={eventDatetime} onChange={(event) => setEventDatetime(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      {needsProfessionalRisk ? (
        <ProfessionalRiskSelect
          value={riskThemeId}
          onChange={setRiskThemeId}
          risks={riskThemes}
          placeholder={text.professionalRisk}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
      ) : null}
      {needsUnsafeActType ? (
        <UnsafeActTypeSelect
          value={unsafeActTypeId}
          onChange={setUnsafeActTypeId}
          types={unsafeActTypes}
          placeholder={text.unsafeActType}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          required
        />
      ) : null}
      {needsNearMissType ? (
        <select value={nearMissTypeId} onChange={(event) => setNearMissTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.nearMissType}</option>
          {nearMissTypes.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <select value={reporterEmployeeId} onChange={(event) => setReporterEmployeeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.reporterFromPlantWorkers}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
          ))}
        </select>
        <input value={reporterEmployee?.employeeNo ?? ""} placeholder={text.reporterNumber} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50" readOnly />
      </div>
      {needsInvolvedWorker ? (
        <select value={targetEmployeeId} onChange={(event) => setTargetEmployeeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
          <option value="">{text.involvedWorkerFromPlantWorkers}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
          ))}
        </select>
      ) : null}
      {needsClinicalFields ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">{text.clinicalDetails}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={targetEmployeeId} onChange={(event) => setTargetEmployeeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
              <option value="">{text.involvedWorker}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.employeeNo ? `${employee.employeeNo} - ${employee.name}` : employee.name}</option>
              ))}
            </select>
            <select value={injuryTypeId} onChange={(event) => setInjuryTypeId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
              <option value="">{text.injuryType}</option>
              {injuryTypes.map((injuryType) => (
                <option key={injuryType.id} value={injuryType.id}>{injuryType.name}</option>
              ))}
            </select>
          </div>
          <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} />
          {type === "ACCIDENT" ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input type="number" min="0" value={initialLostDays} onChange={(event) => setInitialLostDays(event.target.value)} placeholder={text.lostDays} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isFatal} onChange={(event) => setIsFatal(event.target.checked)} />
                {text.fatalInjury}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      <input type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={text.description} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
      <textarea value={suggestedAction} onChange={(event) => setSuggestedAction(event.target.value)} placeholder={text.suggestedAction} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      {canLinkAction ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-900">{text.linkedAction}</h4>
          <div className="mt-3 space-y-3">
            <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} placeholder={text.actionTitle} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <textarea value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} placeholder={text.actionDescription} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="grid gap-3 md:grid-cols-3">
              <select value={actionOwnerUserId} onChange={(event) => setActionOwnerUserId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required={shouldCreateAction}>
                <option value="">{text.actionOwner}</option>
                {actionOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
              <select value={actionPriority} onChange={(event) => setActionPriority(event.target.value as ActionPriority)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="LOW">{text.priorityLabels.LOW}</option>
                <option value="MEDIUM">{text.priorityLabels.MEDIUM}</option>
                <option value="HIGH">{text.priorityLabels.HIGH}</option>
              </select>
              <input type="date" value={actionDueDate} onChange={(event) => setActionDueDate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      ) : null}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? text.saving : text.create}
      </Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}
