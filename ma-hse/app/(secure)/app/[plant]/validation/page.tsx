import { ValidationActions } from "@/components/feature/validation-actions";
import { prisma } from "@/lib/prisma";

export default async function ValidationPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const pending = await prisma.communication.findMany({
    where: {
      plantId: plantRow.id,
      status: {
        in: ["SUBMITTED", "PENDING_VALIDATION"],
      },
    },
    orderBy: {
      reportedAt: "desc",
    },
    take: 100,
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Validation Queue (N3)</h1>
        <p className="mt-1 text-sm text-slate-600">Only validated communications move into KPI calculations.</p>
      </header>

      <div className="space-y-4">
        {pending.map((row) => (
          <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">{row.type}</h2>
                <p className="text-sm text-slate-500">{row.reporterName} | {row.eventDatetime.toISOString()}</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{row.status}</span>
            </div>

            <p className="mb-4 text-sm text-slate-700">{row.description}</p>

            <ValidationActions communicationId={row.id} />
          </article>
        ))}
      </div>
    </>
  );
}