import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCommunicationType } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";

export default async function CommunicationDetailPage({
  params,
}: {
  params: Promise<{ plant: string; id: string }>;
}) {
  const { plant, id } = await params;

  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const communication = await prisma.communication.findFirst({
    where: {
      id,
      plantId: plantRow.id,
    },
    include: {
      actions: true,
      attachments: true,
      sewoRecords: true,
      riskTheme: true,
      bodyPart: true,
      injuryType: true,
    },
  });

  if (!communication) notFound();

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Communication Detail</h1>
        <p className="mt-1 text-sm text-slate-600">ID: {communication.id}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Main</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Type</dt><dd>{formatCommunicationType(communication.type)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Status</dt><dd>{communication.status}</dd></div>
            <div className="flex justify-between gap-4"><dt>Reporter</dt><dd>{communication.reporterName}</dd></div>
            <div className="flex justify-between gap-4"><dt>Event datetime</dt><dd>{communication.eventDatetime.toISOString()}</dd></div>
            <div className="flex justify-between gap-4"><dt>Risk theme</dt><dd>{communication.riskTheme.name}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Clinical / leave</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Body part</dt><dd>{communication.bodyPart?.name ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Injury type</dt><dd>{communication.injuryType?.name ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Has leave</dt><dd>{String(communication.hasLeave ?? false)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Lost days</dt><dd>{communication.lostDays ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Classification</dt><dd>{communication.classification ?? "-"}</dd></div>
          </dl>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h2>
        <p className="mt-3 text-sm text-slate-800">{communication.description}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Linked records</h2>
        <p className="mt-2 text-sm">Actions: {communication.actions.length}</p>
        <p className="text-sm">S-EWO records: {communication.sewoRecords.length}</p>
      </section>

      <Link href={`/app/${plant}/communications`} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        Back to communications
      </Link>
    </>
  );
}
