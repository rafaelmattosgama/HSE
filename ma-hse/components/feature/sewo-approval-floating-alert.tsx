"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SifPsifResult } from "@/lib/sewo-sif-psif";

type PendingSewoAlert = {
  id: string;
  code: string;
  plantCode: string;
  plantName: string;
  occurrenceType: string;
  statusLabel: string;
  submittedAt: string;
  sifPsifResult: SifPsifResult;
};

const DISMISSED_STORAGE_KEY = "ma-hse.sewo-n1-validation-alerts.dismissed";

function readDismissedIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeDismissedIds(ids: Set<string>) {
  window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-100)));
}

function getSifPsifLabel(result: SifPsifResult) {
  if (result === "SIF") return "SIF";
  if (result === "PSIF") return "PSIF";
  if (result === "NO_PSIF") return "No PSIF";
  return "Pending";
}

function getSifPsifClassName(result: SifPsifResult) {
  if (result === "SIF") return "border-red-200 bg-red-600 text-white";
  if (result === "PSIF") return "border-amber-300 bg-amber-300 text-amber-950";
  return "border-slate-200 bg-white text-slate-600";
}

function getAlertDismissKey(alert: PendingSewoAlert) {
  return `${alert.id}:${alert.submittedAt}`;
}

export function SewoApprovalFloatingAlert({ enabled }: { enabled: boolean }) {
  const [alerts, setAlerts] = useState<PendingSewoAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissedIds());

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function loadAlerts() {
      try {
        const response = await fetch("/api/sewo/pending-validation", { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json.ok || cancelled) return;
        setAlerts(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    }

    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(), 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => !dismissed.has(getAlertDismissKey(alert))).slice(0, 3),
    [alerts, dismissed],
  );

  if (!enabled || !visibleAlerts.length) return null;

  function dismiss(alert: PendingSewoAlert) {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(getAlertDismissKey(alert));
      writeDismissedIds(next);
      return next;
    });
  }

  return (
    <div className="fixed left-1/2 top-20 z-[95] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 space-y-2">
      {visibleAlerts.map((alert) => {
        const priority = alert.sifPsifResult === "SIF" || alert.sifPsifResult === "PSIF";

        return (
          <section key={alert.id} className="rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className={cn("rounded-full p-2", priority ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                {priority ? <AlertTriangle className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">S-EWO pendente de aprovação</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{alert.code}</span>
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide", getSifPsifClassName(alert.sifPsifResult))}>
                    {getSifPsifLabel(alert.sifPsifResult)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  Planta: <span className="font-semibold">{alert.plantName}</span> · Tipo: <span className="font-semibold">{alert.occurrenceType}</span> · Estado: <span className="font-semibold">{alert.statusLabel}</span>
                </p>
                {priority ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                    Classificação {getSifPsifLabel(alert.sifPsifResult)} com prioridade de validação.
                  </p>
                ) : null}
                <Link href={`/app/${alert.plantCode}/validation`} className="mt-3 inline-flex rounded-lg bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]">
                  Abrir Validação
                </Link>
              </div>
              <button
                type="button"
                onClick={() => dismiss(alert)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Fechar alerta S-EWO"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
