"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="app-card max-w-2xl" role="alert">
      <p className="app-section-eyebrow">Safety Dashboard</p>
      <h1 className="mt-2 text-xl font-black text-slate-950">The dashboard could not be loaded.</h1>
      <p className="mt-2 text-sm text-slate-600">Please try again. If the problem continues, contact support.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </section>
  );
}
