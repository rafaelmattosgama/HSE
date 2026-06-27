import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CreateSmatAudit } from "@/components/feature/create-smat-audit";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

const ALLOWED_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
];

const CATEGORY_LABELS: Record<string, string> = {
  A: "Local de trabalho",
  B: "Posicao das pessoas",
  C: "Comportamento perigoso",
  D: "EPI",
  E: "Ferramentas e equipamentos",
  F: "Reacoes das pessoas",
};

type StoredObservation = {
  category: string;
  description: string;
};

function renderObservationList(input: unknown) {
  const rows = Array.isArray(input) ? (input as StoredObservation[]) : [];
  const visible = rows.filter((entry) => entry?.description?.trim().length > 0);

  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">Sem registos.</p>;
  }

  return (
    <div className="space-y-2">
      {visible.map((entry, index) => (
        <div key={`${entry.category}-${index}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{CATEGORY_LABELS[entry.category] ?? entry.category}</p>
          <p className="mt-1">{entry.description}</p>
        </div>
      ))}
    </div>
  );
}

export default async function SmatPage({ params }: { params: Promise<{ plant: string }> }) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const allowed = session.user.plantRoles.some(
    (entry) =>
      (entry.plantCode === plant || entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE) &&
      ALLOWED_ROLES.includes(entry.role),
  );

  if (!allowed) {
    redirect(`/app/${plant}/dashboards`);
  }

  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const [audits, owners] = await prisma.$transaction([
    prisma.smatAudit.findMany({
      where: { plantId: plantRow.id },
      include: {
        auditorUser: {
          select: { name: true },
        },
        communication: {
          select: {
            id: true,
            type: true,
            status: true,
            reporterName: true,
          },
        },
        attachments: true,
        actionLinks: {
          include: {
            action: {
              include: {
                ownerUser: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ auditDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.userPlantRole.findMany({
      where: {
        plantId: plantRow.id,
        user: { isActive: true },
      },
      include: { user: true },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    }),
  ]);
  const translatedBlocks = await translateForViewer(
    uiLocale,
    audits.flatMap((audit) => {
      const observationDescriptions = [
        ...(Array.isArray(audit.safeActs) ? (audit.safeActs as StoredObservation[]).map((item) => item.description) : []),
        ...(Array.isArray(audit.safeConditions) ? (audit.safeConditions as StoredObservation[]).map((item) => item.description) : []),
        ...(Array.isArray(audit.unsafeActs) ? (audit.unsafeActs as StoredObservation[]).map((item) => item.description) : []),
        ...(Array.isArray(audit.unsafeConditions) ? (audit.unsafeConditions as StoredObservation[]).map((item) => item.description) : []),
      ];
      return [
        audit.areaExamined,
        audit.locationExamined,
        audit.notes,
        audit.answer1,
        audit.answer2,
        audit.answer3,
        audit.answer4,
        audit.answer5,
        audit.answer6,
        ...audit.actionLinks.map((entry) => entry.action.title),
        ...observationDescriptions,
      ];
    }),
  );

  let translationIndex = 0;
  const translatedAudits = audits.map((audit) => {
    const translateObservationList = (input: unknown) =>
      Array.isArray(input)
        ? (input as StoredObservation[]).map((entry) => ({
            ...entry,
            description: translatedBlocks[translationIndex++] ?? entry.description,
          }))
        : [];

    const translatedAudit = {
      ...audit,
      areaExamined: translatedBlocks[translationIndex++] ?? audit.areaExamined,
      locationExamined: translatedBlocks[translationIndex++] ?? audit.locationExamined,
      notes: translatedBlocks[translationIndex++] ?? audit.notes,
      answer1: translatedBlocks[translationIndex++] ?? audit.answer1,
      answer2: translatedBlocks[translationIndex++] ?? audit.answer2,
      answer3: translatedBlocks[translationIndex++] ?? audit.answer3,
      answer4: translatedBlocks[translationIndex++] ?? audit.answer4,
      answer5: translatedBlocks[translationIndex++] ?? audit.answer5,
      answer6: translatedBlocks[translationIndex++] ?? audit.answer6,
      actionLinks: audit.actionLinks.map((entry) => ({
        ...entry,
        action: {
          ...entry.action,
          title: translatedBlocks[translationIndex++] ?? entry.action.title,
        },
      })),
      safeActs: translateObservationList(audit.safeActs),
      safeConditions: translateObservationList(audit.safeConditions),
      unsafeActs: translateObservationList(audit.unsafeActs),
      unsafeConditions: translateObservationList(audit.unsafeConditions),
    };

    return translatedAudit;
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">SMAT</h1>
      </header>

      <CreateSmatAudit
        plantCode={plant}
        auditorName={session.user.name ?? ""}
        owners={owners.map((entry) => ({
          id: entry.user.id,
          name: entry.user.name,
        }))}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Auditorias recentes</h2>
          <p className="text-sm text-slate-500">{audits.length} registo(s)</p>
        </div>

        {audits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Ainda nao existem auditorias SMAT nesta planta.
          </div>
        ) : (
          <div className="space-y-4">
            {translatedAudits.map((audit) => (
              <article key={audit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{audit.auditorName}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {audit.auditDate.toISOString().slice(0, 10)}
                      {audit.startTimeText ? ` | ${audit.startTimeText}` : ""}
                      {audit.endTimeText ? ` - ${audit.endTimeText}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Area: {audit.areaExamined || "-"} | Local: {audit.locationExamined || "-"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Comunicacao: {audit.communication ? `${audit.communication.type} | ${audit.communication.reporterName} | ${audit.communication.status}` : "Nao associada"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <p>Observadas: {audit.peopleObservedCount}</p>
                      <p>Envolvidas: {audit.peopleInvolvedCount}</p>
                      <p>Seguras / nao seguras: {audit.peopleSafeCount} / {audit.peopleUnsafeCount}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/api/plants/${plant}/smat/${audit.id}/export?format=pdf`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Exportar PDF
                      </Link>
                      <Link href={`/api/plants/${plant}/smat/${audit.id}/export?format=xlsx`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Exportar Excel
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">AS</h4>
                    {renderObservationList(audit.safeActs)}
                  </section>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">CS</h4>
                    {renderObservationList(audit.safeConditions)}
                  </section>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">AI</h4>
                    {renderObservationList(audit.unsafeActs)}
                  </section>
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">CI</h4>
                    {renderObservationList(audit.unsafeConditions)}
                  </section>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">Guia de perguntas</h4>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      {[audit.answer1, audit.answer2, audit.answer3, audit.answer4, audit.answer5, audit.answer6].map((answer, index) => (
                        <div key={index}>
                          <p className="font-medium text-slate-900">{index + 1}.</p>
                          <p>{answer?.trim() ? answer : "-"}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">Notas e contexto</h4>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p>Condicoes seguras / nao seguras: {audit.workConditionsSafeCount} / {audit.workConditionsUnsafeCount}</p>
                      <p>Reacoes positivas / negativas: {audit.reactionsPositiveCount} / {audit.reactionsNegativeCount}</p>
                      <p>Registado por utilizador: {audit.auditorUser?.name ?? "-"}</p>
                      <p className="rounded-md bg-slate-50 p-3">{audit.notes?.trim() ? audit.notes : "Sem notas adicionais."}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">Fotos e acoes</h4>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="font-medium text-slate-900">Anexos</p>
                        {audit.attachments.length === 0 ? (
                          <p>Sem anexos.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {audit.attachments.map((attachment) => (
                              <div key={attachment.id} className="rounded-md bg-slate-50 p-2">
                                <p>{attachment.fileName}</p>
                                {attachment.caption ? <p className="mt-1 text-xs text-slate-500">{attachment.caption}</p> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="font-medium text-slate-900">Acoes criadas</p>
                        {audit.actionLinks.length === 0 ? (
                          <p>Sem acoes ligadas.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {audit.actionLinks.map((entry) => (
                              <Link key={entry.id} href={`/app/${plant}/actions/${entry.action.id}`} className="block rounded-md bg-slate-50 p-2 hover:bg-slate-100">
                                <span className="font-medium text-slate-900">{entry.action.title}</span>
                                <span className="block text-xs text-slate-500">{entry.action.status} | {entry.action.ownerUser.name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
