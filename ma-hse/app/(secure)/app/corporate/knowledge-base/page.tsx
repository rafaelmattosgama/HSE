import { redirect } from "next/navigation";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { IncidentKnowledgeWorkspace } from "@/components/feature/incident-knowledge-workspace";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";

export default async function CorporateIncidentKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)) redirect("/app/corporate");

  const [{ documentId }, plants, storagePlant, initialDocument] = await Promise.all([
    searchParams,
    prisma.plant.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
    prisma.plant.findFirst({ where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true } }),
    searchParams.then(({ documentId: id }) => id
      ? prisma.incidentKnowledgeDocument.findUnique({ where: { id }, select: { plant: { select: { code: true } } } })
      : null),
  ]);
  const locale = await getServerUiLocale({ userLanguage: session.user.language });

  return (
    <IncidentKnowledgeWorkspace
      plants={plants}
      storagePlantCode={storagePlant?.code ?? ""}
      locale={locale}
      canManage
      initialDocumentId={documentId ?? null}
      initialDocumentPlantCode={initialDocument?.plant.code ?? ""}
    />
  );
}
