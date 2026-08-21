"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionCategory, ActionPriority, SEWOStatus } from "@prisma/client";
import { ArrowRightCircle, ChevronDown, ChevronUp, FileImage, Link2Off, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BodyZonePicker } from "@/components/feature/body-zone-picker";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { parseApiResponse, requireApiResponse, uploadAttachment } from "@/lib/client-api";
import { hasOpenLinkedActions } from "@/lib/communication-status";
import { getNextSewoSubmissionStatus } from "@/lib/sewo-status";
import {
  SIF_PSIF_EXPOSURE_KEYS,
  createEmptySifPsifDecision,
  getActivePsifExposureKey,
  getSifPsifResult,
  getVisibleSifPsifExposureKeys,
  type SifPsifDecision,
  type SifPsifExposureKey,
  type SifPsifResult,
  type YesNoAnswer,
} from "@/lib/sewo-sif-psif";
import type { RootCauseGroup, SewoUi } from "@/lib/sewo-ui";

type Option = {
  id: string;
  name: string;
  code?: string;
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

type SewoAttachmentOption = {
  id: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  caption: string | null;
  downloadUrl: string;
};

type CommunicationOption = {
  id: string;
  codigoCompleto: string | null;
  codigoAbreviado: string | null;
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
  attachments: SewoAttachmentOption[];
  linkedSewoId: string | null;
  linkedSewoCode: string | null;
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

type EvidenceAttachment = {
  id: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  caption: string | null;
  downloadUrl: string | null;
  file?: File;
};

type SewoInitialData = {
  id: string;
  codigoSewo: string | null;
  communicationId: string | null;
  eventClassification: string;
  areaId: string | null;
  workstationId: string | null;
  shiftId: string | null;
  analysisDate: string;
  whatText: string;
  whereText: string;
  whoText: string;
  usualWorkYesNo: boolean;
  whichText: string | null;
  howText: string;
  immediateCorrectiveActionText: string;
  templateData: Record<string, unknown>;
  causeCatalogVersionId: string;
  status: string;
  approvalComment: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  attachments: SewoAttachmentOption[];
  linkedActions: CommunicationActionOption[];
};

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

function createEvidenceId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPreviewUrl(file: File) {
  if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") {
    return null;
  }

  return URL.createObjectURL(file);
}

function revokePreviewUrl(attachment: EvidenceAttachment) {
  if (attachment.file && attachment.downloadUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(attachment.downloadUrl);
  }
}

function createEvidenceAttachment(file: File): EvidenceAttachment {
  return {
    id: createEvidenceId(),
    fileKey: "",
    fileName: file.name,
    contentType: file.type || "image/jpeg",
    caption: "",
    downloadUrl: createPreviewUrl(file),
    file,
  };
}

function mapStoredEvidenceAttachment(attachment: SewoAttachmentOption): EvidenceAttachment {
  return {
    id: attachment.id,
    fileKey: attachment.fileKey,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    caption: attachment.caption ?? "",
    downloadUrl: attachment.downloadUrl,
  };
}

function slugifyLabel(label: string) {
  return label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function formatUiMessage(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

function isValidationFeedbackText(value: string) {
  return /\bvalidated by\b|\bvalidado por\b|\bvalidada por\b/i.test(value);
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getTemplateString(templateData: Record<string, unknown> | undefined, key: string) {
  return getStringValue(templateData?.[key]);
}

function getYesNoValue(value: unknown, fallback: YesNoAnswer): YesNoAnswer {
  return value === "YES" || value === "NO" ? value : fallback;
}

function normalizeFiveWhys(value: unknown) {
  if (!Array.isArray(value)) return [createFiveWhyRow(1)];

  const rows = value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;

      return {
        id: getStringValue(row.id) || `why-${index + 1}-${crypto.randomUUID()}`,
        why: getStringValue(row.why),
        answer: getStringValue(row.answer),
      };
    })
    .filter((entry): entry is FiveWhyRow => Boolean(entry));

  return rows.length ? rows : [createFiveWhyRow(1)];
}

function normalizeRootCauseDetails(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const detail = entry as Record<string, unknown>;
      const label = getStringValue(detail.label);

      if (!label) return null;

      return {
        id: getStringValue(detail.id) || slugifyLabel(label),
        label,
        comment: getStringValue(detail.comment),
        isRootCause: detail.isRootCause === true,
      };
    })
    .filter((entry): entry is RootCauseDetail => Boolean(entry));
}

function normalizeSifPsifDecision(value: unknown) {
  const fallback = createEmptySifPsifDecision();
  if (!value || typeof value !== "object") return fallback;

  const source = value as Record<string, unknown>;
  const exposures = source.exposures && typeof source.exposures === "object" ? source.exposures as Record<string, unknown> : {};

  return {
    actualSif: getYesNoValue(source.actualSif, fallback.actualSif),
    exposures: SIF_PSIF_EXPOSURE_KEYS.reduce((result, key) => {
      result[key] = getYesNoValue(exposures[key], fallback.exposures[key]);
      return result;
    }, { ...fallback.exposures }),
    repeatedSifPotential: getYesNoValue(source.repeatedSifPotential, fallback.repeatedSifPotential),
    oneWhatIfAway: getYesNoValue(source.oneWhatIfAway, fallback.oneWhatIfAway),
    noPsifExplanation: getStringValue(source.noPsifExplanation),
  };
}

function normalizeActionPlans(value: unknown) {
  if (!Array.isArray(value)) return [createActionPlanRow()];

  const rows = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const priority = Object.values(ActionPriority).includes(row.priority as ActionPriority)
        ? row.priority as ActionPriority
        : ActionPriority.MEDIUM;
      const category = Object.values(ActionCategory).includes(row.category as ActionCategory)
        ? row.category as ActionCategory
        : ActionCategory.CORRECTIVE;

      return {
        id: getStringValue(row.id) || crypto.randomUUID(),
        title: getStringValue(row.title),
        description: getStringValue(row.description),
        ownerUserId: getStringValue(row.ownerUserId),
        priority,
        category,
        dueDate: getStringValue(row.dueDate),
      };
    })
    .filter((entry): entry is ActionPlanRow => Boolean(entry));

  return rows.length ? rows : [createActionPlanRow()];
}

