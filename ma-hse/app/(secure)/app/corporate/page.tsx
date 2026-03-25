import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function CorporatePage() {
  const plants = await prisma.plant.findMany({
    include: {
      communications: {
        where: {
          status: {
            in: ["VALID_OPEN", "ONGOING", "CLOSED"],
          },
        },
      },
      actions: {
        where: {
          status: {
            in: ["OPEN", "ONGOING"],
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Corporate Benchmark</h1>
        <p className="mt-1 text-sm text-slate-600">Cross-plant read-only view for validated events and open actions.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plants.map((plant) => (
          <div key={plant.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{plant.name}</h2>
            <p className="text-sm text-slate-500">{plant.code.toUpperCase()}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Validated events</dt>
              <dd className="font-semibold text-slate-900">{plant.communications.length}</dd>
              <dt className="text-slate-500">Open actions</dt>
              <dd className="font-semibold text-slate-900">{plant.actions.length}</dd>
            </dl>
            <Link href={`/app/${plant.code}/communications`} className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:underline">
              Open plant workspace
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}