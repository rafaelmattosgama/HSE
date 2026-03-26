import { RoleCode } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { getServerSession } from "next-auth";
import { formatCommunicationType } from "@/lib/helpers";
import { authOptions } from "@/lib/auth/options";
import { KpiService } from "@/lib/services/kpi-service";
import { prisma } from "@/lib/prisma";

export default async function DashboardsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const actorRole = session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;

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

  const [pendingValidation, openCommunications, myOpenActions, clinicalCases] = await prisma.$transaction([
    prisma.communication.count({
      where: {
        plantId: plantRow.id,
        status: {
          in: ["SUBMITTED", "PENDING_VALIDATION"],
        },
      },
    }),
    prisma.communication.count({
      where: {
        plantId: plantRow.id,
        status: {
          in: ["VALID_OPEN", "ONGOING"],
        },
      },
    }),
    prisma.action.count({
      where: {
        plantId: plantRow.id,
        ownerUserId: session?.user.id,
        status: {
          in: ["OPEN", "ONGOING"],
        },
      },
    }),
    prisma.communication.count({
      where: {
        plantId: plantRow.id,
        type: {
          in: ["FIRST_AID", "ACCIDENT"],
        },
      },
    }),
  ]);

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

      {actorRole === RoleCode.N2_PLANT_MANAGER ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending validation</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingValidation}</p>
          </article>
        </section>
      ) : null}

      {actorRole === RoleCode.N3_SAFETY ? (
        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending validation</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingValidation}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Clinical cases</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{clinicalCases}</p>
          </article>
        </section>
      ) : null}

      {actorRole === RoleCode.N4_SUPERVISOR || actorRole === RoleCode.N5_OPERATOR ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">My open actions</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{myOpenActions}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
        </section>
      ) : null}

      {actorRole === RoleCode.MEDICO ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Clinical cases</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{clinicalCases}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending validation</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingValidation}</p>
          </article>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Events by Type</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {kpi.byType.map((entry) => (
            <li key={entry.type} className="flex justify-between border-b border-slate-100 pb-2">
              <span>{formatCommunicationType(entry.type)}</span>
              <span className="font-semibold">{entry._count}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
