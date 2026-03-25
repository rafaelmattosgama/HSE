import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CreateCommunicationQuick } from "@/components/feature/create-communication-quick";

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;

  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const [communications, riskThemes] = await prisma.$transaction([
    prisma.communication.findMany({
      where: { plantId: plantRow.id },
      include: { riskTheme: true },
      orderBy: { eventDatetime: "desc" },
      take: 100,
    }),
    prisma.riskTheme.findMany({ where: { plantId: plantRow.id }, take: 1 }),
  ]);

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
        <p className="mt-1 text-sm text-slate-600">All safety communications scoped to this plant.</p>
      </header>

      <CreateCommunicationQuick riskThemeId={riskThemes[0]?.id} />

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {communications.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3">{row.eventDatetime.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.reporterName}</td>
                <td className="px-4 py-3">{row.riskTheme.name}</td>
                <td className="px-4 py-3">
                  <Link href={`/app/${plant}/communications/${row.id}`} className="font-semibold text-teal-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}