import { redirect } from "next/navigation";
import { ContractorPortal } from "@/components/feature/contractor-portal";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { prisma } from "@/lib/prisma";

export default async function ContractorPortalPage() {
  const company = await getContractorSessionCompany();
  if (!company) {
    redirect("/contractors/login");
  }

  const fullCompany = await prisma.externalCompany.findUniqueOrThrow({
    where: { id: company.id },
    include: {
      documents: true,
      workers: {
        include: {
          documents: true,
        },
      },
      plant: true,
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">External Company Portal</h1>
        <p className="mt-1 text-sm text-slate-600">{fullCompany.companyName} | {fullCompany.plant.name}</p>
      </header>

      <ContractorPortal
        company={{
          id: fullCompany.id,
          companyName: fullCompany.companyName,
          approvalStatus: fullCompany.approvalStatus,
          approvedUntil: fullCompany.approvedUntil?.toISOString().slice(0, 10) ?? null,
          plant: { code: fullCompany.plant.code, name: fullCompany.plant.name },
          documents: fullCompany.documents.map((document) => ({
            type: document.type,
            approvalStatus: document.approvalStatus,
            validUntil: document.validUntil?.toISOString().slice(0, 10) ?? null,
            fileName: document.fileName,
          })),
          workers: fullCompany.workers.map((worker) => ({
            id: worker.id,
            name: worker.name,
            approvalStatus: worker.approvalStatus,
            approvedUntil: worker.approvedUntil?.toISOString().slice(0, 10) ?? null,
            isActive: worker.isActive,
            documents: worker.documents.map((document) => ({
              type: document.type,
              approvalStatus: document.approvalStatus,
              validUntil: document.validUntil?.toISOString().slice(0, 10) ?? null,
              fileName: document.fileName,
            })),
          })),
        }}
      />
    </main>
  );
}
