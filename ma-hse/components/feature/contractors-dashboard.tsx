"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type WorkerRow = {
  id: string;
  name: string;
  approvalStatus: string;
  isActive: boolean;
  approvedUntil: string | null;
};

type CompanyRow = {
  id: string;
  companyName: string;
  email: string;
  approvalStatus: string;
  isActive: boolean;
  approvedUntil: string | null;
  workerCount: number;
  pendingWorkers: number;
  sponsorName: string;
  workers: WorkerRow[];
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

export function ContractorsDashboard({
  plant,
  companies,
  canApprove,
}: {
  plant: string;
  companies: CompanyRow[];
  canApprove: boolean;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  async function sendInvitation(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/plants/${plant}/contractors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Invitation sent" : json.message ?? "Failed to send invitation");
    if (json.ok) setEmail("");
  }

  const rows = useMemo(() => {
    const companyRows = companies.map((company) => ({
      key: `company-${company.id}`,
      type: "company",
      name: company.companyName,
      approvalStatus: company.approvalStatus,
      isActive: company.isActive,
      approvedUntil: company.approvedUntil,
      sponsorName: company.sponsorName,
      companyName: company.companyName,
      workerCount: company.workerCount,
      href: `/app/${plant}/contractors/${company.id}`,
    }));
    const workerRows = companies.flatMap((company) =>
      company.workers.map((worker) => ({
        key: `worker-${worker.id}`,
        type: "worker",
        name: worker.name,
        approvalStatus: worker.approvalStatus,
        isActive: worker.isActive,
        approvedUntil: worker.approvedUntil,
        sponsorName: company.sponsorName,
        companyName: company.companyName,
        workerCount: null,
        href: `/app/${plant}/contractors/${company.id}`,
      })),
    );

    return [...companyRows, ...workerRows].filter((row) => {
      const matchesName =
        !nameFilter ||
        `${row.name} ${row.companyName} ${row.sponsorName}`.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesType = typeFilter === "all" || row.type === typeFilter;
      const matchesApproval = approvalFilter === "all" || row.approvalStatus === approvalFilter;
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && row.isActive) ||
        (activeFilter === "inactive" && !row.isActive);
      return matchesName && matchesType && matchesApproval && matchesActive;
    });
  }, [activeFilter, approvalFilter, companies, nameFilter, plant, typeFilter]);

  return (
    <div className="space-y-4">
      <form onSubmit={sendInvitation} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Invite external company</h3>
        <div className="mt-3 flex gap-3">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Company contact email" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <Button type="submit" size="sm">Send email</Button>
        </div>
        {message ? <p className="mt-2 text-xs text-slate-600">{message}</p> : null}
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Filter by name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All types</option>
            <option value="company">Company</option>
            <option value="worker">Worker</option>
          </select>
          <select value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All approval states</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending approval</option>
            <option value="REJECTED">Not approved</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Approved until</th>
              <th className="px-4 py-3">Sponsor</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-200">
                <td className="px-4 py-3 capitalize">{row.type}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                <td className="px-4 py-3">{row.companyName}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(row.approvalStatus)}`}>
                    {row.approvalStatus}
                  </span>
                </td>
                <td className="px-4 py-3">{row.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3">{row.approvedUntil ?? "-"}</td>
                <td className="px-4 py-3">{row.sponsorName}</td>
                <td className="px-4 py-3">
                  <Link href={row.href} className="font-semibold text-teal-700 hover:underline">
                    {canApprove ? "Review" : "Open"}
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">No companies or workers match the selected filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
