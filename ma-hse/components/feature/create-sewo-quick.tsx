"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionCategory, ActionPriority } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { Button } from "@/components/ui/button";

type Option = {
  id: string;
  name: string;
};

type WorkerOption = {
  id: string;
  employeeNo: string;
  name: string;
  dept: string | null;
};

type CommunicationActionOption = {
  id: string;
  title: string;
  description: string;
  ownerUserId: string;
  ownerName: string;
  priority: ActionPriority;
  category: ActionCategory;
  dueDate: string;
  status: string;
};

type CommunicationOption = {
  id: string;
  eventDate: string;
  monthKey: string;
  monthLabel: string;
  typeLabel: string;
  locationLabel: string;
  type: string;
  areaId: string | null;
  workstationId: string | null;
  targetEmployeeId: string | null;
  targetEmployeeName: string | null;
  shiftId: string | null;
  injuryTypeId: string | null;
  bodyPartId: string | null;
  description: string;
  suggestedAction: string | null;
  linkedSewoId: string | null;
  openActions: CommunicationActionOption[];
};

type RootCauseDetail = {
  id: string;
  label: string;
  comment: string;
  isRootCause: boolean;
};

type FiveWhyRow = {
  id: string;
  why: string;
  answer: string;
};

type ActionPlanRow = {
  id: string;
  title: string;
  description: string;
  ownerUserId: string;
  priority: ActionPriority;
  category: ActionCategory;
  dueDate: string;
};

type EditableCommunicationAction = CommunicationActionOption & {
  dirty?: boolean;
};

const ROOT_CAUSE_GROUPS = [
  {
    heading: "Unsafe Action",
    columns: [
      { title: "1 Competence / Knowledge", items: ["1.1 Inadequate training", "1.2 Limited experience with the specific task"] },
      { title: "2 Attitude / Behavior", items: ["2.1 Lack of concentration", "2.2 Incorrect use of protective items", "2.3 Breaking rules for safety", "2.4 Failure to respect work cycles and procedure", "2.5 Doubtful circumstances", "2.6 Failure to use PPE"] },
      { title: "3 Management", items: ["3.1 PPE inadequate", "3.2 Unfitness for the job", "3.3 Maintenance cycles not performed", "3.4 Cleaning cycles not performed", "3.5 Pressure", "3.6 Other"] },
      { title: "4 Precaution / Attention", items: ["4.1 Excess self-confidence", "4.2 Execution of operations outside of his/her competence", "4.3 Lack of communication"] },
    ],
  },
  {
    heading: "Unsafe Condition",
    columns: [
      { title: "5 Personal Condition", items: ["5.1 Physical problems / Physical fatigue", "5.2 Sudden illness", "5.3 Personal / family problems", "5.4 Health problems"] },
      { title: "6 Facilities / Equipment", items: ["6.1 Equipment facilities inadequate", "6.2 Lack of maintenance", "6.3 Weakness in design", "6.4 Anomalous functioning of equipment / facilities", "6.5 Failure / breakage", "6.6 Poor lighting", "6.7 Lack of cleaning cycles", "6.8 Erroneous manufacturing / installation"] },
      { title: "7 Procedure / Systems", items: ["7.1 Lack of standard procedure and/or safety rules", "7.2 Procedure inadequate", "7.3 Protective items not suitable", "7.4 Complex work methods", "7.5 Others"] },
    ],
  },
] as const;

function createFiveWhyRow(index: number): FiveWhyRow {
  return {
    id: `why-${index}-${crypto.randomUUID()}`,
    why: "",
    answer: "",
  };
}

function createActionPlanRow(): ActionPlanRow {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    ownerUserId: "",
    priority: ActionPriority.MEDIUM,
    category: ActionCategory.CORRECTIVE,
    dueDate: "",
  };
}

