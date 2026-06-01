"use client";

import Link from "next/link";
import { LogOut, Settings, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

type UserMenuProps = {
  userName: string;
};

export function UserMenu({ userName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function onLogout() {
    setLoggingOut(true);
    setError("");

    try {
      await signOut({
        redirect: false,
        callbackUrl: "/login",
      });
      window.location.assign("/login");
    } catch {
      setLoggingOut(false);
      setError("Falha ao terminar sessao. Atualize a pagina e tente novamente.");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="app-toolbar inline-flex items-center gap-2"
      >
        <span data-no-translate className="max-w-28 truncate sm:max-w-40">{userName}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          <div className="border-b border-slate-100 px-3 py-2">
            <p data-no-translate className="truncate text-sm font-semibold text-slate-900">{userName}</p>
          </div>
          <div className="py-1">
            <Link
              href="/app/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Settings className="h-4 w-4" />
              Definições
            </Link>
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "A terminar sessão..." : "Terminar sessão"}
            </button>
          </div>
          {error ? <p className="px-3 pb-2 text-xs text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
