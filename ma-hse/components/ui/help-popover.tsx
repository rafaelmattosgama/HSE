"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const POPOVER_WIDTH = 288;
const POPOVER_MARGIN = 16;

type PopoverPosition = { top: number; left: number; width: number };

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
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const popoverId = useId();
  const titleId = `${popoverId}-title`;
  const bodyId = `${popoverId}-body`;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function close() {
    setPinned(false);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_MARGIN * 2);
    const maxLeft = Math.max(POPOVER_MARGIN, window.innerWidth - width - POPOVER_MARGIN);
    const left = Math.min(Math.max(POPOVER_MARGIN, rect.right - width), maxLeft);
    const top = Math.min(rect.bottom + 8, Math.max(POPOVER_MARGIN, window.innerHeight - POPOVER_MARGIN));
    setPosition({ top, left, width });
  }

  // Positioned via a portal (instead of CSS position:absolute inside the card)
  // so the popover cannot be clipped by an ancestor card's `overflow: hidden`.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
    }

    function handlePointerDown(event: PointerEvent) {
      if (!pinned) return;
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
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
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-labelledby={titleId}
              aria-describedby={bodyId}
              style={{ top: position.top, left: position.left, width: position.width }}
              className="fixed z-50 max-h-[min(24rem,calc(100dvh-4rem))] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg"
            >
              <p id={titleId} className="text-sm font-semibold text-slate-900">{title}</p>
              <p id={bodyId} className="mt-2 whitespace-pre-line text-sm text-slate-700">{body}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
