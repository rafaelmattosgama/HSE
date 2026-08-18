"use client";

import { useEffect, useState } from "react";
import { Pencil, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { SewoUi } from "@/lib/sewo-ui";
import type { SewoValidationHistoryRow } from "@/lib/services/sewo-validation-service";

function formatDateTime(value: string | null, locale: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);

  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: SewoValidationHistoryRow["status"], ui: SewoUi) {
  return status === "APPROVED" ? ui.n1ValidationValidated : ui.n1ValidationRejected;
}

function statusClassName(status: SewoValidationHistoryRow["status"]) {
  return status === "APPROVED"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-red-100 text-red-700";
}

export function SewoValidationHistory({
  rows: initialRows,
  ui,
}: {
  rows: SewoValidationHistoryRow[];
  ui: SewoUi;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editingRow, setEditingRow] = useState<SewoValidationHistoryRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  async function changeDecision(row: SewoValidationHistoryRow) {
    const approved = row.status === "REJECTED";
    const approvalComment = approved ? "Validated by N1 after Corporate decision change." : "Rejected by N1 after Corporate decision change.";

    setBusyId(row.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${row.plantCode}/sewo/${row.id}/approval`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, approvalComment }),
      });
      const result = await requireApiResponse<{ status: SewoValidationHistoryRow["status"]; approvedAt: string | null }>(
        response,
        ui.n1ValidationFailed,
      );
      const decisionAt = result.data?.approvedAt ?? new Date().toISOString();

      setRows((current) => current.map((entry) => entry.id === row.id
        ? { ...entry, status: result.data?.status ?? (approved ? "APPROVED" : "REJECTED"), decisionAt }
        : entry));
      setEditingRow(null);
      setMessage(ui.n1ValidationSaved);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.n1ValidationFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function shareReport(row: SewoValidationHistoryRow) {
    setBusyId(row.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${row.plantCode}/sewo/${row.id}/share`, {
        method: "POST",
      });
      await requireApiResponse(response, ui.n1ValidationFailed);
      setMessage(ui.n1ValidationShareSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.n1ValidationFailed);
    } finally {
      setBusyId(null);
    }
  }

  if (!rows.length) {
    return (
      <div className="app-empty rounded-xl border border-dashed border-slate-300 p-6 text-sm">
        {ui.n1ValidationHistoryEmpty}
      </div>
    );
  }

  const nextStatus = editingRow?.status === "APPROVED" ? "REJECTED" : "APPROVED";

  return (
    <div className="space-y-3">
      {message ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">{message}</p> : null}

      <div className="app-table-shell overflow-x-auto">
        <table className="app-table min-w-[860px]">
          <thead>
            <tr>
              <th>{ui.n1ValidationCreationDate}</th>
              <th>{ui.n1ValidationPlant}</th>
              <th>{ui.n1ValidationDecisionDate}</th>
              <th>{ui.n1ValidationStatus}</th>
              <th>{ui.n1ValidationEdit}</th>
              <th>{ui.n1ValidationShare}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.createdAt, ui.locale)}</td>
                <td>
                  <p className="font-medium text-slate-900">{row.plantName}</p>
                  <p className="text-xs text-slate-500">{row.code}</p>
                </td>
                <td>{formatDateTime(row.decisionAt, ui.locale)}</td>
                <td>
                  <Badge className={statusClassName(row.status)}>{statusLabel(row.status, ui).toUpperCase()}</Badge>
                </td>
                <td>
                  <button
                    type="button"
                    className="app-icon-button"
                    onClick={() => setEditingRow(row)}
                    disabled={busyId === row.id}
                    aria-label={`${ui.n1ValidationEdit} ${row.code}`}
                    title={ui.n1ValidationEdit}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="app-icon-button"
                    onClick={() => void shareReport(row)}
                    disabled={busyId === row.id}
                    aria-label={`${ui.n1ValidationShareReport} ${row.code}`}
                    title={ui.n1ValidationShareReport}
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRow ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sewo-change-decision-title"
            className="app-panel w-full max-w-md rounded-2xl p-6 shadow-2xl"
          >
            <h2 id="sewo-change-decision-title" className="text-lg font-semibold text-slate-900">
              {ui.n1ValidationChangeDecision}
            </h2>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{editingRow.code}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-600">{ui.n1ValidationCurrentStatus}</dt>
                <dd><Badge className={statusClassName(editingRow.status)}>{statusLabel(editingRow.status, ui).toUpperCase()}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-600">{ui.n1ValidationNewStatus}</dt>
                <dd><Badge className={statusClassName(nextStatus)}>{statusLabel(nextStatus, ui).toUpperCase()}</Badge></dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-amber-800">{ui.n1ValidationDecisionChangeWarning}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setEditingRow(null)} disabled={busyId === editingRow.id}>
                {ui.n1ValidationCancel}
              </Button>
              <Button type="button" onClick={() => void changeDecision(editingRow)} disabled={busyId === editingRow.id}>
                {busyId === editingRow.id ? ui.n1ValidationSaving : ui.n1ValidationConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
