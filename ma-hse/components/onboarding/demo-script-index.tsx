"use client";

import { ListOrdered } from "lucide-react";
import { useState } from "react";
import type { OnboardingStep } from "@/components/onboarding/onboarding-types";

/** First step index of each section, in script order. */
export function getScriptSections(steps: OnboardingStep[]) {
  const sections: Array<{ name: string; index: number }> = [];
  steps.forEach((step, index) => {
    if (step.section && !sections.some((section) => section.name === step.section)) {
      sections.push({ name: step.section, index });
    }
  });
  return sections;
}

/**
 * Floating index for demo scripts: lets the presenter jump to any section
 * (e.g. when the audience asks about one module). Sits above the tour overlay.
 */
export function DemoScriptIndex({
  steps,
  currentStep,
  title,
  onJump,
}: {
  steps: OnboardingStep[];
  currentStep: number;
  title: string;
  onJump: (step: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const sections = getScriptSections(steps);
  if (!sections.length) return null;
  const currentSection = [...sections].reverse().find((section) => section.index <= currentStep)?.name;

  return (
    <div data-no-translate className="fixed bottom-4 left-4 z-[10001] text-sm">
      {open ? (
        <nav
          aria-label={title}
          className="mb-2 max-h-[60vh] w-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.2)]"
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <ul>
            {sections.map((section) => (
              <li key={section.name}>
                <button
                  type="button"
                  aria-current={section.name === currentSection ? "step" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onJump(section.index);
                  }}
                  className={`w-full rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 ${
                    section.name === currentSection ? "font-semibold text-[var(--brand-700)]" : "text-slate-700"
                  }`}
                >
                  {section.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.15)]"
      >
        <ListOrdered className="h-4 w-4" />
        {currentSection ?? title}
      </button>
    </div>
  );
}
