import { CloseActionQuick } from "@/components/feature/close-action-quick";
import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { prisma } from "@/lib/prisma";

export default async function ActionsPage({ params }: { params: Promise<{ plant: string }> }) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const actions = await prisma.action.findMany({
    where: {
      plantId: plantRow.id,
    },
    include: {
      ownerUser: true,
      evidenceAttachments: true,
    },
    orderBy: {
      dueDate: "asc",
    },
    take: 100,
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Action Plan (CAPA)</h1>
        <p className="mt-1 text-sm text-slate-600">Close action requires closure comment and evidence attachment.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <CreateActionQuick />
        <CloseActionQuick />
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                <td className="px-4 py-3">{row.title}</td>
                <td className="px-4 py-3">{row.priority}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.ownerUser.name}</td>
                <td className="px-4 py-3">{row.dueDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3">{row.evidenceAttachments.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}