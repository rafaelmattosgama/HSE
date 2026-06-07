"use client";

import { useMemo, useState } from "react";
import { CheckCheck, MailOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { ProfileAlertRow } from "@/lib/services/profile-alert-service";

type AlertStatus = "READ" | "UNREAD";

type UpdateAlertsResponse = {
  updated: number;
  unreadCount: number;
};

function formatAlertDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProfileAlertsPanel({
  initialAlerts,
  initialUnreadCount,
  scopeLabel,
}: {
  initialAlerts: ProfileAlertRow[];
  initialUnreadCount: number;
  scopeLabel: string;
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = alerts.length > 0 && selectedIds.length === alerts.length;
  const hasSelection = selectedIds.length > 0;

  function toggleSelection(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((selectedId) => selectedId !== id);
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? alerts.map((alert) => alert.id) : []);
  }

  async function updateSelected(status: AlertStatus) {
    if (!selectedIds.length) return;

    const idsToUpdate = [...selectedIds];
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/notifications/profile-alerts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          notificationIds: idsToUpdate,
          status,
        }),
      });
      const json = await requireApiResponse<UpdateAlertsResponse>(response, "Falha ao atualizar alertas");

      setAlerts((current) =>
        current.map((alert) =>
          idsToUpdate.includes(alert.id)
            ? {
                ...alert,
                status,
              }
            : alert,
        ),
      );
      setUnreadCount(json.data?.unreadCount ?? 0);
      setSelectedIds([]);
      window.dispatchEvent(
        new CustomEvent("profile-alerts-updated", {
          detail: {
            unreadCount: json.data?.unreadCount ?? 0,
          },
        }),
      );
      setMessage(`${json.data?.updated ?? 0} alerta(s) atualizado(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar alertas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Alertas {scopeLabel}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {unreadCount > 0 ? `${unreadCount} por ler` : "Sem alertas por ler"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void updateSelected("READ")}
            disabled={!hasSelection || busy}
          >
            <MailOpen className="h-4 w-4" />
            {busy ? "A atualizar..." : "Marcar lidas"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void updateSelected("UNREAD")}
            disabled={!hasSelection || busy}
          >
            <RotateCcw className="h-4 w-4" />
            {busy ? "A atualizar..." : "Marcar nao lidas"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-16 px-5 py-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="Selecionar todos os alertas"
                  />
                  <span>Todos</span>
                </label>
              </th>
              <th scope="col" className="whitespace-nowrap px-5 py-3">
                Data do alerta
              </th>
              <th scope="col" className="min-w-[22rem] px-5 py-3">
                Texto do alerta
              </th>
              <th scope="col" className="whitespace-nowrap px-5 py-3">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {alerts.map((alert) => {
              const unread = alert.status === "UNREAD";

              return (
                <tr key={alert.id} className={unread ? "bg-sky-50/55" : undefined}>
                  <td className="px-5 py-4 align-top">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(alert.id)}
                      onChange={(event) => toggleSelection(alert.id, event.target.checked)}
                      aria-label={`Selecionar alerta ${formatAlertDate(alert.createdAt)}`}
                    />
                  </td>
                  <td className={`whitespace-nowrap px-5 py-4 align-top text-slate-700 ${unread ? "font-semibold" : ""}`}>
                    {formatAlertDate(alert.createdAt)}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className={`text-slate-900 ${unread ? "font-semibold" : "font-medium"}`}>{alert.title}</p>
                    <p className={`mt-1 whitespace-pre-line text-slate-600 ${unread ? "font-semibold" : ""}`}>
                      {alert.body}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 align-top">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        unread ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {unread ? null : <CheckCheck className="h-3.5 w-3.5" />}
                      {unread ? "Nao lida" : "Lida"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">
                  Sem alertas recebidos.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
