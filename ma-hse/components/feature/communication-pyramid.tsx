"use client";

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
  { key: "unsafeAct", label: "Unsafe Act", fill: "#97d353", border: "#679d2b", width: 100 },
  { key: "unsafeCondition", label: "Unsafe Condition", fill: "#49bf66", border: "#278647", width: 88 },
  { key: "nearMiss", label: "Near Miss", fill: "#f3cfad", border: "#d2ab84", width: 76 },
  { key: "firstAid", label: "First Aid", fill: "#ffef61", border: "#d8c631", width: 64 },
  { key: "minorInjury", label: "Minor Injury", fill: "#f7b07d", border: "#df8750", width: 52 },
  { key: "seriousInjury", label: "Serious Injury", fill: "#f19133", border: "#cf6e10", width: 40 },
  { key: "fatal", label: "Fatal", fill: "#f04a3c", border: "#bf2419", width: 28 },
] as const satisfies Array<{
  key: keyof CommunicationPyramidCounts;
  label: string;
  fill: string;
  border: string;
  width: number;
}>;

function formatCount(value: number) {
  return value.toLocaleString();
}

export function CommunicationPyramid({
  title,
  description,
  counts,
}: {
  title: string;
  description?: string;
  counts: CommunicationPyramidCounts;
}) {
  const maxCount = Math.max(...PYRAMID_LAYERS.map((layer) => counts[layer.key]), 1);

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <div className="mx-auto flex max-w-3xl flex-col-reverse items-center gap-2">
          {PYRAMID_LAYERS.map((layer) => {
            const value = counts[layer.key];
            const intensity = value === 0 ? 0.82 : 0.9 + (value / maxCount) * 0.1;

            return (
              <div key={layer.key} className="flex w-full items-center justify-center">
                <article
                  className="relative flex min-h-12 items-center justify-center border px-6 py-2 text-slate-900 shadow-sm"
                  style={{
                    width: `${layer.width}%`,
                    maxWidth: `${layer.width * 6.2}px`,
                    minWidth: "240px",
                    backgroundColor: layer.fill,
                    borderColor: layer.border,
                    clipPath: "polygon(9% 0%, 91% 0%, 100% 100%, 0% 100%)",
                    opacity: intensity,
                  }}
                  >
                  <span
                    className="absolute inset-0 opacity-20"
                    style={{ background: "linear-gradient(135deg, rgba(255,255,255,.45), rgba(255,255,255,0) 50%, rgba(15,23,42,.12))" }}
                  />
                  <span className="relative block max-w-[calc(100%-4.5rem)] text-center text-[11px] font-black uppercase tracking-[0.1em] text-slate-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.45)] sm:text-[12px] md:text-[13px]">
                    {layer.label}
                  </span>
                  <span className="absolute right-4 rounded-full border border-white/70 bg-white/92 px-3 py-1 text-sm font-black text-slate-950 shadow-sm md:text-base">
                    {formatCount(value)}
                  </span>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
