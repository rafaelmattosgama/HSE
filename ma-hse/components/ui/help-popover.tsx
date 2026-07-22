"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

export function HelpPopover({
  title,
  body,
  buttonLabel,
}: {
  title: string;
  body: string;
  buttonLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const popoverId = useId();
  const titleId = `${popoverId}-title`;
  const bodyId = `${popoverId}-body`;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setPinned(false);
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPinned(false);
      setOpen(false);
      buttonRef.current?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      if (!pinned || containerRef.current?.contains(event.target as Node)) return;
      setPinned(false);
      setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, pinned]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-describedby={open ? bodyId : undefined}
        aria-expanded={open}
        onClick={() => {
          const nextPinned = !pinned;
          setPinned(nextPinned);
          setOpen(nextPinned || !open);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="fixed inset-x-4 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-auto -translate-y-1/2 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:max-h-[min(24rem,calc(100dvh-4rem))] sm:w-72 sm:translate-y-0"
        >
          <p id={titleId} className="text-sm font-semibold text-slate-900">{title}</p>
          <p id={bodyId} className="mt-2 whitespace-pre-line text-sm text-slate-700">{body}</p>
        </div>
      ) : null}
    </div>
  );
}
