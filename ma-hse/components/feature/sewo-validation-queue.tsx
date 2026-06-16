"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { SewoUi } from "@/lib/sewo-ui";
import type { SifPsifResult } from "@/lib/sewo-sif-psif";

type SewoValidationQueueRow = {
  id: string;
  code: string;
  plantCode: string;
  plantName: string;
  occurrenceType: string;
  statusLabel: string;
  location: string;
  description: string;
  analysisDate: string;
  submittedAt: string;
  submittedByName: string;
  submittedByRole: string | null;
  sifPsifResult: SifPsifResult;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return date.toLocaleDateString();
}

function getSifPsifLabel(result: SifPsifResult, ui: SewoUi) {
  if (result === "SIF") return ui.sifResult;
  if (result === "PSIF") return ui.psifResult;
  if (result === "NO_PSIF") return ui.noPsifResult;
  return ui.pendingResult;
}

function getSifPsifClassName(result: SifPsifResult) {
  if (result === "SIF") return "border-red-200 bg-red-600 text-white shadow-[0_10px_24px_rgba(220,38,38,0.22)]";
  if (result === "PSIF") return "border-amber-300 bg-amber-300 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.22)]";
  if (result === "NO_PSIF") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-white text-slate-600";
}

export function SewoValidationQueue({
  rows,
  ui,
  showPlant = true,
}: {
  rows: SewoValidationQueueRow[];
  ui: SewoUi;
  showPlant?: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submitDecision(row: SewoValidationQueueRow, approved: boolean) {
    if (!approved && !window.confirm(ui.n1ValidationConfirmReject)) return;

    setBusyId(row.id);
    setMessage("");

    const fallbackComment = approved ? "Validated by N1." : "Rejected by N1.";
    const approvalComment = comments[row.id]?.trim() || fallbackComment;

    try {
      const response = await fetch(`/api/plants/${row.plantCode}/sewo/${row.id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved,
          approvalComment,
        }),
      });
      await requireApiResponse(response, ui.n1ValidationFailed);

      setComments((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setMessage(ui.n1ValidationSaved);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.n1ValidationFailed);
    } finally {
      setBusyId(null);
    }
  }

  if (!rows.length) {
    return (
      <div className="app-empty rounded-xl border border-dashed border-slate-300 p-6 text-sm">
        {ui.n1ValidationEmpty}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">{message}</p> : null}

      {rows.map((row) => {
        const priority = row.sifPsifResult === "SIF" || row.sifPsifResult === "PSIF";

        return (
          <article key={row.id} className="app-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--brand-700)]">
                    {row.statusLabel}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide", getSifPsifClassName(row.sifPsifResult))}>
                    {priority ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                    {getSifPsifLabel(row.sifPsifResult, ui)}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-semibold text-[var(--brand-700)]">{row.code}</p>
                  <h2 className="text-lg font-semibold text-slate-900">{row.occurrenceType}</h2>
                  <p className="mt-1 text-sm text-slate-600">{row.description}</p>
                </div>

                <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                  {showPlant ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.n1ValidationPlant}</dt>
                      <dd className="mt-1 font-medium text-slate-900">{row.plantName}</dd>
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.n1ValidationLocation}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{row.location}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.n1ValidationSubmittedBy}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{row.submittedByName}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.n1ValidationSubmittedAt}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatDateTime(row.submittedAt)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.n1ValidationAnalysisDate}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatDate(row.analysisDate)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={`/app/${row.plantCode}/sewo?sewoId=${row.id}`} className="app-toolbar">
                  {ui.n1ValidationOpenSewo}
                </Link>
                <Link href={`/api/plants/${row.plantCode}/sewo/${row.id}/report?type=complete&format=pdf`} className="app-toolbar" title={ui.n1ValidationExportPdf}>
                  <FileText className="h-4 w-4" />
                </Link>
                <Link href={`/api/plants/${row.plantCode}/sewo/${row.id}/report?type=complete&format=xlsx`} className="app-toolbar" title={ui.n1ValidationExportExcel}>
                  <FileSpreadsheet className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <label className="block text-sm font-semibold text-slate-700">
                {ui.n1ValidationComment}
                <textarea
                  value={comments[row.id] ?? ""}
                  onChange={(event) => setComments((current) => ({ ...current, [row.id]: event.target.value }))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-100)]"
                  rows={3}
                  placeholder={ui.n1ValidationCommentPlaceholder}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void submitDecision(row, true)} disabled={busyId === row.id} title={ui.n1ValidationApprove}>
                  <Check className="h-4 w-4" />
                  <span>{busyId === row.id ? ui.n1ValidationSaving : ui.n1ValidationApprove}</span>
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void submitDecision(row, false)} disabled={busyId === row.id} title={ui.n1ValidationReject}>
                  <X className="h-4 w-4" />
                  <span>{ui.n1ValidationReject}</span>
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
