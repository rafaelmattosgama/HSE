import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { ContractorsDashboard } from "@/components/feature/contractors-dashboard";
import { prisma } from "@/lib/prisma";
import { getServerUiDictionary } from "@/lib/server-ui-language";

export default async function ContractorsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const actorRole = session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const ui = await getServerUiDictionary({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const companies = await prisma.externalCompany.findMany({
    where: { plantId: plantRow.id },
    include: {
      workers: true,
      sponsorUser: true,
    },
    orderBy: { companyName: "asc" },
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.contractors}</h1>
      </header>

      <ContractorsDashboard
        plant={plant}
        canApprove={actorRole === RoleCode.N3_SAFETY || actorRole === RoleCode.N1_CORPORATE}
        companies={companies.map((company) => ({
          id: company.id,
          companyName: company.companyName,
          email: company.email,
          approvalStatus: company.approvalStatus,
          isActive: company.isActive,
          approvedUntil: company.approvedUntil?.toISOString().slice(0, 10) ?? null,
          workerCount: company.workers.length,
          pendingWorkers: company.workers.filter((worker) => worker.approvalStatus === "PENDING").length,
          sponsorName: company.sponsorUser?.name ?? "-",
          workers: company.workers.map((worker) => ({
            id: worker.id,
            name: worker.name,
            approvalStatus: worker.approvalStatus,
            isActive: worker.isActive,
            approvedUntil: worker.approvedUntil?.toISOString().slice(0, 10) ?? null,
          })),
        }))}
      />
    </>
  );
}
