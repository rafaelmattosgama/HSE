"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreateSewoQuick } from "@/components/feature/create-sewo-quick";
import { Button } from "@/components/ui/button";

type SewoRow = {
  id: string;
  date: string;
  local: string;
  typeLabel: string;
  status: string;
  communicationId: string;
  performedByName: string;
  description: string;
};

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

export function SewoWorkspace({
  plant,
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
}: {
  plant: string;
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
}) {
  const [creating, setCreating] = useState(false);
  const [selectedSewoId, setSelectedSewoId] = useState<string | null>(null);
  const openSewos = useMemo(() => sewoRows.filter((row) => row.status === "DRAFT" || row.status === "IN_APPROVAL"), [sewoRows]);
  const selectedSewo = sewoRows.find((row) => row.id === selectedSewoId) ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">S-EWO</h1>
            <p className="mt-1 text-sm text-slate-600">List of investigations over time and a dedicated entry point to create a new S-EWO investigation.</p>
          </div>
          <Button type="button" onClick={() => setCreating((current) => !current)}>
            {creating ? "Hide creation" : "Create S-EWO"}
          </Button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Tipo de S-EWO</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Editar</th>
            </tr>
          </thead>
          <tbody>
            {sewoRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">{row.local}</td>
                <td className="px-4 py-3">{row.typeLabel}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{row.status}</span>
                </td>
                <td className="px-4 py-3">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedSewoId(row.id)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
            {sewoRows.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">No S-EWO records found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {selectedSewo ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">S-EWO selected</h2>
              <p className="mt-1 text-sm text-slate-600">{selectedSewo.date} | {selectedSewo.typeLabel} | {selectedSewo.local}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/api/plants/${plant}/sewo/${selectedSewo.id}/report?format=pdf`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Export PDF
              </Link>
              <Link href={`/api/plants/${plant}/sewo/${selectedSewo.id}/report?format=xlsx`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Export Excel
              </Link>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedSewoId(null)}>
                Close
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">Status:</span> {selectedSewo.status}</p>
              <p className="mt-1"><span className="font-semibold text-slate-900">Performed by:</span> {selectedSewo.performedByName}</p>
              <p className="mt-1"><span className="font-semibold text-slate-900">Communication:</span> {selectedSewo.communicationId}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Summary</p>
              <p className="mt-1">{selectedSewo.description}</p>
            </div>
          </div>
        </section>
      ) : null}

      {creating ? (
        <>
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Open S-EWO</h2>
              <p className="mt-1 text-sm text-slate-600">Existing investigations already opened, shown here before a new one is created.</p>
            </div>
            <div className="space-y-3">
              {openSewos.length ? openSewos.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.date} | {row.typeLabel} | {row.local}</p>
                      <p className="mt-1 text-sm text-slate-600">{row.description}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{row.status}</span>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No open S-EWO records.</p>}
            </div>
          </section>

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
          />
        </>
      ) : null}
    </div>
  );
}
