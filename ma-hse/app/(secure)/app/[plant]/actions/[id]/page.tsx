import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ plant: string; id: string }>;
}) {
  const { plant, id } = await params;
  const session = await getServerSession(authOptions);

  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

  const action = await prisma.action.findFirst({
    where: {
      id,
      plantId: plantRow.id,
    },
    include: {
      ownerUser: true,
      coOwners: {
        include: {
          user: true,
        },
      },
      evidenceAttachments: true,
      communication: true,
      sewo: true,
      closedByUser: true,
      reopenedByUser: true,
    },
  });

  if (!action) notFound();
  const [translatedTitle, translatedDescription, translatedClosureComment, translatedReopenReason] = await translateForViewer(uiLocale, [
    action.title,
    action.description,
    action.closureComment,
    action.reopenReason,
  ]);

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Action Detail</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Main</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Title</dt><dd>{translatedTitle}</dd></div>
            <div className="flex justify-between gap-4"><dt>Status</dt><dd>{action.status}</dd></div>
            <div className="flex justify-between gap-4"><dt>Priority</dt><dd>{action.priority}</dd></div>
            <div className="flex justify-between gap-4"><dt>Category</dt><dd>{action.category}</dd></div>
            <div className="flex justify-between gap-4"><dt>Source type</dt><dd>{action.sourceType}</dd></div>
            <div className="flex justify-between gap-4"><dt>Owner</dt><dd>{action.ownerUser.name}</dd></div>
            <div className="flex justify-between gap-4"><dt>Due date</dt><dd>{action.dueDate.toISOString().slice(0, 10)}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lifecycle</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Created at</dt><dd>{action.createdAt.toISOString()}</dd></div>
            <div className="flex justify-between gap-4"><dt>Updated at</dt><dd>{action.updatedAt.toISOString()}</dd></div>
            <div className="flex justify-between gap-4"><dt>Closed at</dt><dd>{action.closedAt?.toISOString() ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Closed by</dt><dd>{action.closedByUser?.name ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Reopened at</dt><dd>{action.reopenedAt?.toISOString() ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Reopened by</dt><dd>{action.reopenedByUser?.name ?? "-"}</dd></div>
          </dl>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h2>
        <p className="mt-3 text-sm text-slate-800">{translatedDescription}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Linked records</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Communication</dt><dd>{action.communicationId ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>S-EWO</dt><dd>{action.sewoId ?? "-"}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Co-owners</h2>
          <div className="mt-3 space-y-2 text-sm">
            {action.coOwners.length > 0 ? action.coOwners.map((entry) => <p key={entry.id}>{entry.user.name}</p>) : <p>-</p>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Evidence</h2>
          <div className="mt-3 space-y-2 text-sm">
            {action.evidenceAttachments.length > 0 ? (
              action.evidenceAttachments.map((entry) => <p key={entry.id}>{entry.fileName}</p>)
            ) : (
              <p>-</p>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Comments</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Closure comment</dt><dd>{translatedClosureComment || "-"}</dd></div>
          <div className="flex justify-between gap-4"><dt>Reopen reason</dt><dd>{translatedReopenReason || "-"}</dd></div>
        </dl>
      </section>

      <Link href={`/app/${plant}/actions`} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        Back to actions
      </Link>
    </>
  );
}
