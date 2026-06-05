"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";

type ActionFloatingAlertItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  actionUrl: string;
};

function getAlertIcon(title: string) {
  if (title.includes("fora de prazo")) return AlertTriangle;
  if (title.includes("3 dias")) return Clock3;
  return ClipboardCheck;
}

export function ActionFloatingAlert({ enabled }: { enabled: boolean }) {
  const [alerts, setAlerts] = useState<ActionFloatingAlertItem[]>([]);
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
        const response = await fetch("/api/notifications/actions", { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json.ok || cancelled) return;
        setAlerts(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    }

    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const visibleAlerts = useMemo(() => alerts.slice(0, 3), [alerts]);

  if (!enabled || visibleAlerts.length === 0) {
    return null;
  }

  async function acknowledge(notificationIds: string[]) {
    setBusyIds(notificationIds);
    setMessage("");

    try {
      const response = await fetch("/api/notifications/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationIds }),
      });
      await requireApiResponse<{ updated: number }>(response, "Failed to update action alerts");

      setAlerts((current) => current.filter((alert) => !notificationIds.includes(alert.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update action alerts");
    } finally {
      setBusyIds([]);
    }
  }

  return (
    <div className="fixed right-4 top-24 z-[96] w-[calc(100%-2rem)] max-w-md space-y-3">
      {visibleAlerts.map((alert) => {
        const Icon = getAlertIcon(alert.title);
        const isBusy = busyIds.includes(alert.id);
        const isOverdue = alert.title.includes("fora de prazo");

        return (
          <section
            key={alert.id}
            className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-full p-2 ${isOverdue ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{alert.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={alert.actionUrl}
                    className="inline-flex rounded-lg bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
                  >
                    Abrir acao
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
                <p className="mt-2 text-xs text-slate-500">
                  Gerado em {alert.createdAt.replace("T", " ").slice(0, 16)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void acknowledge([alert.id])}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Marcar alerta de acao como lido"
                title="Marcar como lido"
                disabled={isBusy}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </section>
        );
      })}
      {message ? <p className="rounded-lg bg-white px-3 py-2 text-sm text-rose-700 shadow">{message}</p> : null}
      {alerts.length > 1 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void acknowledge(alerts.map((alert) => alert.id))}
            disabled={busyIds.length > 0}
          >
            {busyIds.length > 0 ? "A atualizar..." : "Marcar todos como lidos"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
