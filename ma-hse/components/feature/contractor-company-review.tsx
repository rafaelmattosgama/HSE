"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type DocumentRow = {
  id: string;
  type: string;
  fileName: string;
  approvalStatus: string;
  validUntil: string | null;
};

type WorkerRow = {
  id: string;
  name: string;
  approvalStatus: string;
  isActive: boolean;
  approvedUntil: string | null;
  documents: DocumentRow[];
};

type SponsorOption = {
  id: string;
  name: string;
};

function statusClasses(status: string) {
  switch (status) {
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800";
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-rose-100 text-rose-800";
  }
}

export function ContractorCompanyReview({
  plant,
  companyId,
  companyDocuments,
  workers,
  sponsorUserId,
  sponsorOptions,
  canApprove,
}: {
  plant: string;
  companyId: string;
  companyDocuments: DocumentRow[];
  workers: WorkerRow[];
  sponsorUserId: string | null;
  sponsorOptions: SponsorOption[];
  canApprove: boolean;
}) {
  const [message, setMessage] = useState("");
  const [selectedSponsor, setSelectedSponsor] = useState(sponsorUserId ?? "");

  async function approveDocument(kind: "company" | "worker", id: string, approvalStatus: string) {
    const route =
      kind === "company"
        ? `/api/plants/${plant}/contractors/company-documents/${id}`
        : `/api/plants/${plant}/contractors/worker-documents/${id}`;
    const response = await fetch(route, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Approval updated" : json.message ?? "Failed to update approval");
  }

  async function updateCompany(payload: { isActive?: boolean; sponsorUserId?: string | null }) {
    const response = await fetch(`/api/plants/${plant}/contractors/${companyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    setMessage(json.ok ? "Company updated" : json.message ?? "Failed to update company");
  }

  async function notifyCompany() {
    const response = await fetch(`/api/plants/${plant}/contractors/${companyId}/notify`, {
      method: "POST",
    });
    const json = await response.json();
    setMessage(json.ok ? "Follow-up email sent to company" : json.message ?? "Failed to send email");
  }

  async function toggleWorker(workerId: string, isActive: boolean) {
    const response = await fetch(`/api/plants/${plant}/contractors/workers/${workerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Worker updated" : json.message ?? "Failed to update worker");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">MAAP sponsor</label>
            <select
              value={selectedSponsor}
              onChange={(event) => setSelectedSponsor(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!canApprove}
            >
              <option value="">Select sponsor</option>
              {sponsorOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>
          <Button size="sm" type="button" onClick={() => updateCompany({ sponsorUserId: selectedSponsor || null })} disabled={!canApprove}>
            Save sponsor
          </Button>
          <Button size="sm" type="button" onClick={() => updateCompany({ isActive: true })} disabled={!canApprove}>
            Activate company
          </Button>
          <Button size="sm" variant="secondary" type="button" onClick={() => updateCompany({ isActive: false })} disabled={!canApprove}>
            Inactivate company
          </Button>
        </div>
        <div className="mt-3">
          <Button size="sm" variant="ghost" type="button" onClick={notifyCompany} disabled={!canApprove}>
            Send email
          </Button>
        </div>
        {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Company documents</h3>
        <div className="mt-3 space-y-3">
          {companyDocuments.map((document) => (
            <div key={document.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{document.type}</p>
                  <p className="text-xs text-slate-500">{document.fileName} | valid until {document.validUntil ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(document.approvalStatus)}`}>
                    {document.approvalStatus}
                  </span>
                  <Button size="sm" type="button" onClick={() => approveDocument("company", document.id, "APPROVED")} disabled={!canApprove}>Approve</Button>
                  <Button size="sm" variant="destructive" type="button" onClick={() => approveDocument("company", document.id, "REJECTED")} disabled={!canApprove}>Reject</Button>
                </div>
              </div>
            </div>
          ))}
          {!companyDocuments.length ? <p className="text-sm text-slate-500">No company documents uploaded yet.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Workers</h3>
        <div className="mt-3 space-y-4">
          {workers.map((worker) => (
            <div key={worker.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{worker.name}</p>
                  <p className="text-xs text-slate-500">
                    {worker.isActive ? "Active" : "Inactive"} | approved until {worker.approvedUntil ?? "-"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(worker.approvalStatus)}`}>
                    {worker.approvalStatus}
                  </span>
                  <Button size="sm" type="button" onClick={() => toggleWorker(worker.id, true)} disabled={!canApprove}>Activate</Button>
                  <Button size="sm" variant="secondary" type="button" onClick={() => toggleWorker(worker.id, false)} disabled={!canApprove}>Inactivate</Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {worker.documents.map((document) => (
                  <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{document.type}</p>
                      <p className="text-xs text-slate-500">{document.fileName} | valid until {document.validUntil ?? "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(document.approvalStatus)}`}>
                        {document.approvalStatus}
                      </span>
                      <Button size="sm" type="button" onClick={() => approveDocument("worker", document.id, "APPROVED")} disabled={!canApprove}>Approve</Button>
                      <Button size="sm" variant="destructive" type="button" onClick={() => approveDocument("worker", document.id, "REJECTED")} disabled={!canApprove}>Reject</Button>
                    </div>
                  </div>
                ))}
                {!worker.documents.length ? <p className="text-xs text-slate-500">No worker documents uploaded yet.</p> : null}
              </div>
            </div>
          ))}
          {!workers.length ? <p className="text-sm text-slate-500">No workers registered yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
