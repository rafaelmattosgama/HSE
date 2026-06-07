"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

type CountResponse = {
  unreadCount: number;
};

export function ProfileAlertsButton({
  initialUnreadCount,
  scopeLabel,
}: {
  initialUnreadCount: number;
  scopeLabel: string;
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const response = await fetch("/api/notifications/profile-alerts?mode=count", {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || !json.ok || cancelled) return;
        const data = json.data as CountResponse;
        setUnreadCount(Number.isFinite(data.unreadCount) ? data.unreadCount : 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    function handleAlertsUpdated(event: Event) {
      const detail = (event as CustomEvent<Partial<CountResponse>>).detail;
      if (typeof detail?.unreadCount === "number") {
        setUnreadCount(detail.unreadCount);
        return;
      }

      void loadCount();
    }

    window.addEventListener("focus", loadCount);
    window.addEventListener("profile-alerts-updated", handleAlertsUpdated);
    const timer = window.setInterval(() => void loadCount(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadCount);
      window.removeEventListener("profile-alerts-updated", handleAlertsUpdated);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/app/alerts"
      className="app-toolbar relative inline-flex h-10 w-10 items-center justify-center rounded-full px-0"
      aria-label={`Alertas ${scopeLabel}${unreadCount > 0 ? `, ${unreadCount} por ler` : ""}`}
      title={`Alertas ${scopeLabel}`}
    >
      <Mail className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
