"use client";

import { useState } from "react";
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

  function close() {
    setPinned(false);
    setOpen(false);
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
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
          if (event.key === "Escape") {
            close();
          }
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-900"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-30 w-72 rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{body}</p>
        </div>
      ) : null}
    </div>
  );
}
