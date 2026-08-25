"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import type { CompetenceUrgentFloatingAlert as CompetenceUrgentFloatingAlertItem } from "@/lib/services/competence-alert-service";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

// minor fix: the body text of this same alert is already built server-side
// with formatLisbonDate (Europe/Lisbon) — createdAt.replace("T", " ") below
// showed the raw UTC instant instead, off by the Lisbon offset.
function formatLisbonDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

/**
 * §7.1 exception: AUTHORIZATION_SUSPENDED / AUTHORIZATION_REVOKED can't wait
 * for the next navigation (someone may be operating equipment without
 * cover), so this polls every 30s like SafetyCommunicationFloatingAlert
 * instead of going through the server-side RepeatabilityAlertModal.
 */
export function CompetenceUrgentAlert({
  plantCode,
  labels,
  enabled,
}: {
  plantCode: string;
  labels: CompetencesUiDictionary;
  enabled: boolean;
}) {
  const [alerts, setAlerts] = useState<CompetenceUrgentFloatingAlertItem[]>([]);
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
        const response = await fetch(`/api/plants/${plantCode}/notifications/competences`, {
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
        body: JSON.stringify({ notificationIds }),
      });
      await requireApiResponse<{ updated: number }>(response, labels.formError);

      setAlerts((current) => current.filter((alert) => !notificationIds.includes(alert.id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.formError);
    } finally {
      setBusyIds([]);
    }
  }

  // Above RepeatabilityAlertModal / SafetyCommunicationFloatingAlert (both z-[100]): someone may be operating
  // equipment without cover (§7.1) — this one must win when more than one overlay is queued to show.
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-2xl border border-rose-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-rose-100 p-2 text-rose-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{labels.urgentAlertTitle}</h2>
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
                        {labels.urgentAlertOpenWorker}
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void acknowledge([alert.id])}
                        disabled={isBusy}
                      >
                        {isBusy ? labels.urgentAlertAcknowledging : labels.urgentAlertAcknowledge}
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void acknowledge([alert.id])}
                    className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    aria-label={labels.urgentAlertCloseLabel}
                    title={labels.urgentAlertAcknowledge}
                    disabled={isBusy}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {labels.urgentAlertGeneratedAtPrefix} {formatLisbonDateTime(alert.createdAt)}
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
            {busyIds.length > 0 ? labels.urgentAlertAcknowledging : labels.urgentAlertAcknowledgeAll}
          </Button>
        </div>
      </div>
    </div>
  );
}
