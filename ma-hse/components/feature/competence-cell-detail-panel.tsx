"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { X } from "lucide-react";
import { STATE_META } from "@/components/feature/competence-matrix-manager";
import { CreateCompetenceAction, type CompetenceActionOwnerOption } from "@/components/feature/create-competence-action";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import { formatCompetenceBlockedReason, formatCompetenceCellText } from "@/lib/competence-cell-text";
import {
  BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED,
  BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED,
} from "@/lib/services/competence-state-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

type CompetenceRowWire = {
  competenceTypeId: string;
  code: string;
  name: string;
  category: string;
  state: string;
  isRequired: boolean;
  requirementSource: string | null;
  validUntil: string | null;
  daysToExpiry: number | null;
  blockedReason: string | null;
  currentAuthorizationId: string | null;
};

type HistoryEventWire =
  | { type: "TRAINING"; id: string; occurredAt: string; competenceTypeId: string; result: string; provider: string | null; trainerName: string | null; certificateExpiresAt: string | null }
  | { type: "ASSESSMENT"; id: string; occurredAt: string; competenceTypeId: string; result: string; method: string; assessorName: string | null }
  | { type: "AUTHORIZATION_GRANTED"; id: string; occurredAt: string; competenceTypeId: string; validFrom: string; validUntil: string; restrictions: string | null; grantedByName: string | null }
  | { type: "AUTHORIZATION_SUSPENDED"; id: string; occurredAt: string; competenceTypeId: string; reason: string | null; actorName: string | null }
  | { type: "AUTHORIZATION_REACTIVATED"; id: string; occurredAt: string; competenceTypeId: string; actorName: string | null }
  | { type: "AUTHORIZATION_REVOKED"; id: string; occurredAt: string; competenceTypeId: string; reason: string | null; actorName: string | null };

/** §8: an Action created from a gap, via CompetenceActionLink — never a direct FK on Action. */
type LinkedActionWire = {
  id: string;
  competenceTypeId: string;
  actionId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  closedAt: string | null;
  createdAt: string;
};

type ProfileWire = {
  worker: { id: string; name: string; roleName: string | null; areaName: string | null };
  competences: CompetenceRowWire[];
  history: HistoryEventWire[];
  actionLinks: LinkedActionWire[];
};

type ActiveForm = "training" | "assessment" | "authorization" | "suspend" | "reactivate" | "revoke" | "action" | null;

