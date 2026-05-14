"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RepeatabilityAlertModalProps = {
  plantCode: string;
  alerts: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
};

export function RepeatabilityAlertModal({ plantCode, alerts }: RepeatabilityAlertModalProps) {
  const [open, setOpen] = useState(alerts.length > 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!open || alerts.length === 0) {
    return null;
  }

  async function closeModal() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/notifications/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationIds: alerts.map((alert) => alert.id),
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Failed to close alerts");
      }

      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to close alerts");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Repeatability alerts</h2>
              <p className="mt-1 text-sm text-slate-600">
                Close this window to continue using the software.
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
              <p className="mt-2 text-sm text-slate-700">{alert.body}</p>
              <p className="mt-2 text-xs text-slate-500">
                Generated at {alert.createdAt.replace("T", " ").slice(0, 16)}
              </p>
            </article>
          ))}
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <Button type="button" size="sm" onClick={closeModal} disabled={busy}>
            {busy ? "Closing..." : "Close alerts"}
          </Button>
        </div>
      </div>
    </div>
  );
}
