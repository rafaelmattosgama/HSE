"use client";

import Link from "next/link";
import { CreateSewoQuick } from "@/components/feature/create-sewo-quick";
import { buttonVariants } from "@/components/ui/button";
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
  priority: "LOW" | "MEDIUM" | "HIGH";
  category: "CORRECTIVE" | "PREVENTIVE" | "IMPROVEMENT";
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

type SewoFormData = {
  id: string;
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
  linkedActions: CommunicationActionOption[];
};

type SewoRow = {
  id: string;
  date: string;
  local: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  communicationId: string | null;
  performedByName: string;
  description: string;
  formData: SewoFormData;
};

export function SewoWorkspace({
  plant,
  initialSelectedSewoId,
  mode = "list",
  causeCatalogVersionId,
  sewoRows,
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
  plant: string;
  initialSelectedSewoId?: string | null;
  mode?: "list" | "create";
  causeCatalogVersionId?: string;
  sewoRows: SewoRow[];
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
  const selectedSewo = initialSelectedSewoId
    ? sewoRows.find((row) => row.id === initialSelectedSewoId) ?? null
    : null;
  const view = selectedSewo ? "edit" : mode;
  const listHref = `/app/${plant}/sewo`;

  return (
    <div className="space-y-6">
      <section className="app-hero rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ui.pageTitle}</h1>
          </div>
          {view === "list" ? (
            <Link href={`${listHref}?mode=create`} className={buttonVariants()}>
              {ui.createButton}
            </Link>
          ) : (
            <Link href={listHref} className={buttonVariants({ variant: "secondary" })}>
              {ui.close}
            </Link>
          )}
        </div>
      </section>

      {view === "list" ? (
        <section className="app-panel overflow-x-auto rounded-xl">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{ui.tableDate}</th>
                <th className="px-4 py-3">{ui.tableLocation}</th>
                <th className="px-4 py-3">{ui.tableType}</th>
                <th className="px-4 py-3">{ui.tableStatus}</th>
                <th className="px-4 py-3">{ui.tableEdit}</th>
              </tr>
            </thead>
            <tbody>
              {sewoRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">{row.local}</td>
                  <td className="px-4 py-3">{row.typeLabel}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{row.statusLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`${listHref}?sewoId=${row.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      {ui.editButton}
                    </Link>
                  </td>
                </tr>
              ))}
              {sewoRows.length === 0 ? (
                <tr className="border-t border-slate-200">
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">{ui.noRecords}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {selectedSewo ? (
        <section className="space-y-3">
          <div className="app-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{ui.editSewoTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedSewo.date} | {selectedSewo.typeLabel} | {selectedSewo.local}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/api/plants/${plant}/sewo/${selectedSewo.id}/report?type=summary&format=pdf`} className="app-toolbar">
                  {ui.exportSummaryReport}
                </Link>
                <Link href={`/api/plants/${plant}/sewo/${selectedSewo.id}/report?type=complete&format=pdf`} className="app-toolbar">
                  {ui.exportCompleteReport}
                </Link>
                <Link href={listHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  {ui.close}
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">{ui.summaryStatus}:</span> {selectedSewo.statusLabel}</p>
                <p className="mt-1"><span className="font-semibold text-slate-900">{ui.summaryPerformedBy}:</span> {selectedSewo.performedByName}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:col-span-2">
                <p className="font-semibold text-slate-900">{ui.summaryTitle}</p>
                <p className="mt-1">{selectedSewo.description}</p>
              </div>
            </div>
          </div>
          <CreateSewoQuick
            initialSewo={selectedSewo.formData}
            causeCatalogVersionId={causeCatalogVersionId}
            communications={communications}
            areas={areas}
            workstations={workstations}
            shifts={shifts}
            workers={workers}
            bodyParts={bodyParts}
            injuryTypes={injuryTypes}
            actionOwners={actionOwners}
            ui={ui}
            rootCauseGroups={rootCauseGroups}
          />
        </section>
      ) : null}

      {view === "create" ? (
        <section className="space-y-3">
          <CreateSewoQuick
            causeCatalogVersionId={causeCatalogVersionId}
            communications={communications}
            areas={areas}
            workstations={workstations}
            shifts={shifts}
            workers={workers}
            bodyParts={bodyParts}
            injuryTypes={injuryTypes}
            actionOwners={actionOwners}
            ui={ui}
            rootCauseGroups={rootCauseGroups}
          />
        </section>
      ) : null}

      {initialSelectedSewoId && !selectedSewo ? (
        <section className="app-panel rounded-2xl p-5">
          <p className="text-sm text-slate-600">{ui.noRecords}</p>
          <Link href={listHref} className={`${buttonVariants({ size: "sm", variant: "secondary" })} mt-4`}>
            {ui.close}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
