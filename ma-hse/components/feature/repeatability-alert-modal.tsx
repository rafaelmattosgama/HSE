"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RepeatabilityAlertModalProps = {
  plantCode: string;
  title?: string;
  alerts: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
};

export function RepeatabilityAlertModal({ plantCode, title = "Alerts", alerts }: RepeatabilityAlertModalProps) {
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

  function extractAlertAction(body: string) {
    const match = body.match(/Abrir S-EWO:\s*(https?:\/\/\S+)/);
    return match ? match[1] : null;
  }

  function stripAlertAction(body: string) {
    return body.replace(/\n?Abrir S-EWO:\s*https?:\/\/\S+/g, "").trim();
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
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              {(() => {
                const actionUrl = extractAlertAction(alert.body);
                const body = stripAlertAction(alert.body);

                return (
                  <>
                    <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{body}</p>
                    {actionUrl ? (
                      <Link href={actionUrl} className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:underline">
                        Abrir S-EWO
                      </Link>
                    ) : null}
                  </>
                );
              })()}
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