function roleCanAny(viewerRole: RoleCode, allowed: RoleCode[]) {
  return viewerRole === RoleCode.N0_ADMIN || viewerRole === RoleCode.N1_CORPORATE || allowed.includes(viewerRole);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function CompetenceCellDetailPanel({
  plant,
  labels,
  viewerRole,
  competenceWorkerId,
  competenceTypeId,
  competenceTypeName,
  workerName,
  owners,
  onClose,
  onChanged,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  viewerRole: RoleCode;
  competenceWorkerId: string;
  competenceTypeId: string;
  competenceTypeName: string;
  workerName: string;
  owners: CompetenceActionOwnerOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [profile, setProfile] = useState<ProfileWire | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    fetch(`/api/plants/${plant}/competences/workers/${competenceWorkerId}`)
      .then((response) => requireApiResponse<ProfileWire>(response, labels.formError))
      .then((envelope) => {
        if (!cancelled) setProfile(envelope.data ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : labels.formError);
      });
    return () => {
      cancelled = true;
    };
  }, [plant, competenceWorkerId, labels.formError]);

  const currentRow = profile?.competences.find((row) => row.competenceTypeId === competenceTypeId) ?? null;
  const relevantHistory = useMemo(
    () => (profile?.history ?? []).filter((event) => event.competenceTypeId === competenceTypeId),
    [profile, competenceTypeId],
  );

  const latestPassedTraining = relevantHistory.find(
    (event): event is HistoryEventWire & { type: "TRAINING" } => event.type === "TRAINING" && event.result === "PASSED",
  );
  const latestCompetentAssessment = relevantHistory.find(
    (event): event is HistoryEventWire & { type: "ASSESSMENT" } => event.type === "ASSESSMENT" && event.result === "COMPETENT",
  );

  const canRegister = roleCanAny(viewerRole, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR]);
  const canGrant = roleCanAny(viewerRole, [RoleCode.N3_SAFETY]);
  const canSuspendOrReactivate = roleCanAny(viewerRole, [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR]);
  const canRevoke = roleCanAny(viewerRole, [RoleCode.N3_SAFETY]);
  const canCreateAction = roleCanAny(viewerRole, [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR]);

  const hasActiveAuthorization = currentRow ? ["VALID", "EXPIRING", "EXPIRED"].includes(currentRow.state) && currentRow.currentAuthorizationId : false;
  const hasSuspendedAuthorization = currentRow?.state === "SUSPENDED" && currentRow.currentAuthorizationId;

  const relevantActionLinks = useMemo(
    () => (profile?.actionLinks ?? []).filter((link) => link.competenceTypeId === competenceTypeId),
    [profile, competenceTypeId],
  );

  async function submit(url: string, method: string, body: unknown) {
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await requireApiResponse(response, labels.formError);
      setActiveForm(null);
      onChanged();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : labels.formError);
    } finally {
      setSaving(false);
    }
  }

  const meta = currentRow ? STATE_META[currentRow.state] : null;
  const explainedBlockedReason = currentRow?.blockedReason === BLOCKED_REASON_TRAINING_CERTIFICATE_EXPIRED
    ? labels.cellPanelExplainTrainingExpired
    : currentRow?.blockedReason === BLOCKED_REASON_MEDICAL_FITNESS_EXPIRED
      ? labels.cellPanelExplainMedical
      : null;

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/40 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="app-panel flex h-full w-full max-w-lg flex-col overflow-y-auto rounded-l-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{competenceTypeName}</h2>
            <p className="mt-1 text-sm text-slate-600">{workerName}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label={labels.cellPanelClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-4">
          {loadError ? <p className="text-sm font-medium text-rose-600">{loadError}</p> : null}

          {currentRow && meta ? (
            <section>
              <h3 className="app-section-eyebrow">{labels.cellPanelCurrentStateTitle}</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                  {formatCompetenceCellText(currentRow, labels)}
                </span>
              </div>
              {explainedBlockedReason ? (
                <p className="mt-2 text-sm text-slate-600">{explainedBlockedReason}</p>
              ) : currentRow.blockedReason ? (
                <p className="mt-2 text-sm text-slate-600">{formatCompetenceBlockedReason(currentRow.blockedReason, labels)}</p>
              ) : null}
            </section>
          ) : null}

          <section>
            <h3 className="app-section-eyebrow">{labels.cellPanelTimelineTitle}</h3>
            {relevantHistory.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{labels.cellPanelNoHistory}</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {relevantHistory.map((event) => (
                  <li key={`${event.type}-${event.id}`} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-semibold text-slate-900">
                      {event.type === "TRAINING" && labels.eventTraining}
                      {event.type === "ASSESSMENT" && labels.eventAssessment}
                      {event.type === "AUTHORIZATION_GRANTED" && labels.eventAuthorizationGranted}
                      {event.type === "AUTHORIZATION_SUSPENDED" && labels.eventAuthorizationSuspended}
                      {event.type === "AUTHORIZATION_REACTIVATED" && labels.eventAuthorizationReactivated}
                      {event.type === "AUTHORIZATION_REVOKED" && labels.eventAuthorizationRevoked}
                    </p>
                    <p className="text-slate-500">{formatDateTime(event.occurredAt)}</p>
                    {event.type === "TRAINING" ? (
                      <p className="mt-1 text-slate-700">
                        {event.result === "PASSED" ? labels.trainingResultPassed : labels.trainingResultFailed}
                        {event.provider ? ` · ${event.provider}` : ""}
                      </p>
                    ) : null}
                    {event.type === "ASSESSMENT" ? (
                      <p className="mt-1 text-slate-700">
                        {event.result === "COMPETENT" ? labels.assessmentResultCompetent : labels.assessmentResultNotYetCompetent}
                      </p>
                    ) : null}
                    {event.type === "AUTHORIZATION_GRANTED" ? (
                      <p className="mt-1 text-slate-700">
                        {new Date(event.validFrom).toLocaleDateString()} → {new Date(event.validUntil).toLocaleDateString()}
                        {event.grantedByName ? ` · ${event.grantedByName}` : ""}
                      </p>
                    ) : null}
                    {(event.type === "AUTHORIZATION_SUSPENDED" || event.type === "AUTHORIZATION_REVOKED") ? (
                      <p className="mt-1 text-slate-700">
                        {event.reason}
                        {event.actorName ? ` · ${event.actorName}` : ""}
                      </p>
                    ) : null}
                    {event.type === "AUTHORIZATION_REACTIVATED" && event.actorName ? (
                      <p className="mt-1 text-slate-700">{event.actorName}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3 className="app-section-eyebrow">{labels.actionLinkedTitle}</h3>
            {relevantActionLinks.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{labels.actionLinkedEmpty}</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {relevantActionLinks.map((link) => {
                  const isResolved = link.status === "CLOSED";
                  return (
                    <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{link.title}</p>
                        <p className="text-slate-500">{new Date(link.dueDate).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${isResolved ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                          {isResolved ? labels.actionStatusResolved : labels.actionStatusOpen}
                        </span>
                        <Link href={`/app/${plant}/actions/${link.actionId}`} className="shrink-0 text-sm font-medium text-[var(--brand-700)] hover:underline">
                          {labels.actionOpenLink}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-2 text-xs text-slate-500">{labels.actionResolvedNote}</p>
          </section>

          {formError ? <p className="text-sm font-medium text-rose-600">{formError}</p> : null}

          {activeForm === "training" ? (
            <TrainingForm
              labels={labels}
              saving={saving}
              onCancel={() => setActiveForm(null)}
              onSubmit={(payload) =>
                submit(`/api/plants/${plant}/competences/trainings`, "POST", {
                  competenceWorkerId,
                  competenceTypeId,
                  ...payload,
                })
              }
            />
          ) : activeForm === "assessment" ? (
            <AssessmentForm
              labels={labels}
              saving={saving}
              onCancel={() => setActiveForm(null)}
              onSubmit={(payload) =>
                submit(`/api/plants/${plant}/competences/assessments`, "POST", {
                  competenceWorkerId,
                  competenceTypeId,
                  trainingRecordId: latestPassedTraining?.id ?? null,
                  ...payload,
                })
              }
            />
          ) : activeForm === "authorization" ? (
            <AuthorizationForm
              labels={labels}
              saving={saving}
              onCancel={() => setActiveForm(null)}
              onSubmit={(payload) =>
                submit(`/api/plants/${plant}/competences/authorizations`, "POST", {
                  competenceWorkerId,
                  competenceTypeId,
                  trainingRecordId: latestPassedTraining?.id ?? null,
                  assessmentId: latestCompetentAssessment?.id ?? null,
                  ...payload,
                })
              }
            />
          ) : activeForm === "suspend" || activeForm === "revoke" ? (
            <ReasonForm
              labels={labels}
              saving={saving}
              onCancel={() => setActiveForm(null)}
              onSubmit={(reason) =>
                submit(
                  `/api/plants/${plant}/competences/authorizations/${currentRow?.currentAuthorizationId}/${activeForm}`,
                  "POST",
                  { reason },
                )
              }
            />
          ) : activeForm === "reactivate" ? (
            <ReactivateForm
              labels={labels}
              saving={saving}
              onCancel={() => setActiveForm(null)}
              onSubmit={(note) =>
                submit(`/api/plants/${plant}/competences/authorizations/${currentRow?.currentAuthorizationId}/reactivate`, "POST", { note })
              }
            />
          ) : activeForm === "action" && currentRow ? (
            <CreateCompetenceAction
              plant={plant}
              labels={labels}
              competenceWorkerId={competenceWorkerId}
              competenceTypeId={competenceTypeId}
              owners={owners}
              gap={{
                competenceTypeName,
                workerName,
                state: currentRow.state,
                isRequired: currentRow.isRequired,
                validUntil: currentRow.validUntil,
                daysToExpiry: currentRow.daysToExpiry,
                roleName: profile?.worker.roleName ?? null,
                departmentName: profile?.worker.areaName ?? null,
                blockedReason: currentRow.blockedReason,
              }}
              onCreated={() => {
                setActiveForm(null);
                onChanged();
              }}
              onCancel={() => setActiveForm(null)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {canRegister ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setActiveForm("training")}>
                  {labels.actionRegisterTraining}
                </Button>
              ) : null}
              {canRegister ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setActiveForm("assessment")}>
                  {labels.actionRegisterAssessment}
                </Button>
              ) : null}
              {canGrant ? (
                <Button type="button" size="sm" onClick={() => setActiveForm("authorization")}>
                  {labels.actionGrantAuthorization}
                </Button>
              ) : null}
              {canSuspendOrReactivate && hasActiveAuthorization ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => setActiveForm("suspend")}>
                  {labels.actionSuspend}
                </Button>
              ) : null}
              {canSuspendOrReactivate && hasSuspendedAuthorization ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setActiveForm("reactivate")}>
                  {labels.actionReactivate}
                </Button>
              ) : null}
              {canRevoke && (hasActiveAuthorization || hasSuspendedAuthorization) ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => setActiveForm("revoke")}>
                  {labels.actionRevoke}
                </Button>
              ) : null}
              {canCreateAction && currentRow && currentRow.state !== "VALID" && currentRow.state !== "NOT_APPLICABLE" ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setActiveForm("action")}>
                  {labels.actionCreateButton}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainingForm({
  labels,
  saving,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (payload: {
    completedAt: string;
    result: "PASSED" | "FAILED";
    provider: string | null;
    certificateExpiresAt: string | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [completedAt, setCompletedAt] = useState(todayInputValue());
  const [result, setResult] = useState<"PASSED" | "FAILED">("PASSED");
  const [provider, setProvider] = useState("");
  const [certificateExpiresAt, setCertificateExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          completedAt,
          result,
          provider: provider.trim() || null,
          certificateExpiresAt: certificateExpiresAt || null,
          notes: notes.trim() || null,
        });
      }}
    >
      <FormField label={labels.formCompletedAt}>
        <input type="date" required value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formTrainingResult}>
        <select value={result} onChange={(event) => setResult(event.target.value as "PASSED" | "FAILED")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="PASSED">{labels.trainingResultPassed}</option>
          <option value="FAILED">{labels.trainingResultFailed}</option>
        </select>
      </FormField>
      <FormField label={labels.formProvider}>
        <input type="text" value={provider} onChange={(event) => setProvider(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formCertificateExpiresAt}>
        <input type="date" value={certificateExpiresAt} onChange={(event) => setCertificateExpiresAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formNotes}>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
      </FormField>
      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}

function AssessmentForm({
  labels,
  saving,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (payload: {
    assessedAt: string;
    result: "COMPETENT" | "NOT_YET_COMPETENT";
    method: "PRACTICAL_TEST" | "OBSERVATION" | "THEORY_TEST" | "SIMULATOR";
    score: number | null;
    observations: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [assessedAt, setAssessedAt] = useState(todayInputValue());
  const [result, setResult] = useState<"COMPETENT" | "NOT_YET_COMPETENT">("COMPETENT");
  const [method, setMethod] = useState<"PRACTICAL_TEST" | "OBSERVATION" | "THEORY_TEST" | "SIMULATOR">("PRACTICAL_TEST");
  const [score, setScore] = useState("");
  const [observations, setObservations] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          assessedAt,
          result,
          method,
          score: score.trim() ? Number(score) : null,
          observations: observations.trim() || null,
        });
      }}
    >
      <FormField label={labels.formAssessedAt}>
        <input type="date" required value={assessedAt} onChange={(event) => setAssessedAt(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formAssessmentResult}>
        <select value={result} onChange={(event) => setResult(event.target.value as "COMPETENT" | "NOT_YET_COMPETENT")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="COMPETENT">{labels.assessmentResultCompetent}</option>
          <option value="NOT_YET_COMPETENT">{labels.assessmentResultNotYetCompetent}</option>
        </select>
      </FormField>
      <FormField label={labels.formAssessmentMethod}>
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as "PRACTICAL_TEST" | "OBSERVATION" | "THEORY_TEST" | "SIMULATOR")}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="PRACTICAL_TEST">{labels.assessmentMethodPracticalTest}</option>
          <option value="OBSERVATION">{labels.assessmentMethodObservation}</option>
          <option value="THEORY_TEST">{labels.assessmentMethodTheoryTest}</option>
          <option value="SIMULATOR">{labels.assessmentMethodSimulator}</option>
        </select>
      </FormField>
      <FormField label={labels.formScore}>
        <input type="number" min={0} max={100} value={score} onChange={(event) => setScore(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formObservations}>
        <textarea value={observations} onChange={(event) => setObservations(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
      </FormField>
      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}

function AuthorizationForm({
  labels,
  saving,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (payload: { validFrom: string; restrictions: string | null }) => void;
  onCancel: () => void;
}) {
  const [validFrom, setValidFrom] = useState(todayInputValue());
  const [restrictions, setRestrictions] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ validFrom, restrictions: restrictions.trim() || null });
      }}
    >
      <FormField label={labels.formValidFrom}>
        <input type="date" required value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </FormField>
      <FormField label={labels.formRestrictions}>
        <textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
      </FormField>
      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}

function ReasonForm({
  labels,
  saving,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason.trim());
      }}
    >
      <FormField label={labels.formReason}>
        <textarea required value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
      </FormField>
      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}

function ReactivateForm({
  labels,
  saving,
  onSubmit,
  onCancel,
}: {
  labels: CompetencesUiDictionary;
  saving: boolean;
  onSubmit: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(note.trim() || null);
      }}
    >
      <FormField label={labels.formNote}>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
      </FormField>
      <FormActions labels={labels} saving={saving} onCancel={onCancel} />
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FormActions({ labels, saving, onCancel }: { labels: CompetencesUiDictionary; saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        {labels.formCancel}
      </Button>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? labels.formSaving : labels.formSave}
      </Button>
    </div>
  );
}
