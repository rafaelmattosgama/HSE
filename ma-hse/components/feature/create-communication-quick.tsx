"use client";

import { useState } from "react";
import { ActionPriority, CommunicationType } from "@prisma/client";
import { usePathname } from "next/navigation";
import { formatCommunicationType } from "@/lib/helpers";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { Button } from "@/components/ui/button";

type Option = {
  id: string;
  name: string;
};

export function CreateCommunicationQuick({
  riskThemeId,
  areas,
  workstations,
  actionOwners,
  employees,
  bodyParts,
  injuryTypes,
}: {
  riskThemeId?: string;
  areas: Option[];
  workstations: Option[];
  actionOwners: Option[];
  employees: Option[];
  bodyParts: Option[];
  injuryTypes: Option[];
}) {
  const pathname = usePathname();
  const [type, setType] = useState<CommunicationType>("UNSAFE_CONDITION");
  const [eventDatetime, setEventDatetime] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [targetText, setTargetText] = useState("");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [bodyPartId, setBodyPartId] = useState("");
  const [injuryTypeId, setInjuryTypeId] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionOwnerUserId, setActionOwnerUserId] = useState("");
  const [actionPriority, setActionPriority] = useState<ActionPriority>("MEDIUM");
  const [actionDueDate, setActionDueDate] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const needsTargetWorker = type === "UNSAFE_ACT";
  const needsClinicalFields = type === "FIRST_AID" || type === "ACCIDENT";
  const shouldCreateAction = actionTitle.trim().length > 0 || actionDescription.trim().length > 0;

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
          reporterName,
          areaId: areaId || undefined,
          workstationId: workstationId || undefined,
          targetText: needsTargetWorker ? targetText : undefined,
          targetEmployeeId: needsClinicalFields ? targetEmployeeId || undefined : undefined,
          riskThemeId,
          description,
          bodyPartId: needsClinicalFields ? bodyPartId || undefined : undefined,
          injuryTypeId: needsClinicalFields ? injuryTypeId || undefined : undefined,
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
      setMessage(json.ok ? "Communication created" : json.message ?? "Error creating communication");

      if (json.ok) {
        setType("UNSAFE_CONDITION");
        setDescription("");
        setReporterName("");
        setEventDatetime("");
        setAreaId("");
        setWorkstationId("");
        setTargetText("");
        setTargetEmployeeId("");
        setBodyPartId("");
        setInjuryTypeId("");
        setActionTitle("");
        setActionDescription("");
        setActionOwnerUserId("");
        setActionPriority("MEDIUM");
        setActionDueDate("");
        setPhotos([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error creating communication");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Quick communication</h3>
      <select
        value={type}
        onChange={(event) => setType(event.target.value as CommunicationType)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {(["UNSAFE_ACT", "UNSAFE_CONDITION", "NEAR_MISS", "FIRST_AID", "ACCIDENT"] as CommunicationType[]).map((option) => (
          <option key={option} value={option}>
            {formatCommunicationType(option)}
          </option>
        ))}
      </select>
      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={areaId}
          onChange={(event) => setAreaId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Department (Area)</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
        <select
          value={workstationId}
          onChange={(event) => setWorkstationId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Location (Workstation)</option>
          {workstations.map((workstation) => (
            <option key={workstation.id} value={workstation.id}>
              {workstation.name}
            </option>
          ))}
        </select>
      </div>
      <input
        type="datetime-local"
        value={eventDatetime}
        onChange={(event) => setEventDatetime(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      <input
        value={reporterName}
        onChange={(event) => setReporterName(event.target.value)}
        placeholder="Reporter name"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      {needsTargetWorker ? (
        <input
          value={targetText}
          onChange={(event) => setTargetText(event.target.value)}
          placeholder="Involved worker"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
      ) : null}
      {needsClinicalFields ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">Clinical details</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={targetEmployeeId}
              onChange={(event) => setTargetEmployeeId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Involved worker</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            <select
              value={injuryTypeId}
              onChange={(event) => setInjuryTypeId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Injury type</option>
              {injuryTypes.map((injuryType) => (
                <option key={injuryType.id} value={injuryType.id}>
                  {injuryType.name}
                </option>
              ))}
            </select>
          </div>
          <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} />
        </div>
      ) : null}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        required
      />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-sm font-semibold text-slate-900">Linked action (optional)</h4>
        <div className="mt-3 space-y-3">
          <input
            value={actionTitle}
            onChange={(event) => setActionTitle(event.target.value)}
            placeholder="Action title"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={actionDescription}
            onChange={(event) => setActionDescription(event.target.value)}
            placeholder="Action description"
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={actionOwnerUserId}
              onChange={(event) => setActionOwnerUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required={shouldCreateAction}
            >
              <option value="">Action owner</option>
              {actionOwners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
            <select
              value={actionPriority}
              onChange={(event) => setActionPriority(event.target.value as ActionPriority)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <input
              type="date"
              value={actionDueDate}
              onChange={(event) => setActionDueDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Saving..." : "Create"}
      </Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}
