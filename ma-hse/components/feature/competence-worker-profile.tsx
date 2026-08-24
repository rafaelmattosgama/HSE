"use client";

import { useState } from "react";
import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { CompetenceCellDetailPanel } from "@/components/feature/competence-cell-detail-panel";
import { STATE_META } from "@/components/feature/competence-matrix-manager";
import { AppHero, AppPanel } from "@/components/ui/app-surface";
import { formatCompetenceCellText } from "@/lib/competence-cell-text";
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
}: {
  plant: string;
  labels: CompetencesUiDictionary;
  viewerRole: RoleCode;
  profile: CompetenceWorkerProfileView;
}) {
  const [activeCompetenceTypeId, setActiveCompetenceTypeId] = useState<string | null>(null);
  const activeCompetence = profile.competences.find((row) => row.competenceTypeId === activeCompetenceTypeId) ?? null;

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
        <h2 className="app-section-eyebrow">{labels.profileCompetencesTitle}</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {profile.competences.map((row) => {
            const meta = STATE_META[row.state];
            const Icon = meta.icon;
            return (
              <button
                key={row.competenceTypeId}
                type="button"
                onClick={() => setActiveCompetenceTypeId(row.competenceTypeId)}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{row.name}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatCompetenceCellText(row, labels)}
                </span>
              </button>
            );
          })}
        </div>
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
            {profile.history.map((event) => {
              const competenceType = profile.competences.find((row) => row.competenceTypeId === event.competenceTypeId);
              return (
                <li key={`${event.type}-${event.id}`} className="rounded-lg border border-slate-200 p-3 text-sm">
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
          workerName={profile.worker.name}
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
