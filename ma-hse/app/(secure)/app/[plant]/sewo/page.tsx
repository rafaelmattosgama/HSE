import { CreateSewoQuick } from "@/components/feature/create-sewo-quick";
import { prisma } from "@/lib/prisma";

export default async function SewoPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const [sewoRecords, catalogVersions] = await prisma.$transaction([
    prisma.sEWO.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
        communication: true,
        causeSelections: true,
        actionLinks: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
    prisma.sEWOCauseCatalogVersion.findMany({
      include: {
        categories: {
          include: {
            items: true,
          },
        },
      },
      orderBy: {
        version: "desc",
      },
      take: 1,
    }),
  ]);

  const currentCatalog = catalogVersions[0];
  const defaultCauseItemId = currentCatalog?.categories[0]?.items[0]?.id;

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">S-EWO Investigation (RCA)</h1>
        <p className="mt-1 text-sm text-slate-600">Template versioned RCA with root cause selection and N2 approval.</p>
      </header>

      <CreateSewoQuick causeCatalogVersionId={currentCatalog?.id} defaultCauseItemId={defaultCauseItemId} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current cause catalog</h2>
        {currentCatalog ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Version {currentCatalog.version} - {currentCatalog.name}</p>
            {currentCatalog.categories.map((category) => (
              <div key={category.id} className="rounded-md bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{category.name}</p>
                <p className="mt-1 text-xs text-slate-600">{category.items.length} items</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No catalog loaded.</p>
        )}
      </section>

      <section className="space-y-3">
        {sewoRecords.map((record) => (
          <article key={record.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold text-slate-900">{record.eventClassification}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{record.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Communication: {record.communication.id}</p>
            <p className="text-sm text-slate-600">Root causes selected: {record.causeSelections.filter((x) => x.selected && x.isRootCause).length}</p>
            <p className="text-sm text-slate-600">Linked actions: {record.actionLinks.length}</p>
          </article>
        ))}
      </section>
    </>
  );
}
