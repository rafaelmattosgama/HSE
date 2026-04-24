import { ValidationQueue } from "@/components/feature/validation-queue";
import { prisma } from "@/lib/prisma";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getLocale } from "next-intl/server";

export default async function ValidationPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const locale = await getLocale();
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const pending = await prisma.communication.findMany({
    where: {
      plantId: plantRow.id,
      status: {
        in: ["SUBMITTED", "PENDING_VALIDATION"],
      },
    },
    include: {
      area: true,
      workstation: true,
    },
    orderBy: [
      { eventDatetime: "asc" },
      { reportedAt: "asc" },
    ],
    take: 100,
  });
  const translatedDescriptions = await translateForViewer(locale, pending.map((row) => row.description));

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Validation Queue</h1>
        <p className="mt-1 text-sm text-slate-600">Validate or reject communications directly from the queue, with the key context visible on each card.</p>
      </header>

      <ValidationQueue
        plant={plant}
        rows={pending.map((row, index) => ({
          id: row.id,
          type: row.type,
          reporterName: row.reporterName,
          eventDatetime: row.eventDatetime.toISOString(),
          department: row.area?.name ?? "-",
          location: row.workstation?.name ?? "-",
          description: translatedDescriptions[index] ?? row.description,
        }))}
      />
    </>
  );
}
