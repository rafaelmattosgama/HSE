import { endOfMonth, startOfMonth } from "date-fns";
import { KpiService } from "@/lib/services/kpi-service";
import { prisma } from "@/lib/prisma";

export default async function DashboardsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const kpi = await KpiService.getMonthlyKpis(plantRow.id, year, month);

  const from = startOfMonth(new Date(Date.UTC(year, month - 1, 1)));
  const to = endOfMonth(from);

  const overdue = await prisma.action.count({
    where: {
      plantId: plantRow.id,
      status: {
        in: ["OPEN", "ONGOING"],
      },
      dueDate: {
        lt: new Date(),
      },
    },
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Safety Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">KPIs by event date and only validated communications.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Period</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{from.toISOString().slice(0, 10)} - {to.toISOString().slice(0, 10)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Validated events</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{kpi.totalValidEvents}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Hours worked</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{kpi.hoursWorked}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Overdue actions</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{overdue}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Events by Type</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {kpi.byType.map((entry) => (
            <li key={entry.type} className="flex justify-between border-b border-slate-100 pb-2">
              <span>{entry.type}</span>
              <span className="font-semibold">{entry._count}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}