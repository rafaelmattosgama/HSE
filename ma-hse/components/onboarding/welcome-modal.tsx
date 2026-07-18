"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { OnboardingWelcomeCopy } from "@/components/onboarding/onboarding-i18n";
import { Button } from "@/components/ui/button";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function WelcomeModal({
  open,
  busy,
  error,
  copy,
  onStart,
  onDismiss,
}: {
  open: boolean;
  busy: boolean;
  error?: string;
  copy: OnboardingWelcomeCopy;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    startButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onDismiss();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, onDismiss, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-welcome-title"
        aria-describedby="onboarding-welcome-description"
        data-no-translate
        className="app-panel w-full max-w-lg rounded-2xl p-6 sm:p-7"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-[var(--brand-700)]">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id="onboarding-welcome-title" className="mt-5 text-2xl font-bold text-slate-900">
          {copy.title}
        </h2>
        <p id="onboarding-welcome-description" className="mt-3 text-sm leading-6 text-slate-600">
          {copy.description}
        </p>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onDismiss} disabled={busy}>
            {copy.dismiss}
          </Button>
          <Button ref={startButtonRef} type="button" onClick={onStart} disabled={busy}>
            {busy ? copy.preparing : copy.start}
          </Button>
        </div>
      </div>
    </div>
  );
}
