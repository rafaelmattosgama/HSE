import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { ContractorCompanyReview } from "@/components/feature/contractor-company-review";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";

export default async function ContractorCompanyPage({
  params,
}: {
  params: Promise<{ plant: string; companyId: string }>;
}) {
  const { plant, companyId } = await params;
  const session = await getServerSession(authOptions);
  const actorRole = session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;
  const company = await prisma.externalCompany.findUniqueOrThrow({
    where: { id: companyId },
    include: {
      documents: true,
      workers: {
        include: {
          documents: true,
        },
      },
      sponsorUser: true,
    },
  });
  const sponsorOptions = await prisma.user.findMany({
    where: {
      isActive: true,
      plantRoles: {
        some: {
          plant: {
            code: plant,
          },
          role: {
            code: RoleCode.N4_SUPERVISOR,
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{company.companyName}</h1>
        <p className="mt-1 text-sm text-slate-600">{company.email} | Sponsor: {company.sponsorUser?.name ?? "-"}</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div><dt className="text-slate-500">Address</dt><dd className="font-medium text-slate-900">{company.address}</dd></div>
          <div><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{company.phone}</dd></div>
          <div><dt className="text-slate-500">Tax ID</dt><dd className="font-medium text-slate-900">{company.taxId}</dd></div>
          <div><dt className="text-slate-500">Social Security</dt><dd className="font-medium text-slate-900">{company.socialSecurityId}</dd></div>
          <div><dt className="text-slate-500">Approval</dt><dd className="font-medium text-slate-900">{company.approvalStatus}</dd></div>
          <div><dt className="text-slate-500">Approved until</dt><dd className="font-medium text-slate-900">{company.approvedUntil?.toISOString().slice(0, 10) ?? "-"}</dd></div>
        </dl>
      </section>

      <ContractorCompanyReview
        plant={plant}
        companyId={company.id}
        sponsorUserId={company.sponsorUserId}
        sponsorOptions={sponsorOptions.map((entry) => ({
          id: entry.id,
          name: entry.name,
        }))}
        canApprove={actorRole === RoleCode.N3_SAFETY || actorRole === RoleCode.N1_CORPORATE}
        companyDocuments={company.documents.map((document) => ({
          id: document.id,
          type: document.type,
          fileName: document.fileName,
          approvalStatus: document.approvalStatus,
          validUntil: document.validUntil?.toISOString().slice(0, 10) ?? null,
        }))}
        workers={company.workers.map((worker) => ({
          id: worker.id,
          name: worker.name,
          approvalStatus: worker.approvalStatus,
          isActive: worker.isActive,
          approvedUntil: worker.approvedUntil?.toISOString().slice(0, 10) ?? null,
          documents: worker.documents.map((document) => ({
            id: document.id,
            type: document.type,
            fileName: document.fileName,
            approvalStatus: document.approvalStatus,
            validUntil: document.validUntil?.toISOString().slice(0, 10) ?? null,
          })),
        }))}
      />

      <Link href={`/app/${plant}/contractors`} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        Back to contractors
      </Link>
    </>
  );
}
