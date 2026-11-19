"use client";

export function isClientDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/** Always-visible strip that marks the local demo (fictitious data). Renders nothing outside demo mode. */
export function DemoBanner() {
  if (!isClientDemoMode()) return null;
  return (
    <div
      role="status"
      data-no-translate
      className="sticky top-0 z-[120] bg-amber-400 px-4 py-1 text-center text-sm font-bold uppercase tracking-wide text-slate-900"
    >
      DEMONSTRAÇÃO – dados fictícios · DEMO – fictitious data
    </div>
  );
}
