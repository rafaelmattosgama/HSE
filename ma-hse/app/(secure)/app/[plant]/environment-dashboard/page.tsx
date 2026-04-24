import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";

export default async function EnvironmentDashboardPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const rows = await prisma.plantMonthlyInput.findMany({
    where: {
      plantId: plantRow.id,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 12,
  });
  const orderedRows = [...rows].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Environment Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Base dashboard fed by Monthly Inputs. Calculation logic can be expanded in the next iteration.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Plant</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{plantRow.name}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Available months</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{rows.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Viewer</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{session?.user.name ?? "User"}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Monthly Input Snapshot</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Workers</th>
                <th className="px-3 py-2">Hours worked</th>
                <th className="px-3 py-2">Standard hours</th>
                <th className="px-3 py-2">Electricity grid</th>
                <th className="px-3 py-2">Hazardous waste</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{row.year}-{String(row.month).padStart(2, "0")}</td>
                  <td className="px-3 py-2">{row.workerCount ?? "-"}</td>
                  <td className="px-3 py-2">{row.hoursWorked ? Number(row.hoursWorked).toFixed(2) : "-"}</td>
                  <td className="px-3 py-2">{row.standardHours ? Number(row.standardHours).toFixed(2) : "-"}</td>
                  <td className="px-3 py-2">{row.electricityFromGridMwh ? Number(row.electricityFromGridMwh).toFixed(2) : "-"}</td>
                  <td className="px-3 py-2">{row.hazardousWasteTons ? Number(row.hazardousWasteTons).toFixed(2) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
