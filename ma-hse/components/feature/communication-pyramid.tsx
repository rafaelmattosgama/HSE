"use client";

import { AppCard, AppSectionHeader } from "@/components/ui/app-surface";
import { HelpPopover } from "@/components/ui/help-popover";

type CommunicationPyramidCounts = {
  unsafeAct: number;
  unsafeCondition: number;
  nearMiss: number;
  firstAid: number;
  minorInjury: number;
  seriousInjury: number;
  fatal: number;
};

const PYRAMID_LAYERS = [
  { key: "fatal", label: "Fatal", fill: "#f04a3c", border: "#bf2419", width: 34 },
  { key: "seriousInjury", label: "Serious Injury", fill: "#f19133", border: "#cf6e10", width: 45 },
  { key: "minorInjury", label: "Minor Injury", fill: "#f7b07d", border: "#df8750", width: 56 },
  { key: "firstAid", label: "First Aid", fill: "#ffef61", border: "#d8c631", width: 67 },
  { key: "nearMiss", label: "Near Miss", fill: "#f3cfad", border: "#d2ab84", width: 78 },
  { key: "unsafeCondition", label: "Unsafe Condition", fill: "#49bf66", border: "#278647", width: 89 },
  { key: "unsafeAct", label: "Unsafe Act", fill: "#97d353", border: "#679d2b", width: 100 },
] as const satisfies Array<{
  key: keyof CommunicationPyramidCounts;
  label: string;
  fill: string;
  border: string;
  width: number;
}>;

const MAX_COUNT_WIDTH = 92;

function formatCount(value: number) {
  return value.toLocaleString();
}

export function CommunicationPyramid({
  title,
  description,
  counts,
  labels = {},
  helpLabel = "Help",
}: {
  title: string;
  description?: string;
  counts: CommunicationPyramidCounts;
  labels?: Partial<Record<keyof CommunicationPyramidCounts, string>>;
  helpLabel?: string;
}) {
  return (
    <AppCard>
      <AppSectionHeader
        eyebrow={title}
        actions={description ? <HelpPopover title={title} body={description} buttonLabel={helpLabel} /> : undefined}
      />

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-5">
        <div className="mx-auto flex min-w-[620px] max-w-[820px] flex-col items-center gap-1.5">
          {PYRAMID_LAYERS.map((layer) => {
            const value = counts[layer.key];

            return (
              <div key={layer.key} className="grid w-full grid-cols-[minmax(0,1fr)_92px] items-center gap-3">
                <article
                  className="relative mx-auto grid h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden border px-7 text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.08)]"
                  style={{
                    width: `${layer.width}%`,
                    backgroundColor: layer.fill,
                    borderColor: layer.border,
                    clipPath: "polygon(7% 0%, 93% 0%, 100% 100%, 0% 100%)",
                  }}
                >
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,.44) 0%, rgba(255,255,255,.08) 42%, rgba(15,23,42,.10) 100%)",
                    }}
                  />
                  <span className="relative min-w-0 truncate text-center text-[12px] font-black uppercase tracking-[0.12em] text-slate-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                    {labels[layer.key] ?? layer.label}
                  </span>
                </article>
                <span
                  className="inline-flex h-9 items-center justify-end rounded-lg border px-3 text-sm font-black text-slate-950 shadow-sm"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.92)",
                    borderColor: layer.border,
                    minWidth: MAX_COUNT_WIDTH,
                  }}
                >
                  {formatCount(value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AppCard>
  );
}
