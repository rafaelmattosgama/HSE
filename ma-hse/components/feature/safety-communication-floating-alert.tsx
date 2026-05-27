"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { SafetyCommunicationFloatingAlert as SafetyCommunicationFloatingAlertItem } from "@/lib/services/safety-communication-alert-service";

export function SafetyCommunicationFloatingAlert({
  plantCode,
  enabled,
}: {
  plantCode: string;
  enabled: boolean;
}) {
  const [alerts, setAlerts] = useState<SafetyCommunicationFloatingAlertItem[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) {
      setAlerts([]);
      return;
    }

    let cancelled = false;

    async function loadAlerts() {
      try {
        const response = await fetch(`/api/plants/${plantCode}/notifications/safety-communications`, {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || !json.ok || cancelled) {
          return;
        }
        setAlerts(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) {
          setAlerts([]);
        }
      }
    }

    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, plantCode]);

  if (!enabled || alerts.length === 0) {
    return null;
  }

  async function acknowledge(notificationIds: string[]) {
    setBusyIds(notificationIds);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/notifications/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationIds,
        }),
      });
      await requireApiResponse<{ updated: number }>(response, "Failed to update alerts");

      setAlerts((current) => current.filter((alert) => !notificationIds.includes(alert.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update alerts");
    } finally {
      setBusyIds([]);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-sky-100 p-2 text-sky-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Comunicacoes de seguranca aprovadas</h2>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
          {alerts.map((alert) => {
            const isBusy = busyIds.includes(alert.id);

            return (
              <article key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{alert.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link
                        href={alert.actionUrl}
                        className="inline-flex rounded-lg bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
                      >
                        Abrir comunicacao
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void acknowledge([alert.id])}
                        disabled={isBusy}
                      >
                        {isBusy ? "A atualizar..." : "Marcar como lido"}
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void acknowledge([alert.id])}
                    className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Marcar alerta como lido"
                    title="Marcar como lido"
                    disabled={isBusy}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Gerado em {alert.createdAt.replace("T", " ").slice(0, 16)}
                </p>
              </article>
            );
          })}
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <Button
            type="button"
            size="sm"
            onClick={() => void acknowledge(alerts.map((alert) => alert.id))}
            disabled={busyIds.length > 0}
          >
            {busyIds.length > 0 ? "A atualizar..." : "Marcar todos como lidos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
