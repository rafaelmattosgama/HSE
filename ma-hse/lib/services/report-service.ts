import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { KpiService } from "@/lib/services/kpi-service";

function pdfBufferFromText(lines: string[]) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).text("EHS Safety Report", { underline: true });
    doc.moveDown();

    for (const line of lines) {
      doc.fontSize(11).text(line);
    }

    doc.end();
  });
}

async function xlsxBufferFromSummary(summary: {
  title: string;
  total: number;
  byType: { type: string; count: number }[];
}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Summary");

  sheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 24 },
  ];

  sheet.addRow({ metric: "Title", value: summary.title });
  sheet.addRow({ metric: "Total Valid Events", value: summary.total });

  sheet.addRow({ metric: "", value: "" });
  sheet.addRow({ metric: "Type", value: "Count" });

  summary.byType.forEach((entry) => sheet.addRow({ metric: entry.type, value: entry.count }));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export const ReportService = {
  async generatePeriodReport(input: {
    plantId: string;
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
  }) {
    const plant = await prisma.plant.findUniqueOrThrow({
      where: { id: input.plantId },
    });

    const year = input.periodStart.getUTCFullYear();
    const month = input.periodStart.getUTCMonth() + 1;

    const kpi = await KpiService.getMonthlyKpis(input.plantId, year, month);

    const byType = kpi.byType.map((entry) => ({
      type: entry.type,
      count: entry._count,
    }));

    const title = `${input.reportType} - ${plant.name} (${format(input.periodStart, "yyyy-MM-dd")} to ${format(input.periodEnd, "yyyy-MM-dd")})`;

    const pdf = await pdfBufferFromText([
      `Plant: ${plant.name} (${plant.code})`,
      `Period: ${format(input.periodStart, "yyyy-MM-dd")} - ${format(input.periodEnd, "yyyy-MM-dd")}`,
      `Total valid events: ${kpi.totalValidEvents}`,
      `Hours worked: ${kpi.hoursWorked}`,
      `Top causes (MVP): derived from S-EWO cause selections.`,
      `Top overdue actions (MVP): derived from open actions with due date < now.`,
    ]);

    const xlsx = await xlsxBufferFromSummary({
      title,
      total: kpi.totalValidEvents,
      byType,
    });

    return {
      title,
      meta: {
        reportType: input.reportType,
        plantId: input.plantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      pdf,
      xlsx,
    };
  },
};