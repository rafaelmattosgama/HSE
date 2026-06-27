import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import {
  formatLocalizedActionCategory,
  formatLocalizedActionManualOrigin,
  formatLocalizedActionPriority,
  formatLocalizedActionSourceType,
  formatLocalizedActionStatus,
} from "@/lib/actions-ui";
import { getActionLinkedRecordCodes, getActionLinkedRecordDescription } from "@/lib/action-linked-record";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedActionsUi } from "@/lib/services/actions-ui-localization";
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
      smatLinks: {
        include: {
          smatAudit: true,
        },
      },
      closedByUser: true,
      reopenedByUser: true,
    },
  });

  if (!action) notFound();
  const actionsUi = await getLocalizedActionsUi(uiLocale);
  const linkedRecordDescription = getActionLinkedRecordDescription(action);
  const linkedRecordCodes = getActionLinkedRecordCodes(action);
  const [translatedTitle, translatedDescription, translatedLinkedRecordDescription, translatedClosureComment, translatedReopenReason] = await translateForViewer(uiLocale, [
    action.title,
    action.description,
    linkedRecordDescription,
    action.closureComment,
    action.reopenReason,
  ]);

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{actionsUi.detail.title}</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.main}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldTitle}</dt><dd>{translatedTitle}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldStatus}</dt><dd>{formatLocalizedActionStatus(action.status, actionsUi)}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldPriority}</dt><dd>{formatLocalizedActionPriority(action.priority, actionsUi)}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldCategory}</dt><dd>{formatLocalizedActionCategory(action.category, actionsUi)}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldSourceType}</dt><dd>{formatLocalizedActionSourceType(action.sourceType, actionsUi)}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.manualOrigin}</dt><dd>{formatLocalizedActionManualOrigin(action.manualOrigin, actionsUi)}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldOwner}</dt><dd>{action.ownerUser.name}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldDueDate}</dt><dd>{action.dueDate.toISOString().slice(0, 10)}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.lifecycle}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldCreatedAt}</dt><dd>{action.createdAt.toISOString()}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldUpdatedAt}</dt><dd>{action.updatedAt.toISOString()}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldClosureDate}</dt><dd>{action.closedAt?.toISOString().slice(0, 10) ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldClosedAt}</dt><dd>{action.closedAt?.toISOString() ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldClosedBy}</dt><dd>{action.closedByUser?.name ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldReopenedAt}</dt><dd>{action.reopenedAt?.toISOString() ?? "-"}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.fieldReopenedBy}</dt><dd>{action.reopenedByUser?.name ?? "-"}</dd></div>
          </dl>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.description}</h2>
        <p className="mt-3 text-sm text-slate-800">{translatedDescription || "-"}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.linkedRecordDescription}</h2>
        <p className="mt-3 text-sm text-slate-800">{translatedLinkedRecordDescription || "-"}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.linkedRecords}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.communication}</dt><dd>{linkedRecordCodes.communicationCode}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.sewo}</dt><dd>{linkedRecordCodes.sewoCode}</dd></div>
            <div className="flex justify-between gap-4"><dt>{actionsUi.detail.smat}</dt><dd>{linkedRecordCodes.smatCode}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.coOwners}</h2>
          <div className="mt-3 space-y-2 text-sm">
            {action.coOwners.length > 0 ? action.coOwners.map((entry) => <p key={entry.id}>{entry.user.name}</p>) : <p>-</p>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.evidence}</h2>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{actionsUi.detail.comments}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt>{actionsUi.detail.closureComment}</dt><dd>{translatedClosureComment || "-"}</dd></div>
          <div className="flex justify-between gap-4"><dt>{actionsUi.detail.reopenReason}</dt><dd>{translatedReopenReason || "-"}</dd></div>
        </dl>
      </section>

      <Link href={`/app/${plant}/actions`} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        {actionsUi.detail.backToActions}
      </Link>
    </>
  );
}