function getSifPsifResultLabel(result: SifPsifResult, ui: SewoUi) {
  if (result === "SIF") return ui.sifResult;
  if (result === "PSIF") return ui.psifResult;
  if (result === "NO_PSIF") return ui.noPsifResult;
  return ui.pendingResult;
}

function getSifPsifResultClassName(result: SifPsifResult) {
  if (result === "SIF") return "border-red-200 bg-red-600 text-white";
  if (result === "PSIF") return "border-amber-200 bg-amber-400 text-amber-950";
  if (result === "NO_PSIF") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-white text-slate-500";
}

function YesNoToggle({
  value,
  onChange,
  ui,
}: {
  value: YesNoAnswer;
  onChange: (value: "YES" | "NO") => void;
  ui: SewoUi;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
      {(["YES", "NO"] as const).map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-w-16 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              selected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {option === "YES" ? ui.yes : ui.no}
          </button>
        );
      })}
    </div>
  );
}

export function CreateSewoQuick({
  initialSewo,
  causeCatalogVersionId,
  communications,
  areas,
  workstations,
  shifts,
  workers,
  bodyParts,
  injuryTypes,
  actionOwners,
  ui,
  rootCauseGroups,
}: {
  initialSewo?: SewoInitialData;
  causeCatalogVersionId?: string;
  communications: CommunicationOption[];
  areas: Option[];
  workstations: Option[];
  shifts: Option[];
  workers: WorkerOption[];
  bodyParts: Option[];
  injuryTypes: Option[];
  actionOwners: Option[];
  ui: SewoUi;
  rootCauseGroups: RootCauseGroup[];
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const isEditing = Boolean(initialSewo);
  const monthKeys = useMemo(() => Array.from(new Set(communications.map((communication) => communication.monthKey))), [communications]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(monthKeys[0] ?? "");
  const [communicationId, setCommunicationId] = useState(initialSewo?.communicationId ?? "");
  const [skipCommunicationSelection, setSkipCommunicationSelection] = useState(Boolean(initialSewo && !initialSewo.communicationId));
  const [eventClassification, setEventClassification] = useState(initialSewo?.eventClassification ?? "");
  const [analysisDate, setAnalysisDate] = useState(initialSewo?.analysisDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [areaId, setAreaId] = useState(initialSewo?.areaId ?? "");
  const [workstationId, setWorkstationId] = useState(getTemplateString(initialSewo?.templateData, "workstationId") || initialSewo?.workstationId || "");
  const [shiftId, setShiftId] = useState(initialSewo?.shiftId ?? "");
  const [involvedWorkerId, setInvolvedWorkerId] = useState(getTemplateString(initialSewo?.templateData, "involvedWorkerId"));
  const [natureId, setNatureId] = useState(getTemplateString(initialSewo?.templateData, "natureId"));
  const [bodyPartId, setBodyPartId] = useState(getTemplateString(initialSewo?.templateData, "bodyPartId"));
  const [usualWork, setUsualWork] = useState<"YES" | "NO">(initialSewo?.usualWorkYesNo === false ? "NO" : "YES");
  const [whichText, setWhichText] = useState(initialSewo?.whichText ?? "");
  const [howText, setHowText] = useState(initialSewo?.howText ?? "");
  const [analysisText, setAnalysisText] = useState(getTemplateString(initialSewo?.templateData, "analysisText"));
  const [fiveWhys, setFiveWhys] = useState<FiveWhyRow[]>(() => normalizeFiveWhys(initialSewo?.templateData.fiveWhys));
  const [sifPsifDecision, setSifPsifDecision] = useState<SifPsifDecision>(() => normalizeSifPsifDecision(initialSewo?.templateData.sifPsifDecision));
  const [immediateAction, setImmediateAction] = useState(initialSewo?.immediateCorrectiveActionText ?? "");
  const [previousDetected, setPreviousDetected] = useState<"YES" | "NO">(
    getYesNoValue(initialSewo?.templateData.previousDetected, "NO") === "YES" ? "YES" : "NO",
  );
  const [previousDetectedDescription, setPreviousDetectedDescription] = useState(getTemplateString(initialSewo?.templateData, "previousDetectedDescription"));
  const [rootCauseDetails, setRootCauseDetails] = useState<RootCauseDetail[]>(() => normalizeRootCauseDetails(initialSewo?.templateData.rootCauseDetails));
  const [actionPlans, setActionPlans] = useState<ActionPlanRow[]>(() => normalizeActionPlans(initialSewo?.templateData.actionPlans));
  const [evidenceAttachments, setEvidenceAttachments] = useState<EvidenceAttachment[]>(
    () => initialSewo?.attachments.map(mapStoredEvidenceAttachment) ?? [],
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionsMessage, setActionsMessage] = useState("");
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [creatingLinkedAction, setCreatingLinkedAction] = useState(false);
  const [associatedCommunicationExpanded, setAssociatedCommunicationExpanded] = useState(!initialSewo);
  const [statusReason, setStatusReason] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);
  const [linkedActionDraft, setLinkedActionDraft] = useState<ActionPlanRow>(() => createActionPlanRow());
  const [editableCommunicationActions, setEditableCommunicationActions] = useState<EditableCommunicationAction[]>(
    () => initialSewo?.linkedActions.map((action) => ({ ...action, dirty: false })) ?? [],
  );

  const selectedCommunication = useMemo(
    () => communications.find((communication) => communication.id === communicationId) ?? null,
    [communicationId, communications],
  );
  const visibleCommunications = useMemo(
    () => communications.filter((communication) => !selectedMonthKey || communication.monthKey === selectedMonthKey),
    [communications, selectedMonthKey],
  );
  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === involvedWorkerId) ?? null,
    [involvedWorkerId, workers],
  );
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === areaId) ?? null,
    [areaId, areas],
  );
  const selectedWorkstation = useMemo(
    () => workstations.find((workstation) => workstation.id === workstationId) ?? null,
    [workstationId, workstations],
  );
  const selectedNature = useMemo(
    () => injuryTypes.find((injuryType) => injuryType.id === natureId) ?? null,
    [injuryTypes, natureId],
  );
  const sifPsifResult = useMemo(() => getSifPsifResult(sifPsifDecision), [sifPsifDecision]);
  const visibleSifPsifExposureKeys = useMemo(() => getVisibleSifPsifExposureKeys(sifPsifDecision), [sifPsifDecision]);
  const activePsifExposureKey = useMemo(() => getActivePsifExposureKey(sifPsifDecision), [sifPsifDecision]);
  const showPsifReasonability = Boolean(activePsifExposureKey);
  const linkedCommunicationType = selectedCommunication?.type ?? getTemplateString(initialSewo?.templateData, "eventType");
  const requiresBodyPart = linkedCommunicationType === "FIRST_AID" || linkedCommunicationType === "ACCIDENT";
  const isSubmittedSewo = Boolean(initialSewo?.status && initialSewo.status !== SEWOStatus.DRAFT);
  const isRejectedSewo = initialSewo?.status === SEWOStatus.REJECTED;
  const isValidatedSewo = initialSewo?.status === SEWOStatus.APPROVED || initialSewo?.status === SEWOStatus.CLOSED;
  const hasBlockingLinkedActions = hasOpenLinkedActions(editableCommunicationActions.map((action) => action.status));
  const canManageStatus = Boolean(
    initialSewo && initialSewo.status !== SEWOStatus.IN_APPROVAL && initialSewo.status !== SEWOStatus.REJECTED && initialSewo.status !== SEWOStatus.CLOSED,
  );
  const showLinkedActionsSection = Boolean(initialSewo || editableCommunicationActions.length);
  const showLinkedActionCreator = Boolean(initialSewo && isSubmittedSewo);
  const showN1Feedback = Boolean(
    initialSewo
      && (isRejectedSewo || isValidatedSewo)
      && (initialSewo.approvedByName || initialSewo.approvedAt || initialSewo.approvalComment),
  );
  const n1FeedbackTitle = isRejectedSewo ? ui.rejectionFeedbackTitle : ui.validationFeedbackTitle;
  const n1FeedbackActorLabel = isRejectedSewo ? ui.rejectedBy : ui.validatedBy;
  const rawN1FeedbackComment = initialSewo?.approvalComment?.trim() ?? "";
  const n1FeedbackComment = isRejectedSewo && isValidationFeedbackText(rawN1FeedbackComment)
    ? ""
    : rawN1FeedbackComment;
  const n1FeedbackClassName = isRejectedSewo
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const n1FeedbackCommentClassName = isRejectedSewo ? "border-rose-100" : "border-emerald-100";
  const associatedCommunicationSummary = selectedCommunication
    ? `${selectedCommunication.codigoCompleto ?? selectedCommunication.codigoAbreviado ?? "Requires code update"} | ${selectedCommunication.eventDate} | ${selectedCommunication.typeLabel} | ${selectedCommunication.locationLabel}`
    : communicationId
      ? "Requires code update"
      : ui.manualWithoutCommunication;
  const associatedCommunicationHref = communicationId ? `/app/${plant}/communications/${communicationId}` : null;
  const showAssociatedCommunicationSummary = Boolean(selectedCommunication || skipCommunicationSelection || initialSewo);

  useEffect(() => {
    setAssociatedCommunicationExpanded(!initialSewo);
  }, [initialSewo]);

  useEffect(() => {
    if (!monthKeys.length) {
      if (selectedMonthKey) {
        setSelectedMonthKey("");
      }
      return;
    }

    if (!selectedMonthKey || !monthKeys.includes(selectedMonthKey)) {
      setSelectedMonthKey(monthKeys[0]);
    }
  }, [monthKeys, selectedMonthKey]);

  useEffect(() => {
    if (!initialSewo) return;

    const linkedCommunication = communications.find((communication) => communication.id === initialSewo.communicationId);
    const initialNatureId = getTemplateString(initialSewo.templateData, "natureId") || (injuryTypes.some((injuryType) => injuryType.id === initialSewo.whatText) ? initialSewo.whatText : "");

    setSelectedMonthKey(linkedCommunication?.monthKey ?? monthKeys[0] ?? "");
    setCommunicationId(initialSewo.communicationId ?? "");
    setSkipCommunicationSelection(!initialSewo.communicationId);
    setEventClassification(initialSewo.eventClassification);
    setAnalysisDate(initialSewo.analysisDate.slice(0, 10));
    setAreaId(initialSewo.areaId ?? "");
    setWorkstationId(getTemplateString(initialSewo.templateData, "workstationId") || initialSewo.workstationId || "");
    setShiftId(initialSewo.shiftId ?? "");
    setInvolvedWorkerId(getTemplateString(initialSewo.templateData, "involvedWorkerId"));
    setNatureId(initialNatureId);
    setBodyPartId(getTemplateString(initialSewo.templateData, "bodyPartId"));
    setUsualWork(initialSewo.usualWorkYesNo ? "YES" : "NO");
    setWhichText(initialSewo.whichText ?? "");
    setHowText(initialSewo.howText);
    setAnalysisText(getTemplateString(initialSewo.templateData, "analysisText"));
    setFiveWhys(normalizeFiveWhys(initialSewo.templateData.fiveWhys));
    setSifPsifDecision(normalizeSifPsifDecision(initialSewo.templateData.sifPsifDecision));
    setImmediateAction(initialSewo.immediateCorrectiveActionText);
    setPreviousDetected(getYesNoValue(initialSewo.templateData.previousDetected, "NO") === "YES" ? "YES" : "NO");
    setPreviousDetectedDescription(getTemplateString(initialSewo.templateData, "previousDetectedDescription"));
    setRootCauseDetails(normalizeRootCauseDetails(initialSewo.templateData.rootCauseDetails));
    setActionPlans(normalizeActionPlans(initialSewo.templateData.actionPlans));
    setEvidenceAttachments(initialSewo.attachments.map(mapStoredEvidenceAttachment));
    setMessage("");
    setActionsMessage("");
    setStatusReason("");
    setLinkedActionDraft(createActionPlanRow());
    setEditableCommunicationActions(initialSewo.linkedActions.map((action) => ({ ...action, dirty: false })));
  }, [communications, initialSewo, injuryTypes, monthKeys]);

  useEffect(() => {
    if (initialSewo) return;

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
    setEvidenceAttachments(selectedCommunication.attachments.map(mapStoredEvidenceAttachment));
    setEditableCommunicationActions(selectedCommunication.openActions.map((action) => ({ ...action, dirty: false })));
    setActionsMessage("");
  }, [initialSewo, selectedCommunication]);

  const canContinue = Boolean(selectedCommunication || skipCommunicationSelection || isEditing);

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

  function updateSifPsifExposure(key: SifPsifExposureKey, value: "YES" | "NO") {
    setSifPsifDecision((current) => {
      if (current.exposures[key] === value) return current;

      const changedIndex = SIF_PSIF_EXPOSURE_KEYS.indexOf(key);
      const exposures = {
        ...current.exposures,
        [key]: value,
      };

      SIF_PSIF_EXPOSURE_KEYS.slice(changedIndex + 1).forEach((nextKey) => {
        exposures[nextKey] = "";
      });

      return {
        ...current,
        exposures,
        repeatedSifPotential: "",
        oneWhatIfAway: "",
        noPsifExplanation: "",
      };
    });
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

      await requireApiResponse(response, ui.updateActionError);

      setEditableCommunicationActions((current) =>
        current.map((entry) => (entry.id === actionId ? { ...entry, dirty: false, ownerName: actionOwners.find((owner) => owner.id === entry.ownerUserId)?.name ?? entry.ownerName } : entry)),
      );
      setActionsMessage(ui.updateActionSuccess);
    } catch (error) {
      setActionsMessage(error instanceof Error ? error.message : ui.updateActionError);
    } finally {
      setSavingActionId(null);
    }
  }

  async function createLinkedAction() {
    if (!initialSewo) return;

    if (
      !linkedActionDraft.title.trim()
      || !linkedActionDraft.description.trim()
      || !linkedActionDraft.ownerUserId
    ) {
      setActionsMessage(ui.linkedActionCreateError);
      return;
    }

    setCreatingLinkedAction(true);
    setActionsMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "SEWO",
          sewoId: initialSewo.id,
          category: linkedActionDraft.category,
          priority: linkedActionDraft.priority,
          title: linkedActionDraft.title.trim(),
          description: linkedActionDraft.description.trim(),
          ownerUserId: linkedActionDraft.ownerUserId,
          dueDate: linkedActionDraft.dueDate || undefined,
        }),
      });

      await requireApiResponse(response, ui.linkedActionCreateError);
      setActionsMessage(ui.linkedActionCreated);
      window.location.reload();
    } catch (error) {
      setActionsMessage(error instanceof Error ? error.message : ui.linkedActionCreateError);
    } finally {
      setCreatingLinkedAction(false);
    }
  }

  function addEvidenceFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selectedFiles.length) return;

    setEvidenceAttachments((current) => [
      ...current,
      ...selectedFiles.map(createEvidenceAttachment),
    ]);
  }

  function updateEvidenceCaption(id: string, caption: string) {
    setEvidenceAttachments((current) =>
      current.map((attachment) =>
        attachment.id === id ? { ...attachment, caption: caption.slice(0, 200) } : attachment,
      ),
    );
  }

  function removeEvidenceAttachment(id: string) {
    setEvidenceAttachments((current) => {
      const attachment = current.find((entry) => entry.id === id);
      if (attachment) revokePreviewUrl(attachment);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function uploadNewEvidenceAttachments() {
    const uploaded: Array<{
      id: string;
      fileKey: string;
      fileName: string;
      contentType: string;
      caption?: string;
    }> = [];

    for (const attachment of evidenceAttachments) {
      if (!attachment.file) continue;
      const photo = attachment.file;

      let uploadResult: { key: string };
      try {
        uploadResult = await uploadAttachment({
          plantCode: plant,
          folder: "sewo",
          file: photo,
          contentType: photo.type || "image/jpeg",
          fallbackErrorMessage: ui.preparePhotoUploadError,
        });
      } catch {
        throw new Error(formatUiMessage(ui.uploadPhotoError, { name: photo.name }));
      }

      uploaded.push({
        id: attachment.id,
        fileKey: uploadResult.key,
        fileName: photo.name,
        contentType: photo.type || "image/jpeg",
        caption: attachment.caption?.trim() || undefined,
      });
    }

    return uploaded;
  }

  async function saveSewo(mode: "draft" | "save" | "submit") {
    const resolvedCauseCatalogVersionId = initialSewo?.causeCatalogVersionId ?? causeCatalogVersionId;
    const fallbackErrorMessage = mode === "draft"
      ? ui.draftSaveError
      : initialSewo
        ? ui.updateError
        : ui.createError;

    if (!resolvedCauseCatalogVersionId) {
      setMessage(ui.noCauseCatalog);
      return;
    }
    if (!canContinue) {
      setMessage(ui.selectCommunicationOrContinue);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const uploadedAttachments = await uploadNewEvidenceAttachments();
      const uploadedById = new Map(uploadedAttachments.map((attachment) => [attachment.id, attachment]));
      const attachments = evidenceAttachments.flatMap((attachment) => {
        if (attachment.file) {
          const uploaded = uploadedById.get(attachment.id);
          return uploaded
            ? [{
                fileKey: uploaded.fileKey,
                fileName: uploaded.fileName,
                contentType: uploaded.contentType,
                caption: uploaded.caption,
              }]
            : [];
        }

        return [{
          fileKey: attachment.fileKey,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          caption: attachment.caption?.trim() || undefined,
        }];
      });
      const isDraft = mode === "draft";
      const isSubmission = mode === "submit";
      const isResubmission = Boolean(initialSewo && initialSewo.status === SEWOStatus.REJECTED && isSubmission);
      const resolvedEventClassification = eventClassification.trim()
        || selectedCommunication?.typeLabel
        || initialSewo?.eventClassification
        || ui.notSpecified;
      const resolvedWhereText = selectedWorkstation?.name
        ?? selectedArea?.name
        ?? selectedCommunication?.locationLabel
        ?? initialSewo?.whereText
        ?? ui.notSpecified;
      const resolvedWhoText = selectedWorker
        ? `${selectedWorker.employeeNo} - ${selectedWorker.name}`
        : selectedCommunication?.targetEmployeeName ?? initialSewo?.whoText ?? ui.notSpecified;
      const resolvedHowText = howText.trim() || ui.notSpecified;
      const resolvedImmediateAction = immediateAction.trim();
      const completeActionPlans = actionPlans
        .filter((action) => action.title.trim() && action.description.trim() && action.ownerUserId)
        .map((action) => ({
          category: action.category,
          priority: action.priority,
          title: action.title,
          description: action.description,
          ownerUserId: action.ownerUserId,
          dueDate: action.dueDate || undefined,
        }));
      const nextStatus = isDraft
        ? SEWOStatus.DRAFT
        : isSubmission
          ? getNextSewoSubmissionStatus(initialSewo?.status ?? null)
          : (initialSewo?.status as SEWOStatus | undefined) ?? SEWOStatus.DRAFT;
      const successMessage = isDraft
        ? ui.draftSaved
        : isResubmission
          ? ui.resubmitSuccess
          : initialSewo
            ? ui.updateSuccess
            : ui.createSuccess;

      const response = await fetch(initialSewo ? `/api/plants/${plant}/sewo/${initialSewo.id}` : `/api/plants/${plant}/sewo`, {
        method: initialSewo ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          communicationId: communicationId || undefined,
          eventClassification: resolvedEventClassification,
          areaId: areaId || undefined,
          workstationId: workstationId || undefined,
          shiftId: shiftId || undefined,
          analysisDate: analysisDate || new Date().toISOString(),
          whatText: natureId || selectedNature?.name || initialSewo?.whatText || resolvedEventClassification,
          whereText: resolvedWhereText,
          whoText: resolvedWhoText,
          usualWorkYesNo: usualWork === "YES",
          whichText,
          howText: resolvedHowText,
          immediateCorrectiveActionText: resolvedImmediateAction,
          attachments,
          templateData: {
            workstationId,
            involvedWorkerId,
            involvedWorkerName: selectedWorker?.name ?? selectedCommunication?.targetEmployeeName ?? "",
            involvedWorkerEmployeeNo: selectedWorker?.employeeNo ?? null,
            involvedWorkerDepartment: selectedWorker?.dept ?? null,
            natureId,
            bodyPartId,
            whereText: resolvedWhereText,
            analysisText,
            fiveWhys,
            sifPsifDecision: {
              ...sifPsifDecision,
              result: sifPsifResult,
            },
            previousDetected,
            previousDetectedDescription,
            rootCauseDetails,
            actionPlans,
          },
          causeCatalogVersionId: resolvedCauseCatalogVersionId,
          causeSelections: [],
          status: nextStatus,
          actionPlans: isSubmission ? completeActionPlans : [],
        }),
      });

      const json = await parseApiResponse(response);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? fallbackErrorMessage);
      }

      setMessage(successMessage);
      if (initialSewo) {
        window.location.reload();
      } else {
        window.location.href = `/app/${plant}/sewo`;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallbackErrorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus() {
    if (!initialSewo) return;

    const trimmedReason = statusReason.trim();

    if (trimmedReason.length < 5) {
      setMessage(ui.statusReasonRequired);
      return;
    }

    if (hasBlockingLinkedActions) {
      setMessage(ui.cannotCloseWithOpenActions);
      return;
    }

    setChangingStatus(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/sewo/${initialSewo.id}/manual-close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });

      const json = await parseApiResponse(response);
      if (!response.ok || !json?.ok) {
        if (json?.errorCode === "SEWO_HAS_OPEN_ACTIONS") {
          throw new Error(ui.cannotCloseWithOpenActions);
        }
        throw new Error(json?.message ?? ui.statusChangeFailed);
      }

      setMessage(ui.statusChangeSaved);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.statusChangeFailed);
    } finally {
      setChangingStatus(false);
    }
  }

  async function reopenSewo() {
    if (!initialSewo) return;

    const trimmedReason = statusReason.trim();

    if (trimmedReason.length < 5) {
      setMessage(ui.statusReasonRequired);
      return;
    }

    setChangingStatus(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/sewo/${initialSewo.id}/reopen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });

      const json = await parseApiResponse(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? ui.statusChangeFailed);
      }

      setMessage(ui.statusChangeSaved);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.statusChangeFailed);
    } finally {
      setChangingStatus(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await saveSewo(!initialSewo || initialSewo.status === SEWOStatus.DRAFT || isRejectedSewo ? "submit" : "save");
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{initialSewo ? ui.editSewoTitle : ui.investigationTitle}</h3>
      </div>

      {showN1Feedback ? (
        <section className={`space-y-3 rounded-2xl border p-4 ${n1FeedbackClassName}`}>
          <h4 className="text-sm font-semibold uppercase tracking-wide">{n1FeedbackTitle}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {initialSewo?.approvedByName ? (
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{n1FeedbackActorLabel}:</span> {initialSewo.approvedByName}
              </p>
            ) : null}
            {initialSewo?.approvedAt ? (
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{ui.reviewedAt}:</span> {new Date(initialSewo.approvedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          {n1FeedbackComment ? (
            <p className={`whitespace-pre-line rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 ${n1FeedbackCommentClassName}`}>
              {n1FeedbackComment}
            </p>
          ) : null}
        </section>
      ) : null}

      {canManageStatus ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.statusManagement}</h4>
            <span className="text-xs text-slate-500">{ui.linkedActions}: {editableCommunicationActions.length}</span>
          </div>
          <textarea
            value={statusReason}
            onChange={(event) => setStatusReason(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={ui.statusChangeReason}
            disabled={changingStatus}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={changingStatus || hasBlockingLinkedActions}
              onClick={() => void changeStatus()}
            >
              {changingStatus ? ui.savingAction : ui.closeSewo}
            </Button>
          </div>
          {hasBlockingLinkedActions ? <p className="text-sm text-amber-700">{ui.cannotCloseWithOpenActions}</p> : null}
        </section>
      ) : null}

      {initialSewo && initialSewo.status === SEWOStatus.CLOSED ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.statusManagement}</h4>
          <textarea
            value={statusReason}
            onChange={(event) => setStatusReason(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={ui.statusChangeReason}
            disabled={changingStatus}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              size="sm"
              disabled={changingStatus}
              onClick={() => void reopenSewo()}
            >
              {changingStatus ? ui.savingAction : "Reopen S-EWO"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.associatedCommunication}</h4>
            </div>
            <div className="flex items-center gap-2">
              {showAssociatedCommunicationSummary ? (
                associatedCommunicationHref ? (
                  <Link
                    href={associatedCommunicationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`rounded-full px-3 py-1 text-xs font-semibold hover:underline ${selectedCommunication ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-700"}`}
                  >
                    {associatedCommunicationSummary}
                  </Link>
                ) : (
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedCommunication ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-700"}`}>
                    {associatedCommunicationSummary}
                  </div>
                )
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAssociatedCommunicationExpanded((current) => !current)}
                title={associatedCommunicationExpanded ? ui.collapseSection : ui.expandSection}
                className="gap-2"
              >
                {associatedCommunicationExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span>{associatedCommunicationExpanded ? ui.collapseSection : ui.expandSection}</span>
              </Button>
            </div>
          </div>

          {associatedCommunicationExpanded ? (
          <div className={`space-y-3 ${skipCommunicationSelection ? "opacity-50" : ""}`}>
            <div>
              <Button
                type="button"
                size="sm"
                variant={skipCommunicationSelection ? "default" : "secondary"}
                onClick={() => {
                  setSkipCommunicationSelection((current) => !current);
                  setCommunicationId("");
                  setEditableCommunicationActions([]);
                  setEvidenceAttachments([]);
                  setActionsMessage("");
                }}
                title={ui.continueWithoutLinkedCommunication}
                className="gap-2"
              >
                {skipCommunicationSelection ? <ArrowRightCircle className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                <span>{skipCommunicationSelection ? ui.manualMode : ui.skipLink}</span>
              </Button>
            </div>

            {monthKeys.length > 1 ? (
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {ui.month}
                </label>
                <select
                  value={selectedMonthKey}
                  onChange={(event) => setSelectedMonthKey(event.target.value)}
                  className="min-w-[220px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {monthKeys.map((monthKey) => {
                    const monthLabel = communications.find((communication) => communication.monthKey === monthKey)?.monthLabel ?? monthKey;
                    const count = communications.filter((communication) => communication.monthKey === monthKey).length;
                    return (
                      <option key={monthKey} value={monthKey}>
                        {monthLabel} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[110px_minmax(0,1fr)_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{ui.tableDate}</span>
                <span>{ui.communication}</span>
                <span className="text-right">{ui.tableStatus}</span>
              </div>

              <div className="max-h-[260px] overflow-y-auto">
                {visibleCommunications.map((communication) => {
                  const selected = communication.id === communicationId;
                  const blocked = Boolean(communication.linkedSewoId && communication.linkedSewoId !== initialSewo?.id);

                  return (
                    <button
                      key={communication.id}
                      type="button"
                      disabled={blocked || skipCommunicationSelection}
                      onClick={() => {
                        setSkipCommunicationSelection(false);
                        setCommunicationId(communication.id);
                      }}
                      className={`grid w-full grid-cols-[110px_minmax(0,1fr)_120px] gap-3 border-t border-slate-100 px-4 py-3 text-left first:border-t-0 ${
                        selected ? "bg-teal-50" : "bg-white"
                      } ${blocked ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50"}`}
                    >
                      <span className="text-sm font-medium text-slate-700">{communication.eventDate}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {communication.codigoCompleto ?? communication.codigoAbreviado ?? "Requires code update"}
                        </span>
                        <span className="block truncate text-xs font-medium text-slate-600">{communication.typeLabel}</span>
                        <span className="block truncate text-xs text-slate-500">{communication.locationLabel}</span>
                      </span>
                      <span className="flex justify-end">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            blocked
                              ? "bg-amber-100 text-amber-800"
                              : selected
                                ? "bg-teal-100 text-teal-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {blocked ? ui.linked : selected ? ui.selected : ui.choose}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {visibleCommunications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">{ui.noCommunicationsForMonth}</div>
                ) : null}
              </div>
            </div>
          </div>
          ) : null}
        </section>

      {canContinue ? (
        <>
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.tableDate}</span>
              <input
                type="date"
                value={analysisDate}
                onChange={(event) => setAnalysisDate(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.eventClassification}</span>
              <input
                value={eventClassification}
                onChange={(event) => setEventClassification(event.target.value)}
                readOnly={Boolean(selectedCommunication)}
                className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm ${selectedCommunication ? "bg-white" : "bg-white"}`}
              />
            </label>
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{ui.selectedCommunication}</p>
              {selectedCommunication ? (
                <>
                  <p className="mt-1">{selectedCommunication.codigoCompleto ?? selectedCommunication.codigoAbreviado ?? "Requires code update"}</p>
                  <p>{selectedCommunication.eventDate} | {selectedCommunication.typeLabel}</p>
                  <p>{selectedCommunication.locationLabel}</p>
                </>
              ) : communicationId ? (
                <p className="mt-1">Requires code update</p>
              ) : (
                <p className="mt-1">{ui.manualWithoutCommunication}</p>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.area}</span>
              <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">{ui.selectArea}</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.workstation}</span>
              <select value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">{ui.selectWorkstation}</option>
                {workstations.map((workstation) => <option key={workstation.id} value={workstation.id}>{workstation.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.shift}</span>
              <select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">{ui.selectShift}</option>
                {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
              </select>
            </label>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.involvedPerson}</span>
                  <select value={involvedWorkerId} onChange={(event) => setInvolvedWorkerId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">{ui.selectWorker}</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.employeeNo} - {worker.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.nature}</span>
                  <select value={natureId} onChange={(event) => setNatureId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">{ui.selectNature}</option>
                    {injuryTypes.map((injuryType) => <option key={injuryType.id} value={injuryType.id}>{injuryType.name}</option>)}
                  </select>
                </label>
              </div>

              {selectedWorker ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{selectedWorker.name}</p>
                  <p>{selectedWorker.employeeNo}</p>
                  <p>{selectedWorker.dept ?? ui.departmentNotDefined}</p>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.usualJob}</span>
                  <select value={usualWork} onChange={(event) => setUsualWork(event.target.value as "YES" | "NO")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="YES">{ui.yes}</option>
                    <option value="NO">{ui.no}</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.whichOperation}</span>
                  <input value={whichText} onChange={(event) => setWhichText(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={ui.whichOperationPlaceholder} />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.anatomicalModel}</p>
              <BodyZonePicker bodyParts={bodyParts} value={bodyPartId} onChange={setBodyPartId} labels={ui.bodyZonePicker} required={requiresBodyPart} />
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-teal-300 bg-teal-50 p-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-teal-900">{ui.evidenceUpload}</h4>
              <p className="text-sm text-slate-700">{ui.evidenceUploadDescription}</p>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                addEvidenceFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              className="mt-4 w-full rounded-md border border-teal-300 bg-white px-3 py-3 text-sm"
            />

            {evidenceAttachments.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {evidenceAttachments.map((attachment) => (
                  <article key={attachment.id} className="grid gap-3 rounded-lg border border-teal-200 bg-white p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto]">
                    <a
                      href={attachment.downloadUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {attachment.downloadUrl && attachment.contentType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachment.downloadUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
                      ) : (
                        <FileImage className="h-8 w-8 text-slate-400" />
                      )}
                    </a>

                    <div className="min-w-0 space-y-2">
                      <div>
                        <p className="truncate text-sm font-semibold text-slate-900">{attachment.fileName}</p>
                        <p className="text-xs text-slate-500">{attachment.contentType}</p>
                      </div>
                      <label className="block text-sm text-slate-700">
                        <span className="mb-1 block font-medium">{ui.caption}</span>
                        <input
                          value={attachment.caption ?? ""}
                          onChange={(event) => updateEvidenceCaption(attachment.id, event.target.value)}
                          maxLength={200}
                          placeholder={ui.captionPlaceholder}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <Button type="button" variant="ghost" size="sm" onClick={() => removeEvidenceAttachment(attachment.id)} className="self-start gap-2">
                      <Trash2 className="h-4 w-4" />
                      <span>{ui.remove}</span>
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-teal-200 bg-white px-3 py-4 text-sm text-slate-500">
                {ui.noEvidenceFiles}
              </p>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.howDidTheAccidentHappen}</span>
              <textarea value={howText} onChange={(event) => setHowText(event.target.value)} rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.immediateCorrectiveActionPlan}</span>
              <textarea value={immediateAction} onChange={(event) => setImmediateAction(event.target.value)} rows={4} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-slate-800" />
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.analysis}</h4>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.analysisText}</span>
              <textarea value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} rows={5} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.fiveWhy}</p>
                <Button type="button" size="sm" variant="secondary" onClick={addFiveWhy}>{ui.addWhy}</Button>
              </div>
              <div className="space-y-3">
                {fiveWhys.map((row, index) => (
                  <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.whyLabel} {index + 1}</span>
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
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.answerLabel} {index + 1}</span>
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
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.rootCauseAnalysis}</h4>
            </div>

            {rootCauseGroups.map((group) => (
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
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.rootCause}</span>
                      <select
                        value={detail.isRootCause ? "YES" : "NO"}
                        onChange={(event) =>
                          setRootCauseDetails((current) =>
                            current.map((item) => (item.id === detail.id ? { ...item, isRootCause: event.target.value === "YES" } : item)),
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="NO">{ui.no}</option>
                        <option value="YES">{ui.yes}</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.sifPsifDecisionTree}</h4>
                <HelpPopover
                  title={ui.sifPsifInformationTitle}
                  body={ui.sifPsifInformationBody}
                  buttonLabel={ui.sifPsifInformationButtonLabel}
                />
              </div>
              <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${getSifPsifResultClassName(sifPsifResult)}`}>
                {ui.sifPsifResult}: {getSifPsifResultLabel(sifPsifResult, ui)}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_160px] lg:items-center">
              <div className="rounded-lg border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-3 text-center text-sm font-bold text-[var(--brand-700)]">
                {ui.eventReported}
              </div>
              <div className="rounded-lg border-2 border-[var(--brand-700)] bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                {ui.actualSifQuestion}
              </div>
              <YesNoToggle
                value={sifPsifDecision.actualSif}
                onChange={(value) => setSifPsifDecision((current) => ({ ...current, actualSif: value }))}
                ui={ui}
              />
            </div>

            {sifPsifDecision.actualSif === "YES" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {ui.sifPsifResult}: {ui.sifResult}
              </div>
            ) : null}

            {sifPsifDecision.actualSif === "NO" ? (
              <div className="space-y-3">
                {visibleSifPsifExposureKeys.map((key) => (
                  <div key={key} className="space-y-3">
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[48px_minmax(0,1fr)_160px] lg:items-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-500 shadow-sm">
                        {SIF_PSIF_EXPOSURE_KEYS.indexOf(key) + 1}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">{ui.sifPsifExposureQuestions[key]}</p>
                      <YesNoToggle value={sifPsifDecision.exposures[key]} onChange={(value) => updateSifPsifExposure(key, value)} ui={ui} />
                    </div>

                    {activePsifExposureKey === key ? (
                      <div className="space-y-3 rounded-2xl border border-[var(--brand-300)] bg-[var(--brand-50)] p-4">
                        <h5 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-700)]">{ui.sifPsifReasonabilityCheck}</h5>
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
                          <p className="text-sm font-semibold text-slate-900">{ui.repeatedSifPotentialQuestion}</p>
                          <YesNoToggle
                            value={sifPsifDecision.repeatedSifPotential}
                            onChange={(value) => setSifPsifDecision((current) => ({ ...current, repeatedSifPotential: value }))}
                            ui={ui}
                          />
                        </div>
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
                          <p className="text-sm font-semibold text-slate-900">{ui.oneWhatIfAwayQuestion}</p>
                          <YesNoToggle
                            value={sifPsifDecision.oneWhatIfAway}
                            onChange={(value) => setSifPsifDecision((current) => ({ ...current, oneWhatIfAway: value }))}
                            ui={ui}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {sifPsifResult === "NO_PSIF" && showPsifReasonability ? (
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.noPsifExplanation}</span>
                <textarea
                  value={sifPsifDecision.noPsifExplanation}
                  onChange={(event) => setSifPsifDecision((current) => ({ ...current, noPsifExplanation: event.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder={ui.noPsifExplanationPlaceholder}
                />
              </label>
            ) : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.previousDetected}</span>
              <select value={previousDetected} onChange={(event) => setPreviousDetected(event.target.value as "YES" | "NO")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="NO">{ui.no}</option>
                <option value="YES">{ui.yes}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.previousDetectedDescription}</span>
              <textarea value={previousDetectedDescription} onChange={(event) => setPreviousDetectedDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </section>

          {!isSubmittedSewo ? (
            <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.actionPlan}</h4>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setActionPlans((current) => [...current, createActionPlanRow()])}>
                {ui.addAction}
              </Button>
            </div>

            <div className="space-y-3">
              {actionPlans.map((action) => (
                <div key={action.id} className="grid gap-3 rounded-xl border border-slate-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{ui.action}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setActionPlans((current) => (current.length === 1 ? current : current.filter((item) => item.id !== action.id)))}
                    >
                      {ui.remove}
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.title}</span>
                      <input value={action.title} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, title: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.category}</span>
                      <select value={action.category} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, category: event.target.value as ActionCategory } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionCategory.CORRECTIVE}>{ui.categoryLabels.CORRECTIVE}</option>
                        <option value={ActionCategory.PREVENTIVE}>{ui.categoryLabels.PREVENTIVE}</option>
                        <option value={ActionCategory.IMPROVEMENT}>{ui.categoryLabels.IMPROVEMENT}</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.description}</span>
                    <textarea value={action.description} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, description: event.target.value } : item)))} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </label>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.owner}</span>
                      <select value={action.ownerUserId} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, ownerUserId: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="">{ui.selectOwner}</option>
                        {actionOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.priority}</span>
                      <select value={action.priority} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, priority: event.target.value as ActionPriority } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionPriority.LOW}>{ui.priorityLabels.LOW}</option>
                        <option value={ActionPriority.MEDIUM}>{ui.priorityLabels.MEDIUM}</option>
                        <option value={ActionPriority.HIGH}>{ui.priorityLabels.HIGH}</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dueDate}</span>
                      <input type="date" value={action.dueDate} onChange={(event) => setActionPlans((current) => current.map((item) => (item.id === action.id ? { ...item, dueDate: event.target.value } : item)))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            </section>
          ) : null}

          {showLinkedActionsSection ? (
            <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {initialSewo ? ui.linkedActions : ui.openActionsFromCommunication}
                  </h4>
                </div>
                {actionsMessage ? <p className="text-sm text-slate-700">{actionsMessage}</p> : null}
              </div>
              <div className="space-y-3">
                {editableCommunicationActions.length ? editableCommunicationActions.map((action) => (
                  <div key={action.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                        <p className="text-xs text-slate-500">{ui.actionStatusLabels[action.status] ?? action.status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/app/${plant}/actions/${action.id}`} className="text-sm font-medium text-teal-700 hover:underline">
                          {ui.openAction}
                        </Link>
                        <Button type="button" size="sm" onClick={() => saveExistingAction(action.id)} disabled={savingActionId === action.id || !action.dirty}>
                          {savingActionId === action.id ? ui.savingAction : ui.saveAction}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.title}</span>
                        <input value={action.title} onChange={(event) => updateExistingAction(action.id, { title: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.owner}</span>
                        <select value={action.ownerUserId} onChange={(event) => updateExistingAction(action.id, { ownerUserId: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          {actionOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="mt-3 block space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.description}</span>
                      <textarea value={action.description} onChange={(event) => updateExistingAction(action.id, { description: event.target.value })} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>

                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.priority}</span>
                        <select value={action.priority} onChange={(event) => updateExistingAction(action.id, { priority: event.target.value as ActionPriority })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value={ActionPriority.LOW}>{ui.priorityLabels.LOW}</option>
                          <option value={ActionPriority.MEDIUM}>{ui.priorityLabels.MEDIUM}</option>
                          <option value={ActionPriority.HIGH}>{ui.priorityLabels.HIGH}</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.category}</span>
                        <select value={action.category} onChange={(event) => updateExistingAction(action.id, { category: event.target.value as ActionCategory })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value={ActionCategory.CORRECTIVE}>{ui.categoryLabels.CORRECTIVE}</option>
                          <option value={ActionCategory.PREVENTIVE}>{ui.categoryLabels.PREVENTIVE}</option>
                          <option value={ActionCategory.IMPROVEMENT}>{ui.categoryLabels.IMPROVEMENT}</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dueDate}</span>
                        <input type="date" value={action.dueDate} onChange={(event) => updateExistingAction(action.id, { dueDate: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                      </label>
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-500">{ui.noLinkedActions}</p>}
              </div>

              {showLinkedActionCreator ? (
                <div className="space-y-3 rounded-xl border border-dashed border-[var(--brand-300)] bg-[var(--brand-50)] p-4">
                  <h5 className="text-sm font-semibold text-slate-900">{ui.createLinkedAction}</h5>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.title}</span>
                      <input value={linkedActionDraft.title} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.category}</span>
                      <select value={linkedActionDraft.category} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, category: event.target.value as ActionCategory }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionCategory.CORRECTIVE}>{ui.categoryLabels.CORRECTIVE}</option>
                        <option value={ActionCategory.PREVENTIVE}>{ui.categoryLabels.PREVENTIVE}</option>
                        <option value={ActionCategory.IMPROVEMENT}>{ui.categoryLabels.IMPROVEMENT}</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.description}</span>
                    <textarea value={linkedActionDraft.description} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, description: event.target.value }))} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </label>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.owner}</span>
                      <select value={linkedActionDraft.ownerUserId} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, ownerUserId: event.target.value }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value="">{ui.selectOwner}</option>
                        {actionOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.priority}</span>
                      <select value={linkedActionDraft.priority} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, priority: event.target.value as ActionPriority }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        <option value={ActionPriority.LOW}>{ui.priorityLabels.LOW}</option>
                        <option value={ActionPriority.MEDIUM}>{ui.priorityLabels.MEDIUM}</option>
                        <option value={ActionPriority.HIGH}>{ui.priorityLabels.HIGH}</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dueDate}</span>
                      <input type="date" value={linkedActionDraft.dueDate} onChange={(event) => setLinkedActionDraft((current) => ({ ...current, dueDate: event.target.value }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" size="sm" onClick={() => void createLinkedAction()} disabled={creatingLinkedAction}>
                      {creatingLinkedAction ? ui.savingAction : ui.createLinkedAction}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {!isSubmittedSewo ? (
              <Button size="sm" type="button" variant="secondary" disabled={loading} onClick={() => void saveSewo("draft")}>
                {loading ? ui.savingAction : ui.saveDraft}
              </Button>
            ) : null}
            {isRejectedSewo ? (
              <Button size="sm" type="button" variant="secondary" disabled={loading} onClick={() => void saveSewo("save")}>
                {loading ? ui.savingAction : ui.saveChanges}
              </Button>
            ) : null}
            <Button size="sm" type="submit" disabled={loading}>
              {loading
                ? ui.savingAction
                : !initialSewo || initialSewo.status === SEWOStatus.DRAFT
                  ? ui.createSewo
                  : isRejectedSewo
                    ? ui.resubmitSewo
                    : ui.saveChanges}
            </Button>
            {message ? <p className="text-sm text-slate-700">{message}</p> : null}
          </div>
        </>
      ) : null}
    </form>
  );
}
