import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";
import { generateCorporateReportAction } from "@/app/(secure)/app/corporate/reports/actions";
import { CorporateReportGeneratorForm } from "@/components/feature/corporate-report-generator-form";

type ReportFileKeys = {
  scope?: string;
  scopeLabel?: string;
  plantCode?: string | null;
  plantName?: string | null;
  pdfKey?: string;
  pdfFileName?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Only N1 Corporate users can generate corporate reports.",
  "invalid-input": "Report type, report scope, period start and period end are required.",
  "missing-factory": "Factory is required when Report Scope is Factory.",
  "invalid-period": "Period start must be before or equal to period end.",
};

function getFileKeys(value: unknown): ReportFileKeys {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as ReportFileKeys;
}

export default async function CorporateReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ generated?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const [plants, reportRuns] = await Promise.all([
    prisma.plant.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.reportRun.findMany({
      include: {
        plant: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
  ]);

  const reports = await Promise.all(
    reportRuns.map(async (run) => {
      const fileKeys = getFileKeys(run.fileKeys);
      const plantCode = run.plant?.code ?? fileKeys.plantCode ?? null;
      const plantName = run.plant?.name ?? fileKeys.plantName ?? null;
      const isFactoryReport = Boolean(run.plantId);
      const factoryLabel = isFactoryReport
        ? `${plantCode ? `${plantCode.toUpperCase()} - ` : ""}${plantName ?? "Selected factory"}`
        : "All factories";

      return {
        id: run.id,
        code: run.codigoCompleto ?? run.codigoAbreviado ?? "Requires code update",
        type: run.type,
        scopeLabel: isFactoryReport ? "Factory" : "Global",
        factoryLabel,
        status: run.status,
        periodStart: run.periodStart.toISOString().slice(0, 10),
        periodEnd: run.periodEnd.toISOString().slice(0, 10),
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? "-",
        recipientsCount: Array.isArray(run.recipients) ? run.recipients.length : 0,
        pdfFileName: fileKeys.pdfFileName ?? "report.pdf",
        pdfUrl: fileKeys.pdfKey ? await StorageService.getPresignedDownloadUrl({ key: fileKeys.pdfKey }) : null,
      };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Corporate Reports</h1>
          </div>
          <Link href="/app/corporate" className="text-sm font-semibold text-teal-700 hover:underline">
            Back to corporate dashboard
          </Link>
        </div>
      </div>

      {params.generated ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Report generated and shared automatically with the configured recipients.
        </div>
      ) : null}

      {params.error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERROR_MESSAGES[params.error] ?? "Unable to generate the report. Please review the selected inputs."}
        </div>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Generate Corporate Report</h2>
        </div>

        <CorporateReportGeneratorForm action={generateCorporateReportAction} plants={plants} />
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Factory</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3">PDF</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-900">{report.code}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{report.type}</td>
                <td className="px-4 py-3">{report.scopeLabel}</td>
                <td className="px-4 py-3">{report.factoryLabel}</td>
                <td className="px-4 py-3">{report.status}</td>
                <td className="px-4 py-3">
                  {report.periodStart} to {report.periodEnd}
                </td>
                <td className="px-4 py-3">{report.createdAt}</td>
                <td className="px-4 py-3">{report.completedAt}</td>
                <td className="px-4 py-3">{report.recipientsCount}</td>
                <td className="px-4 py-3">
                  {report.pdfUrl ? (
                    <a href={report.pdfUrl} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 hover:underline">
                      {report.pdfFileName}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                  No corporate reports have been generated yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