function slugifyLabel(label: string) {
  return label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

export function CreateSewoQuick({
  causeCatalogVersionId,
  communications,
  areas,
  workstations,
  shifts,
  workers,
  bodyParts,
  injuryTypes,
  actionOwners,
}: {
  causeCatalogVersionId?: string;
  communications: CommunicationOption[];
  areas: Option[];
  workstations: Option[];
  shifts: Option[];
  workers: WorkerOption[];
  bodyParts: Option[];
  injuryTypes: Option[];
  actionOwners: Option[];
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const monthKeys = useMemo(() => Array.from(new Set(communications.map((communication) => communication.monthKey))), [communications]);
  const [expandedMonths, setExpandedMonths] = useState<string[]>(monthKeys.slice(0, 1));
  const [communicationId, setCommunicationId] = useState("");
  const [eventClassification, setEventClassification] = useState("");
  const [areaId, setAreaId] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [involvedWorkerId, setInvolvedWorkerId] = useState("");
  const [natureId, setNatureId] = useState("");
  const [bodyPartId, setBodyPartId] = useState("");
  const [usualWork, setUsualWork] = useState<"YES" | "NO">("YES");
  const [whichText, setWhichText] = useState("");
  const [howText, setHowText] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [fiveWhys, setFiveWhys] = useState<FiveWhyRow[]>([createFiveWhyRow(1)]);
  const [immediateAction, setImmediateAction] = useState("");
  const [previousDetected, setPreviousDetected] = useState<"YES" | "NO">("NO");
  const [previousDetectedDescription, setPreviousDetectedDescription] = useState("");
  const [rootCauseDetails, setRootCauseDetails] = useState<RootCauseDetail[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlanRow[]>([createActionPlanRow()]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionsMessage, setActionsMessage] = useState("");
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [editableCommunicationActions, setEditableCommunicationActions] = useState<EditableCommunicationAction[]>([]);

  const selectedCommunication = useMemo(
    () => communications.find((communication) => communication.id === communicationId) ?? null,
    [communicationId, communications],
  );
  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === involvedWorkerId) ?? null,
    [involvedWorkerId, workers],
  );

  useEffect(() => {
    if (!selectedCommunication) {
      setEditableCommunicationActions([]);
      return;
    }

    setEventClassification(selectedCommunication.typeLabel);
    setAreaId(selectedCommunication.areaId ?? "");
    setWorkstationId(selectedCommunication.workstationId ?? "");
    setInvolvedWorkerId(selectedCommunication.targetEmployeeId ?? "");
    setShiftId(selectedCommunication.shiftId ?? "");
    setNatureId(selectedCommunication.injuryTypeId ?? "");
    setBodyPartId(selectedCommunication.bodyPartId ?? "");
    setHowText(selectedCommunication.description ?? "");
    setAnalysisText(selectedCommunication.description ?? "");
    setImmediateAction(selectedCommunication.suggestedAction ?? "");
    setEditableCommunicationActions(selectedCommunication.openActions.map((action) => ({ ...action, dirty: false })));
    setActionsMessage("");
  }, [selectedCommunication]);

  function toggleMonth(monthKey: string) {
    setExpandedMonths((current) => (current.includes(monthKey) ? current.filter((entry) => entry !== monthKey) : [...current, monthKey]));
  }

  function updateRootCauseSelection(label: string, checked: boolean) {
    setRootCauseDetails((current) => {
      if (checked) {
        return [...current, { id: slugifyLabel(label), label, comment: "", isRootCause: false }];
      }
      return current.filter((entry) => entry.label !== label);
    });
  }

  function addFiveWhy() {
    setFiveWhys((current) => [...current, createFiveWhyRow(current.length + 1)]);
  }

  function updateExistingAction(actionId: string, patch: Partial<EditableCommunicationAction>) {
    setEditableCommunicationActions((current) =>
      current.map((action) => (action.id === actionId ? { ...action, ...patch, dirty: true } : action)),
    );
  }

  async function saveExistingAction(actionId: string) {
    const action = editableCommunicationActions.find((entry) => entry.id === actionId);
    if (!action) return;

    setSavingActionId(actionId);
    setActionsMessage("");
    try {
      const response = await fetch(`/api/plants/${plant}/actions/${actionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: action.title,
          description: action.description,
          ownerUserId: action.ownerUserId,
          priority: action.priority,
          category: action.category,
          dueDate: action.dueDate || undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to update action");
      }

      setEditableCommunicationActions((current) =>
        current.map((entry) => (entry.id === actionId ? { ...entry, dirty: false, ownerName: actionOwners.find((owner) => owner.id === entry.ownerUserId)?.name ?? entry.ownerName } : entry)),
      );
      setActionsMessage("Communication actions updated.");
    } catch (error) {
      setActionsMessage(error instanceof Error ? error.message : "Failed to update action");
    } finally {
      setSavingActionId(null);
    }
  }

  async function uploadPhotos() {
    const uploaded = [];

    for (const photo of photos) {
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantCode: plant,
          fileName: photo.name,
          contentType: photo.type || "image/jpeg",
          folder: "sewo",
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
    if (!causeCatalogVersionId) {
      setMessage("No cause catalog available");
      return;
    }
    if (!selectedCommunication) {
      setMessage("Select a communication first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const attachments = photos.length ? await uploadPhotos() : [];
      const response = await fetch(`/api/plants/${plant}/sewo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          communicationId,
          eventClassification,
          areaId: areaId || undefined,
          workstationId: workstationId || undefined,
          shiftId: shiftId || undefined,
          analysisDate: new Date().toISOString(),
          whatText: natureId,
          whereText: workstationId || areaId,
          whoText: selectedWorker ? `${selectedWorker.employeeNo} - ${selectedWorker.name}` : selectedCommunication.targetEmployeeName ?? "",
          usualWorkYesNo: usualWork === "YES",
          whichText,
          howText,
          immediateCorrectiveActionText: immediateAction,
          attachments,
          templateData: {
            workstationId,
            involvedWorkerId,
            involvedWorkerName: selectedWorker?.name ?? selectedCommunication.targetEmployeeName ?? "",
            involvedWorkerEmployeeNo: selectedWorker?.employeeNo ?? null,
            involvedWorkerDepartment: selectedWorker?.dept ?? null,
            natureId,
            bodyPartId,
            analysisText,
            fiveWhys,
            previousDetected,
            previousDetectedDescription,
            rootCauseDetails,
          },
          causeCatalogVersionId,
          causeSelections: [],
          actionPlans: actionPlans.filter(
            (action) => action.title.trim() && action.description.trim() && action.ownerUserId,
          ),
        }),
      });

      const json = await response.json();
      setMessage(json.ok ? "S-EWO created" : json.message ?? "Failed to create S-EWO");
      if (json.ok) {
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create S-EWO");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-slate-900">S-EWO Investigation</h3>
        <p className="text-sm text-slate-600">Select the associated communication first. The investigation form opens only after that step.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Associated communication</h4>
            <p className="mt-1 text-sm text-slate-600">Communications are grouped by month to keep the list compact.</p>
          </div>
          {selectedCommunication ? (
            <div className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
              {selectedCommunication.eventDate} | {selectedCommunication.typeLabel} | {selectedCommunication.locationLabel}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {monthKeys.map((monthKey) => {
            const monthCommunications = communications.filter((communication) => communication.monthKey === monthKey);
            const expanded = expandedMonths.includes(monthKey);
            return (
              <div key={monthKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleMonth(monthKey)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-slate-900">{monthCommunications[0]?.monthLabel ?? monthKey}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{expanded ? "Hide" : "Show"} | {monthCommunications.length}</span>
                </button>
                {expanded ? (
                  <div className="border-t border-slate-200">
                    {monthCommunications.map((communication) => {
                      const selected = communication.id === communicationId;
                      const blocked = Boolean(communication.linkedSewoId);
                      return (
                        <button
                          key={communication.id}
                          type="button"
                          disabled={blocked}
                          onClick={() => setCommunicationId(communication.id)}
                          className={`flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-left first:border-t-0 ${selected ? "bg-teal-50" : "bg-white"} ${blocked ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50"}`}
                        >
                          <span className="text-sm text-slate-800">{communication.eventDate} | {communication.typeLabel} | {communication.locationLabel}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${blocked ? "bg-amber-100 text-amber-800" : selected ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-700"}`}>
                            {blocked ? "S-EWO already exists" : selected ? "Selected" : "Choose"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {selectedCommunication ? (
        <>
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event classification</span>
              <input value={eventClassification} readOnly className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Selected communication</p>
              <p className="mt-1">{selectedCommunication.eventDate} | {selectedCommunication.typeLabel}</p>
              <p>{selectedCommunication.locationLabel}</p>
            </div>
          </section>

          {editableCommunicationActions.length ? (
            <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open actions from communication</h4>
                  <p className="mt-1 text-sm text-slate-600">These actions stay linked to the communication and can be edited here before finishing the S-EWO.</p>
                </div>
                {actionsMessage ? <p className="text-sm text-slate-700">{actionsMessage}</p> : null}
              </div>
              <div className="space-y-3">
                {editableCommunicationActions.map((action) => (
                  <div key={action.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                        <p className="text-xs text-slate-500">{action.status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/app/${plant}/actions/${action.id}`} className="text-sm font-medium text-teal-700 hover:underline">
                          Open action
                        </Link>
                        <Button type="button" size="sm" onClick={() => saveExistingAction(action.id)} disabled={savingActionId === action.id || !action.dirty}>
                          {savingActionId === action.id ? "Saving..." : "Save action"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span>
                        <input value={action.title} onChange={(event) => updateExistingAction(action.id, { title: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</span>
                        <select value={action.ownerUserId} onChange={(event) => updateExistingAction(action.id, { ownerUserId: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          {actionOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="mt-3 block space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
                      <textarea value={action.description} onChange={(event) => updateExistingAction(action.id, { description: event.target.value })} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>

                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</span>
                        <select value={action.priority} onChange={(event) => updateExistingAction(action.id, { priority: event.target.value as ActionPriority })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value={ActionPriority.LOW}>Low</option>
                          <option value={ActionPriority.MEDIUM}>Medium</option>
                          <option value={ActionPriority.HIGH}>High</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
                        <select value={action.category} onChange={(event) => updateExistingAction(action.id, { category: event.target.value as ActionCategory })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value={ActionCategory.CORRECTIVE}>Corrective</option>
                          <option value={ActionCategory.PREVENTIVE}>Preventive</option>
                          <option value={ActionCategory.IMPROVEMENT}>Improvement</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</span>
                        <input type="date" value={action.dueDate} onChange={(event) => updateExistingAction(action.id, { dueDate: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Area</span>
              <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select area</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workstation</span>
              <select value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select workstation</option>
                {workstations.map((workstation) => <option key={workstation.id} value={workstation.id}>{workstation.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shift</span>
              <select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select shift</option>
                {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
              </select>
            </label>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Involved person</span>
                  <select value={involvedWorkerId} onChange={(event) => setInvolvedWorkerId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Select worker</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.employeeNo} - {worker.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nature</span>
                  <select value={natureId} onChange={(event) => setNatureId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Select nature of injury</option>
                    {injuryTypes.map((injuryType) => <option key={injuryType.id} value={injuryType.id}>{injuryType.name}</option>)}
                  </select>
                </label>
              </div>

              {selectedWorker ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{selectedWorker.name}</p>
                  <p>{selectedWorker.employeeNo}</p>
                  <p>{selectedWorker.dept ?? "Department not defined"}</p>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Who usual job?</span>
                  <select value={usualWork} onChange={(event) => setUsualWork(event.target.value as "YES" | "NO")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Which operation</span>
                  <input value={whichText} onChange={(event) => setWhichText(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Type of operation" />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Anatomical model</p>
              <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} />
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-teal-300 bg-teal-50 p-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-teal-900">Evidence / Photo Upload</h4>
              <p className="text-sm text-slate-700">Add photos or files before starting the analysis section.</p>
            </div>
            <input type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []))} className="mt-4 w-full rounded-md border border-teal-300 bg-white px-3 py-3 text-sm" />
            {photos.length > 0 ? <p className="mt-2 text-sm text-slate-700">{photos.length} file(s) ready for upload.</p> : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">How did the accident happen?</span>
              <textarea value={howText} onChange={(event) => setHowText(event.target.value)} rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Immediate corrective action plan</span>
              <textarea value={immediateAction} onChange={(event) => setImmediateAction(event.target.value)} rows={4} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-slate-800" required />
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Analyse</h4>
              <p className="mt-1 text-sm text-slate-600">Use both the free-text analysis and the 5 Why sequence.</p>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analysis text</span>
              <textarea value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} rows={5} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">5 Why</p>
                <Button type="button" size="sm" variant="secondary" onClick={addFiveWhy}>Add Why</Button>
              </div>
              <div className="space-y-3">
                {fiveWhys.map((row, index) => (
                  <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why {index + 1}</span>
                      <textarea
                        value={row.why}
                        onChange={(event) =>
                          setFiveWhys((current) => current.map((item) => (item.id === row.id ? { ...item, why: event.target.value } : item)))
                        }
                        rows={3}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Answer {index + 1}</span>
                      <textarea
                        value={row.answer}
                        onChange={(event) =>
                          setFiveWhys((current) => current.map((item) => (item.id === row.id ? { ...item, answer: event.target.value } : item)))
                        }
                        rows={3}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Root Cause Analysis</h4>
              <p className="mt-1 text-sm text-slate-600">Select causes below. Each selected item opens its own note box and root-cause toggle.</p>
            </div>

            {ROOT_CAUSE_GROUPS.map((group) => (
              <div key={group.heading} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.heading}</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {group.columns.map((column) => (
                    <div key={column.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-3 text-sm font-semibold text-slate-900">{column.title}</p>
                      <div className="space-y-2">
                        {column.items.map((item) => {
                          const selected = rootCauseDetails.some((entry) => entry.label === item);
                          return (
                            <label key={item} className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) => updateRootCauseSelection(item, event.target.checked)}
                              />
                              <span>{item}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {rootCauseDetails.length > 0 ? (
              <div className="space-y-3">
                {rootCauseDetails.map((detail) => (
                  <div key={detail.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_180px]">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{detail.label}</span>
                      <textarea
                        value={detail.comment}
                        onChange={(event) =>
                          setRootCauseDetails((current) =>
                            current.map((item) => (item.id === detail.id ? { ...item, comment: event.target.value } : item)),
                          )
                        }
                        rows={3}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Root cause</span>
                      <select
                        value={detail.isRootCause ? "YES" : "NO"}
                        onChange={(event) =>
                          setRootCauseDetails((current) =>
                            current.map((item) => (item.id === detail.id ? { ...item, isRootCause: event.target.value === "YES" } : item)),
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="NO">No</option>
                        <option value="YES">Yes</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Have previous UA / UC been detected?</span>
              <select value={previousDetected} onChange={(event) => setPreviousDetected(event.target.value as "YES" | "NO")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Describe previous detection</span>
              <textarea value={previousDetectedDescription} onChange={(event) => setPreviousDetectedDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Action Plan</h4>
                <p className="mt-1 text-sm text-slate-600">Create as many actions as needed from this investigation.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setActionPlans((current) => [...current, createActionPlanRow()])}>
                Add action
              </Button>
            </div>

            <div className="space-y-3">
              {actionPlans.map((action) => (
                <div key={action.id} className="grid gap-3 rounded-xl border border-slate-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Action</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setActionPlans((current) => (current.length === 1 ? current : current.filter((item) => item.id !== action.id)))}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span>
                      <input value={action.title} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, title: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
                      <select value={action.category} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, category: event.target.value as ActionCategory } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionCategory.CORRECTIVE}>Corrective</option>
                        <option value={ActionCategory.PREVENTIVE}>Preventive</option>
                        <option value={ActionCategory.IMPROVEMENT}>Improvement</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
                    <textarea value={action.description} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, description: event.target.value } : item)))} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </label>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</span>
                      <select value={action.ownerUserId} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, ownerUserId: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="">Select owner</option>
                        {actionOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</span>
                      <select value={action.priority} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, priority: event.target.value as ActionPriority } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionPriority.LOW}>Low</option>
                        <option value={ActionPriority.MEDIUM}>Medium</option>
                        <option value={ActionPriority.HIGH}>High</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</span>
                      <input type="date" value={action.dueDate} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, dueDate: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button size="sm" type="submit" disabled={loading}>{loading ? "Saving..." : "Create S-EWO"}</Button>
            {message ? <p className="text-sm text-slate-700">{message}</p> : null}
          </div>
        </>
      ) : null}
    </form>
  );
}
