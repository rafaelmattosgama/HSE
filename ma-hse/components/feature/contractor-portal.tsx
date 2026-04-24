"use client";

import { ExternalCompanyDocumentType, ExternalWorkerDocumentType } from "@prisma/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type PortalData = {
  id: string;
  companyName: string;
  approvalStatus: string;
  approvedUntil: string | null;
  plant: { code: string; name: string };
  documents: Array<{ type: string; approvalStatus: string; validUntil: string | null; fileName: string }>;
  workers: Array<{
    id: string;
    name: string;
    approvalStatus: string;
    approvedUntil: string | null;
    isActive: boolean;
    documents: Array<{ type: string; approvalStatus: string; validUntil: string | null; fileName: string }>;
  }>;
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

const companyDocumentTypes = Object.values(ExternalCompanyDocumentType) as ExternalCompanyDocumentType[];
const workerDocumentTypes = Object.values(ExternalWorkerDocumentType) as ExternalWorkerDocumentType[];

export function ContractorPortal({ company }: { company: PortalData }) {
  const [message, setMessage] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerBirthDate, setWorkerBirthDate] = useState("");

  async function uploadFile(folder: "communications" | "actions" | "sewo", file: File) {
    const presignResponse = await fetch("/api/contractors/storage/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plantCode: company.plant.code,
        fileName: file.name,
        contentType: file.type || "application/pdf",
        folder,
      }),
    });
    const presignJson = await presignResponse.json();
    if (!presignResponse.ok || !presignJson.ok) throw new Error("Failed to prepare upload");
    await fetch(presignJson.data.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/pdf" }, body: file });
    return { fileKey: presignJson.data.key, fileName: file.name, contentType: file.type || "application/pdf" };
  }

  async function submitCompanyDocument(type: ExternalCompanyDocumentType, file: File, validUntil: string) {
    const attachment = await uploadFile("communications", file);
    const response = await fetch("/api/contractors/company-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...attachment, type, validUntil: validUntil || undefined }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Company document submitted" : json.message ?? "Failed to submit company document");
    if (json.ok) window.location.reload();
  }

  async function createWorker(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/contractors/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: workerName, birthDate: workerBirthDate }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Worker created" : json.message ?? "Failed to create worker");
    if (json.ok) {
      setWorkerName("");
      setWorkerBirthDate("");
      window.location.reload();
    }
  }

  async function submitWorkerDocument(workerId: string, type: ExternalWorkerDocumentType, file: File, validUntil: string) {
    const attachment = await uploadFile("communications", file);
    const response = await fetch("/api/contractors/worker-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId, ...attachment, type, validUntil: validUntil || undefined }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Worker document submitted" : json.message ?? "Failed to submit worker document");
    if (json.ok) window.location.reload();
  }

  async function updateWorker(workerId: string, isActive: boolean) {
    const response = await fetch(`/api/contractors/workers/${workerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Worker updated" : json.message ?? "Failed to update worker");
    if (json.ok) window.location.reload();
  }

  async function deleteWorker(workerId: string) {
    const response = await fetch(`/api/contractors/workers/${workerId}`, {
      method: "DELETE",
    });
    const json = await response.json();
    setMessage(json.ok ? "Worker deleted" : json.message ?? "Failed to delete worker");
    if (json.ok) window.location.reload();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company status</h2>
        <p className="mt-2 text-lg font-semibold text-slate-900">{company.companyName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(company.approvalStatus)}`}>
            {company.approvalStatus}
          </span>
          <span className="text-sm text-slate-600">
            {company.approvedUntil ? `Approved until ${company.approvedUntil}` : "Pending approval"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company documents</h2>
        <div className="mt-3 space-y-2">
          {company.documents.map((document) => (
            <div key={`${document.type}-${document.fileName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{document.type}</p>
                <p className="text-xs text-slate-500">{document.fileName} | valid until {document.validUntil ?? "-"}</p>
              </div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(document.approvalStatus)}`}>
                {document.approvalStatus}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {companyDocumentTypes.map((type) => (
            <form key={type} className="rounded-md border border-slate-200 p-3" onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const fileInput = form.elements.namedItem("file") as HTMLInputElement;
              const validUntilInput = form.elements.namedItem("validUntil") as HTMLInputElement;
              const file = fileInput.files?.[0];
              if (!file) return;
              await submitCompanyDocument(type, file, validUntilInput.value);
              form.reset();
            }}>
              <p className="text-sm font-semibold text-slate-900">{type}</p>
              <input name="file" type="file" accept="application/pdf" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
              <input name="validUntil" type="date" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <Button type="submit" size="sm" className="mt-3">Upload PDF</Button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Workers</h2>
        <form onSubmit={createWorker} className="mt-3 grid gap-3 md:grid-cols-3">
          <input value={workerName} onChange={(event) => setWorkerName(event.target.value)} placeholder="Worker name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={workerBirthDate} onChange={(event) => setWorkerBirthDate(event.target.value)} type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <Button type="submit" size="sm">Create worker</Button>
        </form>

        <div className="mt-4 space-y-4">
          {company.workers.map((worker) => (
            <div key={worker.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{worker.name}</p>
                  <p className="text-xs text-slate-500">{worker.isActive ? "Active" : "Inactive"} | approved until {worker.approvedUntil ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(worker.approvalStatus)}`}>
                    {worker.approvalStatus}
                  </span>
                  <Button size="sm" type="button" onClick={() => updateWorker(worker.id, !worker.isActive)}>
                    {worker.isActive ? "Inactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="destructive" type="button" onClick={() => deleteWorker(worker.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {worker.documents.map((document) => (
                  <div key={`${worker.id}-${document.type}-${document.fileName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{document.type}</p>
                      <p className="text-xs text-slate-500">{document.fileName} | valid until {document.validUntil ?? "-"}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(document.approvalStatus)}`}>
                      {document.approvalStatus}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {workerDocumentTypes.map((type) => (
                  <form key={`${worker.id}-${type}`} className="rounded-md bg-slate-50 p-3" onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
                    const validUntilInput = form.elements.namedItem("validUntil") as HTMLInputElement;
                    const file = fileInput.files?.[0];
                    if (!file) return;
                    await submitWorkerDocument(worker.id, type, file, validUntilInput.value);
                    form.reset();
                  }}>
                    <p className="text-sm font-medium text-slate-800">{type}</p>
                    <input name="file" type="file" accept="application/pdf" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
                    <input name="validUntil" type="date" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    <Button type="submit" size="sm" className="mt-2">Upload</Button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
