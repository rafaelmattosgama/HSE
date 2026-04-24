import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";
import { generateCorporateReportAction } from "@/app/(secure)/app/corporate/reports/actions";

type ReportFileKeys = {
  scope?: string;
  pdfKey?: string;
  xlsxKey?: string;
  pdfFileName?: string;
  xlsxFileName?: string;
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
  const reportRuns = await prisma.reportRun.findMany({
    where: {
      plantId: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  const reports = await Promise.all(
    reportRuns.map(async (run) => {
      const fileKeys = getFileKeys(run.fileKeys);

      return {
        id: run.id,
        type: run.type,
        status: run.status,
        periodStart: run.periodStart.toISOString().slice(0, 10),
        periodEnd: run.periodEnd.toISOString().slice(0, 10),
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? "-",
        recipientsCount: Array.isArray(run.recipients) ? run.recipients.length : 0,
        pdfFileName: fileKeys.pdfFileName ?? "report.pdf",
        xlsxFileName: fileKeys.xlsxFileName ?? "report.xlsx",
        pdfUrl: fileKeys.pdfKey ? await StorageService.getPresignedDownloadUrl({ key: fileKeys.pdfKey }) : null,
        xlsxUrl: fileKeys.xlsxKey ? await StorageService.getPresignedDownloadUrl({ key: fileKeys.xlsxKey }) : null,
      };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Corporate Reports</h1>
            <p className="mt-1 text-sm text-slate-600">History of automatic corporate reports generated across all plants.</p>
          </div>
          <Link href="/app/corporate" className="text-sm font-semibold text-teal-700 hover:underline">
            Back to corporate dashboard
          </Link>
        </div>
      </div>

      {params.generated ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Corporate report generated and shared automatically with N2 and N3.
        </div>
      ) : null}

      {params.error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Unable to generate the report. Please review the selected inputs.
        </div>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Generate Corporate Report</h2>
          <p className="text-sm text-slate-600">
            Generate the corporate report manually from this page. The generated files are shared automatically with N2 and N3.
          </p>
        </div>

        <form action={generateCorporateReportAction} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report type</span>
            <select name="reportType" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" defaultValue="MONTHLY">
              <option value="WEEKLY_DIGEST">Weekly digest</option>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period start</span>
            <input name="periodStart" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" required />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period end</span>
            <input name="periodEnd" type="date" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" required />
          </label>

          <div className="flex items-end">
            <button type="submit" className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90">
              Generate and share
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3">XLSX</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-900">{report.type}</td>
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
                <td className="px-4 py-3">
                  {report.xlsxUrl ? (
                    <a href={report.xlsxUrl} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 hover:underline">
                      {report.xlsxFileName}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
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
