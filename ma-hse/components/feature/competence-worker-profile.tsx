"use client";

import { useState } from "react";
import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { CompetenceCellDetailPanel } from "@/components/feature/competence-cell-detail-panel";
import { STATE_META } from "@/components/feature/competence-matrix-manager";
import type { CompetenceActionOwnerOption } from "@/components/feature/create-competence-action";
import { AppHero, AppPanel } from "@/components/ui/app-surface";
import { formatCompetenceCellText } from "@/lib/competence-cell-text";
import { groupCompetenceHistory } from "@/lib/competence-history-grouping";
import { requireApiResponse } from "@/lib/client-api";
import type { CompetenceWorkerProfileView } from "@/lib/services/competence-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}

export function CompetenceWorkerProfile({
  plant,
  labels,
  viewerRole,
  profile,
  owners,
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  viewerRole: RoleCode;
  profile: CompetenceWorkerProfileView;
  owners: CompetenceActionOwnerOption[];
}) {
  const [activeCompetenceTypeId, setActiveCompetenceTypeId] = useState<string | null>(null);
  const [savingRequirementFor, setSavingRequirementFor] = useState<string | null>(null);
  const [requirementError, setRequirementError] = useState("");
  const activeCompetence = profile.competences.find((row) => row.competenceTypeId === activeCompetenceTypeId) ?? null;
  const canEditRequirements = viewerRole === "N0_ADMIN" || viewerRole === "N1_CORPORATE" || viewerRole === "N3_SAFETY" || viewerRole === "N4_SUPERVISOR" || viewerRole === "N6_HR";

  async function setRequirement(competenceTypeId: string, isRequired: boolean) {
    setSavingRequirementFor(competenceTypeId);
    setRequirementError("");
    try {
      const response = await fetch(`/api/plants/${plant}/competences/workers/${profile.worker.id}/requirements`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competenceTypeId, isRequired }),
      });
      await requireApiResponse(response, labels.workerRequirementSaveError);
      window.location.reload();
    } catch (error) {
      setRequirementError(error instanceof Error ? error.message : labels.workerRequirementSaveError);
      setSavingRequirementFor(null);
    }
  }

  async function setAllRequirements(isRequired: boolean) {
    setSavingRequirementFor("__all__");
    setRequirementError("");
    try {
      for (const row of profile.competences) {
        const response = await fetch(`/api/plants/${plant}/competences/workers/${profile.worker.id}/requirements`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ competenceTypeId: row.competenceTypeId, isRequired }),
        });
        await requireApiResponse(response, labels.workerRequirementSaveError);
      }
      window.location.reload();
    } catch (error) {
      setRequirementError(error instanceof Error ? error.message : labels.workerRequirementSaveError);
      setSavingRequirementFor(null);
    }
  }

  return (
    <div className="space-y-5">
      <AppHero
        eyebrow={
          <Link href={`/app/${plant}/competences`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {labels.profileBackToMatrix}
          </Link>
        }
        title={profile.worker.name}
        description={profile.worker.employeeNo}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <AppPanel>
          <h2 className="app-section-eyebrow">{labels.profileIdentificationTitle}</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Row label={labels.profileEmployeeNoLabel} value={profile.worker.employeeNo} />
            <Row label={labels.profileNameLabel} value={profile.worker.name} />
            <Row label={labels.profileDeptLabel} value={profile.worker.areaName ?? profile.worker.dept ?? "—"} />
            <Row label={labels.profileRoleLabel} value={profile.worker.roleName ?? "—"} />
          </dl>
        </AppPanel>

        <AppPanel>
          <h2 className="app-section-eyebrow">{labels.profileComplementaryTitle}</h2>
          {profile.occupationalHealth ? (
            <dl className="mt-2 space-y-2 text-sm">
              <Row label={labels.profileBirthDateLabel} value={formatDate(profile.occupationalHealth.birthDate)} />
              <Row label={labels.profileGenderLabel} value={profile.occupationalHealth.gender} />
              <Row label={labels.profileHireDateLabel} value={formatDate(profile.occupationalHealth.hireDate)} />
              <Row label={labels.profileRoleStartDateLabel} value={formatDate(profile.occupationalHealth.roleStartDate)} />
              <Row label={labels.profileNationalityLabel} value={profile.occupationalHealth.nationality ?? "—"} />
              <Row label={labels.profileWorkstationLabel} value={profile.occupationalHealth.workstationName ?? "—"} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{labels.profileNoOccupationalHealthRecord}</p>
          )}
        </AppPanel>
      </div>

      <AppPanel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="app-section-eyebrow">{labels.profileCompetencesTitle}</h2>
          {canEditRequirements && profile.competences.length > 0 ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">{labels.workerRequirementSummary.replace("{marked}", String(profile.competences.filter((row) => row.isRequired).length)).replace("{total}", String(profile.competences.length))}</span>
              <button type="button" disabled={savingRequirementFor !== null} onClick={() => setAllRequirements(true)} className="font-semibold text-emerald-700 hover:underline disabled:opacity-50">{labels.workerRequirementMarkAll}</button>
              <button type="button" disabled={savingRequirementFor !== null} onClick={() => setAllRequirements(false)} className="font-semibold text-slate-600 hover:underline disabled:opacity-50">{labels.workerRequirementUnmarkAll}</button>
            </div>
          ) : null}
        </div>
        {requirementError ? <p className="mt-2 text-sm font-medium text-rose-600">{requirementError}</p> : null}
        {profile.competences.length === 0 ? (
          <div className="app-empty mt-2 py-6 text-center" role="status">
            <p className="font-semibold text-slate-700">{labels.catalogEmptyTitle}</p>
            <p className="mt-1">{labels.catalogEmptyDescription}</p>
            {viewerRole === "N1_CORPORATE" || viewerRole === "N3_SAFETY" ? (
              <Link href={`/app/${plant}/admin`} className="mt-3 inline-block font-semibold text-emerald-700 hover:underline">
                {labels.catalogEmptyLink}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
          {profile.competences.every((row) => !row.isRequired) ? <div className="app-empty mt-2 py-4 text-center" role="status"><p className="font-semibold text-slate-700">{labels.workerRequirementEmptyTitle}</p><p className="mt-1 text-sm">{labels.workerRequirementEmptyDescription}</p></div> : null}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profile.competences.map((row) => {
              const meta = STATE_META[row.state];
              const Icon = meta.icon;
              return (
                <div key={row.competenceTypeId} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <button type="button" onClick={() => setActiveCompetenceTypeId(row.competenceTypeId)} className="flex items-center justify-between gap-2 text-left hover:opacity-80">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{formatCompetenceCellText(row, labels)}</span>
                  </button>
                  {canEditRequirements ? <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={row.isRequired} disabled={savingRequirementFor !== null} onChange={(event) => setRequirement(row.competenceTypeId, event.target.checked)} />{labels.workerRequirementCheckboxLabel}</label> : null}
                  {row.requirementSource && row.requirementSetAt ? <p className="text-xs text-slate-400">{labels.workerRequirementSetByPrefix.replace("{name}", row.requirementSource).replace("{date}", new Date(row.requirementSetAt).toLocaleDateString())}</p> : null}
                </div>
              );
            })}
          </div>
          </>
        )}
      </AppPanel>

      <AppPanel>
        <h2 className="app-section-eyebrow">{labels.profileDocumentsTitle}</h2>
        <p className="mt-2 text-sm text-slate-500">{labels.profileDocumentsEmpty}</p>
      </AppPanel>

      <AppPanel>
        <h2 className="app-section-eyebrow">{labels.profileHistoryTitle}</h2>
        {profile.history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{labels.profileNoHistory}</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {groupCompetenceHistory(profile.history).map((group, groupIndex) => (
              <li key={group.entryGroupId ?? `legacy-${groupIndex}`} className="rounded-lg border border-slate-200 p-3 text-sm">
                {group.events.length > 1 ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.entryGroupHistoryLabel}</p> : null}
                <ol className="space-y-2">
                {group.events.map((event) => {
              const competenceType = profile.competences.find((row) => row.competenceTypeId === event.competenceTypeId);
              return (
                <li key={`${event.type}-${event.id}`}>
                  <p className="font-semibold text-slate-900">
                    {competenceType?.name ?? event.competenceTypeId} —{" "}
                    {event.type === "TRAINING" && labels.eventTraining}
                    {event.type === "ASSESSMENT" && labels.eventAssessment}
                    {event.type === "AUTHORIZATION_GRANTED" && labels.eventAuthorizationGranted}
                    {event.type === "AUTHORIZATION_SUSPENDED" && labels.eventAuthorizationSuspended}
                    {event.type === "AUTHORIZATION_REACTIVATED" && labels.eventAuthorizationReactivated}
                    {event.type === "AUTHORIZATION_REVOKED" && labels.eventAuthorizationRevoked}
                  </p>
                  <p className="text-slate-500">{formatDateTime(event.occurredAt)}</p>
                </li>
              );
                })}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </AppPanel>

      {activeCompetence ? (
        <CompetenceCellDetailPanel
          plant={plant}
          labels={labels}
          viewerRole={viewerRole}
          competenceWorkerId={profile.worker.id}
          competenceTypeId={activeCompetence.competenceTypeId}
          competenceTypeName={activeCompetence.name}
          competenceType={{ requiresAssessment: activeCompetence.requiresAssessment, requiresAuthorization: activeCompetence.requiresAuthorization }}
          workerName={profile.worker.name}
          owners={owners}
          assessorOptions={owners.map((owner) => ({ id: owner.id, name: owner.name }))}
          onClose={() => setActiveCompetenceTypeId(null)}
          onChanged={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
