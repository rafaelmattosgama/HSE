import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import ExcelJS from "exceljs";
import { CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { KpiService } from "@/lib/services/kpi-service";
import { RecordCodeService } from "@/lib/services/record-code-service";
import { StorageService } from "@/lib/services/storage-service";

const KPI_STATUSES = [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED];
const ONE_MILLION = 1_000_000;

type CorporateSafetyPlantRow = {
  plantId: string;
  plantCode: string;
  plantName: string;
  country: string;
  location: string;
  hoursYtd: number;
  injuriesYtd: number;
  lostDaysYtd: number;
  gravityRateYtd: number;
  frequencyRateYtd: number;
  injuriesBudget: number;
  gravityRateBudget: number;
  frequencyRateBudget: number;
  injuriesMonth: number;
  lostDaysMonth: number;
  gravityRateMonth: number;
  frequencyRateMonth: number;
  injuries2025Ytd: number;
  lostDays2025Ytd: number;
};

type CorporateSafetySeries = {
  months: string[];
  injuries2025: number[];
  injuriesCurrent: number[];
  injuriesBudget: number[];
  daysLost2025: number[];
  daysLostCurrent: number[];
  daysLostBudget: number[];
  frequencyRate2025: number[];
  frequencyRateCurrent: number[];
  frequencyRateYtd: number[];
  frequencyRateBudget: number[];
  gravityRate2025: number[];
  gravityRateCurrent: number[];
  gravityRateYtd: number[];
  gravityRateBudget: number[];
  yearlyComparison: Array<{
    yearLabel: string;
    injuries: number;
    lostDays: number;
    hoursWorked: number;
    frequencyRate: number;
    gravityRate: number;
    hoursPerInjury: number;
  }>;
};

type CorporateSafetyReportData = {
  selectedYear: number;
  selectedMonth: number;
  selectedMonthName: string;
  scopeLabel: string;
  plants: Array<{ id: string; code: string; name: string; country: string; location: string }>;
  rows: CorporateSafetyPlantRow[];
  division: CorporateSafetyPlantRow;
  series: CorporateSafetySeries;
  budgetAvailable: boolean;
};

function pdfBufferFromText(lines: string[]) {
  return new Promise<Buffer>((resolve) => {
    const doc = createPdfDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
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

function buildReportFileNames(input: { scope: string; reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST"; periodStart: Date; periodEnd: Date }) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const baseName = `${input.scope}-${input.reportType.toLowerCase()}-${periodToken}`;

  return {
    pdf: `${baseName}.pdf`,
  };
}

function buildReportStorageKeys(input: {
  scope: string;
  reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
  periodStart: Date;
  periodEnd: Date;
}) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const basePath = `reports/${input.scope}/${input.reportType.toLowerCase()}/${periodToken}`;
  const files = buildReportFileNames(input);

  return {
    pdfKey: `${basePath}/${files.pdf}`,
    files,
  };
}

function monthStartUtc(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function monthEndUtc(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function formatNumber(value: number, decimals = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatRate(value: number) {
  return formatNumber(value, 2);
}

function safeRate(numerator: number, hoursWorked: number) {
  return hoursWorked > 0 ? (numerator / hoursWorked) * ONE_MILLION : 0;
}

function safeHoursPerInjury(hoursWorked: number, injuries: number) {
  return injuries > 0 ? hoursWorked / injuries : 0;
}

function getMonthLabel(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function createEmptySafetyRow(plant: { id: string; code: string; name: string; country: string; location: string }): CorporateSafetyPlantRow {
  return {
    plantId: plant.id,
    plantCode: plant.code,
    plantName: plant.name,
    country: plant.country,
    location: plant.location,
    hoursYtd: 0,
    injuriesYtd: 0,
    lostDaysYtd: 0,
    gravityRateYtd: 0,
    frequencyRateYtd: 0,
    injuriesBudget: 0,
    gravityRateBudget: 0,
    frequencyRateBudget: 0,
    injuriesMonth: 0,
    lostDaysMonth: 0,
    gravityRateMonth: 0,
    frequencyRateMonth: 0,
    injuries2025Ytd: 0,
    lostDays2025Ytd: 0,
  };
}

function buildCorporateSafetyReportData(input: {
  plants: Array<{ id: string; code: string; name: string }>;
  communications: Array<{ plantId: string; type: CommunicationType; lostDays: number | null; eventDatetime: Date }>;
  kpiInputs: Array<{ plantId: string; year: number; month: number; hoursWorked: number }>;
  selectedYear: number;
  selectedMonth: number;
  scopeLabel: string;
}): CorporateSafetyReportData {
  const reportPlants = input.plants.map((plant) => ({
    id: plant.id,
    code: plant.code,
    name: plant.name,
    country: "N/A",
    location: "N/A",
  }));
  const ytdStart = monthStartUtc(input.selectedYear, 1);
  const ytdEnd = monthEndUtc(input.selectedYear, input.selectedMonth);
  const monthStart = monthStartUtc(input.selectedYear, input.selectedMonth);
  const monthEnd = monthEndUtc(input.selectedYear, input.selectedMonth);

  const rows = reportPlants.map((plant) => {
    const row = createEmptySafetyRow(plant);
    const plantInputsYtd = input.kpiInputs.filter(
      (entry) => entry.plantId === plant.id && entry.year === input.selectedYear && entry.month <= input.selectedMonth,
    );
    const plantInputsMonth = input.kpiInputs.filter(
      (entry) => entry.plantId === plant.id && entry.year === input.selectedYear && entry.month === input.selectedMonth,
    );
    const communicationsYtd = input.communications.filter(
      (entry) => entry.plantId === plant.id && entry.eventDatetime >= ytdStart && entry.eventDatetime <= ytdEnd,
    );
    const communicationsMonth = input.communications.filter(
      (entry) => entry.plantId === plant.id && entry.eventDatetime >= monthStart && entry.eventDatetime <= monthEnd,
    );
    const communications2025Ytd = input.communications.filter(
      (entry) => entry.plantId === plant.id && entry.eventDatetime >= monthStartUtc(2025, 1) && entry.eventDatetime <= monthEndUtc(2025, input.selectedMonth),
    );
    const injuriesYtd = communicationsYtd.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const injuriesMonth = communicationsMonth.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const lostDaysYtd = communicationsYtd.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const lostDaysMonth = communicationsMonth.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursYtd = plantInputsYtd.reduce((sum, entry) => sum + entry.hoursWorked, 0);
    const hoursMonth = plantInputsMonth.reduce((sum, entry) => sum + entry.hoursWorked, 0);

    row.hoursYtd = hoursYtd;
    row.injuriesYtd = injuriesYtd;
    row.lostDaysYtd = lostDaysYtd;
    row.frequencyRateYtd = safeRate(injuriesYtd, hoursYtd);
    row.gravityRateYtd = safeRate(lostDaysYtd, hoursYtd);
    row.injuriesMonth = injuriesMonth;
    row.lostDaysMonth = lostDaysMonth;
    row.frequencyRateMonth = safeRate(injuriesMonth, hoursMonth);
    row.gravityRateMonth = safeRate(lostDaysMonth, hoursMonth);
    row.injuries2025Ytd = communications2025Ytd.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    row.lostDays2025Ytd = communications2025Ytd.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    return row;
  });

  const division = createEmptySafetyRow({
    id: "MA-DIVISION",
    code: "MA",
    name: "MA Division",
    country: "N/A",
    location: "N/A",
  });
  division.hoursYtd = rows.reduce((sum, row) => sum + row.hoursYtd, 0);
  division.injuriesYtd = rows.reduce((sum, row) => sum + row.injuriesYtd, 0);
  division.lostDaysYtd = rows.reduce((sum, row) => sum + row.lostDaysYtd, 0);
  division.injuriesMonth = rows.reduce((sum, row) => sum + row.injuriesMonth, 0);
  division.lostDaysMonth = rows.reduce((sum, row) => sum + row.lostDaysMonth, 0);
  const monthHours = input.kpiInputs
    .filter((entry) => entry.year === input.selectedYear && entry.month === input.selectedMonth)
    .reduce((sum, entry) => sum + entry.hoursWorked, 0);
  division.frequencyRateYtd = safeRate(division.injuriesYtd, division.hoursYtd);
  division.gravityRateYtd = safeRate(division.lostDaysYtd, division.hoursYtd);
  division.frequencyRateMonth = safeRate(division.injuriesMonth, monthHours);
  division.gravityRateMonth = safeRate(division.lostDaysMonth, monthHours);

  const months = Array.from({ length: input.selectedMonth }, (_, index) => index + 1);
  const monthlyMetric = (year: number, month: number) => {
    const start = monthStartUtc(year, month);
    const end = monthEndUtc(year, month);
    const monthComms = input.communications.filter((entry) => entry.eventDatetime >= start && entry.eventDatetime <= end);
    const injuries = monthComms.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const lostDays = monthComms.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = input.kpiInputs
      .filter((entry) => entry.year === year && entry.month === month)
      .reduce((sum, entry) => sum + entry.hoursWorked, 0);
    return {
      injuries,
      lostDays,
      hoursWorked,
      frequencyRate: safeRate(injuries, hoursWorked),
      gravityRate: safeRate(lostDays, hoursWorked),
    };
  };
  const ytdMetric = (year: number, throughMonth: number) => {
    const start = monthStartUtc(year, 1);
    const end = monthEndUtc(year, throughMonth);
    const rowsForPeriod = input.communications.filter((entry) => entry.eventDatetime >= start && entry.eventDatetime <= end);
    const injuries = rowsForPeriod.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const lostDays = rowsForPeriod.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = input.kpiInputs
      .filter((entry) => entry.year === year && entry.month <= throughMonth)
      .reduce((sum, entry) => sum + entry.hoursWorked, 0);
    return {
      injuries,
      lostDays,
      hoursWorked,
      frequencyRate: safeRate(injuries, hoursWorked),
      gravityRate: safeRate(lostDays, hoursWorked),
      hoursPerInjury: safeHoursPerInjury(hoursWorked, injuries),
    };
  };

  const currentMonthly = months.map((month) => monthlyMetric(input.selectedYear, month));
  const reference2025 = months.map((month) => monthlyMetric(2025, month));
  const cumulativeCurrent = months.map((month) => ytdMetric(input.selectedYear, month));
  const yearlyComparison = Array.from(
    { length: Math.max(0, input.selectedYear - 2022 + 1) },
    (_, index) => 2022 + index,
  ).map((year) => {
    const metric = ytdMetric(year, year === input.selectedYear ? input.selectedMonth : 12);
    return {
      yearLabel: year === input.selectedYear ? `${year} YTD` : String(year),
      ...metric,
    };
  });

  return {
    selectedYear: input.selectedYear,
    selectedMonth: input.selectedMonth,
    selectedMonthName: new Date(Date.UTC(input.selectedYear, input.selectedMonth - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    scopeLabel: input.scopeLabel,
    plants: reportPlants,
    rows,
    division,
    budgetAvailable: false,
    series: {
      months: months.map(getMonthLabel),
      injuries2025: reference2025.map((metric) => metric.injuries),
      injuriesCurrent: currentMonthly.map((metric) => metric.injuries),
      injuriesBudget: months.map(() => 0),
      daysLost2025: reference2025.map((metric) => metric.lostDays),
      daysLostCurrent: currentMonthly.map((metric) => metric.lostDays),
      daysLostBudget: months.map(() => 0),
      frequencyRate2025: reference2025.map((metric) => metric.frequencyRate),
      frequencyRateCurrent: currentMonthly.map((metric) => metric.frequencyRate),
      frequencyRateYtd: cumulativeCurrent.map((metric) => metric.frequencyRate),
      frequencyRateBudget: months.map(() => 0),
      gravityRate2025: reference2025.map((metric) => metric.gravityRate),
      gravityRateCurrent: currentMonthly.map((metric) => metric.gravityRate),
      gravityRateYtd: cumulativeCurrent.map((metric) => metric.gravityRate),
      gravityRateBudget: months.map(() => 0),
      yearlyComparison,
    },
  };
}

function pdfBufferFromCorporateSafetyReport(report: CorporateSafetyReportData) {
  return new Promise<Buffer>((resolve) => {
    const doc = createPdfDocument({ margin: 0, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const ink = "#0F172A";
    const muted = "#64748B";
    const line = "#E2E8F0";
    const brand = "#0B4A7A";
    const accent = "#D10014";
    const blue = "#4F83BD";
    const card = "#FFFFFF";
    const bg = "#F6F8FB";

    let firstPage = true;
    const addPage = (layout: "portrait" | "landscape" = "portrait") => {
      if (firstPage) {
        firstPage = false;
      } else {
        doc.addPage({ margin: 0, size: "A4", layout });
      }
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(bg);
      doc.circle(doc.page.width + 20, -10, 180).fill("#E8F2FC");
      doc.rect(44, 44, doc.page.width - 88, doc.page.height - 88).fill(card);
      doc.fillColor(ink);
    };
    const header = (section: string, badge = report.selectedMonthName) => {
      doc.roundedRect(64, 60, 34, 30, 10).strokeColor(brand).lineWidth(1.5).stroke();
      doc.fillColor(brand).font("Helvetica-Bold").fontSize(12).text("MA", 70, 69, { width: 22, align: "center" });
      doc.fillColor(muted).fontSize(8).text("MANUFACTURING", 108, 62, { width: 160 });
      doc.fillColor(ink).fontSize(11).text(section, 108, 76, { width: 240 });
      doc.roundedRect(doc.page.width - 170, 62, 106, 22, 11).fill("#E8F2FC");
      doc.fillColor(brand).fontSize(8).text(badge, doc.page.width - 158, 69, { width: 82, align: "center" });
      doc.fillColor(ink).font("Helvetica");
    };
    const footer = (page: string) => {
      doc.moveTo(64, doc.page.height - 42).lineTo(doc.page.width - 64, doc.page.height - 42).strokeColor(line).stroke();
      doc.fillColor("#94A3B8").fontSize(8).text("Generated by MAxSafety | Source: software records only", 64, doc.page.height - 31, { width: 360 });
      doc.text(page, doc.page.width - 100, doc.page.height - 31, { width: 36, align: "right" });
      doc.fillColor(ink);
    };
    const sectionTitle = (title: string, subtitle?: string) => {
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(23).text(title, 64, 116, { width: doc.page.width - 128 });
      if (subtitle) doc.fillColor(muted).font("Helvetica").fontSize(10).text(subtitle, 64, 148, { width: doc.page.width - 128 });
    };
    const metricCard = (x: number, y: number, w: number, label: string, value: string, note: string, tone = "#E8F2FC") => {
      doc.roundedRect(x, y, w, 86, 16).fillAndStroke(card, line);
      doc.circle(x + w - 14, y + 84, 38).fill(tone);
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x + 12, y + 13, { width: w - 24 });
      doc.fillColor(ink).fontSize(24).text(value, x + 12, y + 31, { width: w - 24 });
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(note, x + 12, y + 64, { width: w - 24 });
    };
    const drawTable = (x: number, y: number, widths: number[], headers: string[], rows: string[][], rowHeight = 22, fontSize = 7) => {
      const totalWidth = widths.reduce((sum, width) => sum + width, 0);
      doc.roundedRect(x, y, totalWidth, 24, 8).fill(brand);
      let cursorX = x;
      headers.forEach((cell, index) => {
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(fontSize).text(cell.toUpperCase(), cursorX + 4, y + 8, {
          width: widths[index] - 8,
        });
        cursorX += widths[index];
      });
      rows.forEach((row, rowIndex) => {
        const rowY = y + 24 + rowIndex * rowHeight;
        doc.rect(x, rowY, totalWidth, rowHeight).fillAndStroke(rowIndex % 2 === 0 ? "#FFFFFF" : "#F8FBFE", "#EDF2F7");
        cursorX = x;
        row.forEach((cell, index) => {
          doc.fillColor(ink).font("Helvetica").fontSize(fontSize).text(cell, cursorX + 4, rowY + 6, {
            width: widths[index] - 8,
            height: rowHeight - 7,
          });
          cursorX += widths[index];
        });
      });
    };
    const maxOf = (values: number[]) => Math.max(1, ...values.filter((value) => Number.isFinite(value)));
    const drawBarChart = (x: number, y: number, w: number, h: number, title: string, categories: string[], series: Array<{ label: string; color: string; values: number[] }>, decimals = 0) => {
      doc.roundedRect(x, y, w, h, 16).fillAndStroke(card, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(title, x + 18, y + 16, { width: w - 36 });
      const plotX = x + 44;
      const plotY = y + 52;
      const plotW = w - 70;
      const plotH = h - 92;
      const max = maxOf(series.flatMap((entry) => entry.values));
      for (let step = 0; step <= 4; step += 1) {
        const lineY = plotY + plotH - (plotH * step) / 4;
        doc.moveTo(plotX, lineY).lineTo(plotX + plotW, lineY).strokeColor("#E5EAF1").stroke();
      }
      const groupW = plotW / Math.max(1, categories.length);
      const barW = Math.max(5, Math.min(16, (groupW - 10) / Math.max(1, series.length)));
      categories.forEach((category, categoryIndex) => {
        const baseX = plotX + categoryIndex * groupW + 6;
        series.forEach((entry, seriesIndex) => {
          const value = entry.values[categoryIndex] ?? 0;
          const barH = (value / max) * plotH;
          const bx = baseX + seriesIndex * (barW + 3);
          doc.roundedRect(bx, plotY + plotH - barH, barW, barH, 3).fill(entry.color);
          doc.fillColor(entry.color).font("Helvetica-Bold").fontSize(6).text(formatNumber(value, decimals), bx - 4, plotY + plotH - barH - 10, { width: barW + 8, align: "center" });
        });
        doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(category, plotX + categoryIndex * groupW, plotY + plotH + 10, { width: groupW, align: "center" });
      });
      let legendX = x + w - 190;
      series.forEach((entry) => {
        doc.roundedRect(legendX, y + 18, 8, 8, 2).fill(entry.color);
        doc.fillColor(muted).fontSize(7).text(entry.label, legendX + 12, y + 17, { width: 55 });
        legendX += 62;
      });
    };
    const drawLineChart = (x: number, y: number, w: number, h: number, title: string, categories: string[], series: Array<{ label: string; color: string; values: number[] }>, decimals = 2) => {
      doc.roundedRect(x, y, w, h, 16).fillAndStroke(card, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(title, x + 18, y + 16, { width: w - 36 });
      const plotX = x + 44;
      const plotY = y + 54;
      const plotW = w - 70;
      const plotH = h - 96;
      const max = maxOf(series.flatMap((entry) => entry.values));
      for (let step = 0; step <= 4; step += 1) {
        const lineY = plotY + plotH - (plotH * step) / 4;
        doc.moveTo(plotX, lineY).lineTo(plotX + plotW, lineY).strokeColor("#E5EAF1").stroke();
      }
      series.forEach((entry) => {
        const points = entry.values.map((value, index) => {
          const px = categories.length === 1 ? plotX + plotW / 2 : plotX + (plotW * index) / (categories.length - 1);
          const py = plotY + plotH - (value / max) * plotH;
          return { x: px, y: py, value };
        });
        points.forEach((point, index) => {
          if (index > 0) {
            const previous = points[index - 1];
            doc.moveTo(previous.x, previous.y).lineTo(point.x, point.y).strokeColor(entry.color).lineWidth(2.2).stroke();
          }
          doc.circle(point.x, point.y, 3).fill(entry.color);
          doc.fillColor(entry.color).font("Helvetica-Bold").fontSize(6).text(formatNumber(point.value, decimals), point.x - 14, point.y - 13, { width: 28, align: "center" });
        });
      });
      categories.forEach((category, index) => {
        const px = categories.length === 1 ? plotX + plotW / 2 : plotX + (plotW * index) / (categories.length - 1);
        doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(category, px - 20, plotY + plotH + 10, { width: 40, align: "center" });
      });
      let legendX = x + w - 230;
      series.forEach((entry) => {
        doc.roundedRect(legendX, y + 18, 8, 8, 2).fill(entry.color);
        doc.fillColor(muted).fontSize(7).text(entry.label, legendX + 12, y + 17, { width: 70 });
        legendX += 76;
      });
    };
    const drawPareto = (x: number, y: number, w: number, h: number, title: string, rows: Array<{ label: string; value: number }>) => {
      const sorted = [...rows].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
      const total = sorted.reduce((sum, row) => sum + row.value, 0);
      const cumulative: number[] = [];
      sorted.reduce((sum, row, index) => {
        const next = sum + row.value;
        cumulative[index] = total > 0 ? (next / total) * 100 : 0;
        return next;
      }, 0);
      drawBarChart(x, y, w, h, title, sorted.map((row) => row.label), [{ label: "YTD", color: accent, values: sorted.map((row) => row.value) }], 0);
      const plotX = x + 44;
      const plotY = y + 54;
      const plotW = w - 70;
      const plotH = h - 96;
      cumulative.forEach((value, index) => {
        const px = sorted.length === 1 ? plotX + plotW / 2 : plotX + (plotW * index) / (sorted.length - 1);
        const py = plotY + plotH - (value / 100) * plotH;
        if (index > 0) {
          const prevX = sorted.length === 1 ? plotX + plotW / 2 : plotX + (plotW * (index - 1)) / (sorted.length - 1);
          const prevY = plotY + plotH - (cumulative[index - 1] / 100) * plotH;
          doc.moveTo(prevX, prevY).lineTo(px, py).strokeColor(brand).lineWidth(2).stroke();
        }
        doc.circle(px, py, 3).fill(brand);
      });
    };

    addPage();
    header("Safety Performance");
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(10).text(report.selectedMonthName.toUpperCase(), 64, 168);
    doc.fillColor(ink).fontSize(38).text("Key Performance Indicators", 64, 198, { width: 420 });
    doc.fillColor(muted).font("Helvetica").fontSize(16).text("Manufacturing", 64, 292);
    doc.roundedRect(64, 342, 210, 142, 22).fill(brand);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text("Sections", 86, 368);
    ["Legenda Plant", "Safety Metrics", "Metrics", "Logistics Metrics"].forEach((item, index) => {
      doc.fillColor("#D5E9FF").font("Helvetica").fontSize(11).text(item, 88, 400 + index * 20);
    });
    metricCard(308, 342, 190, "Report Scope", report.scopeLabel, "Generated in English", "#E8F2FC");
    metricCard(308, 446, 190, "Plants included", String(report.plants.length), "Active plants in scope", "#DCFCE7");
    footer("01");

    addPage();
    header("Plant Legend");
    sectionTitle("Legenda Plant", "Plant master data used by this report. Country and location show N/A when unavailable in the system.");
    drawTable(
      64,
      184,
      [190, 90, 125, 85],
      ["Plant", "Code", "City / Location", "Country"],
      report.plants.map((plant) => [plant.name, plant.code.toUpperCase(), plant.location, plant.country]),
      26,
      9,
    );
    footer("02");

    addPage();
    header("Safety");
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(44).text("Safety", 64, 245, { width: 420 });
    doc.fillColor(ink).fontSize(20).text(`Key Performance Indicators ${report.selectedYear}`, 64, 305, { width: 420 });
    doc.fillColor(muted).font("Helvetica").fontSize(15).text("Manufacturing", 64, 338);
    footer("03");

    addPage("landscape");
    header("Safety KPI Progressive YTD", report.selectedMonthName);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(17).text(`Safety KPI Progressive YTD ${report.selectedMonthName}`, 64, 106, { width: 680 });
    const tableRows = [...report.rows, report.division].map((row) => [
      row.plantName,
      row.country,
      formatNumber(row.hoursYtd),
      formatNumber(row.injuriesYtd),
      formatNumber(row.lostDaysYtd),
      formatRate(row.gravityRateYtd),
      formatRate(row.frequencyRateYtd),
      formatNumber(row.injuriesBudget),
      formatRate(row.gravityRateBudget),
      formatRate(row.frequencyRateBudget),
      formatNumber(row.injuriesMonth),
      formatNumber(row.lostDaysMonth),
      formatRate(row.gravityRateMonth),
      formatRate(row.frequencyRateMonth),
    ]);
    drawTable(
      48,
      142,
      [100, 52, 78, 52, 58, 60, 60, 52, 60, 60, 52, 58, 60, 60],
      ["Plant", "Country", `Worked Hours YTD ${report.selectedYear}`, `Injuries YTD ${report.selectedYear}`, `Days Lost YTD ${report.selectedYear}`, `Gravity Rate YTD ${report.selectedYear}`, `Frequency Rate YTD ${report.selectedYear}`, `Injuries Budget ${report.selectedYear}`, `Gravity Rate BDG ${report.selectedYear}`, `Frequency Rate BDG ${report.selectedYear}`, `Injuries ${report.selectedMonthName}`, `Days Lost ${report.selectedMonthName}`, `Gravity Rate ${report.selectedMonthName}`, `Frequency Rate ${report.selectedMonthName}`],
      tableRows,
      24,
      6,
    );
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("Budget indicators are 0 when no budget data is available in the software.", 48, 550, { width: 420 });
    footer("04");

    addPage("landscape");
    header("Division Trends", report.selectedMonthName);
    drawBarChart(48, 112, 360, 190, "Division - Injuries", report.series.months, [
      { label: "2025", color: blue, values: report.series.injuries2025 },
      { label: String(report.selectedYear), color: accent, values: report.series.injuriesCurrent },
      { label: `BDG ${report.selectedYear}`, color: ink, values: report.series.injuriesBudget },
    ]);
    drawBarChart(432, 112, 360, 190, "Division - Days Lost", report.series.months, [
      { label: "2025", color: blue, values: report.series.daysLost2025 },
      { label: String(report.selectedYear), color: accent, values: report.series.daysLostCurrent },
      { label: `BDG ${report.selectedYear}`, color: ink, values: report.series.daysLostBudget },
    ]);
    drawLineChart(48, 326, 360, 190, "Division - Frequency Rate", report.series.months, [
      { label: "2025", color: blue, values: report.series.frequencyRate2025 },
      { label: String(report.selectedYear), color: accent, values: report.series.frequencyRateCurrent },
      { label: `${report.selectedYear} YTD`, color: "#B45309", values: report.series.frequencyRateYtd },
      { label: `BDG ${report.selectedYear}`, color: ink, values: report.series.frequencyRateBudget },
    ]);
    drawLineChart(432, 326, 360, 190, "Division - Gravity Rate", report.series.months, [
      { label: "2025", color: blue, values: report.series.gravityRate2025 },
      { label: String(report.selectedYear), color: accent, values: report.series.gravityRateCurrent },
      { label: `${report.selectedYear} YTD`, color: "#B45309", values: report.series.gravityRateYtd },
      { label: `BDG ${report.selectedYear}`, color: ink, values: report.series.gravityRateBudget },
    ]);
    footer("05");

    addPage("landscape");
    header("Plant Pareto", report.selectedMonthName);
    drawPareto(
      48,
      112,
      360,
      190,
      "Plants - Pareto Injuries YTD",
      report.rows.map((row) => ({ label: row.plantCode.toUpperCase(), value: row.injuriesYtd })),
    );
    drawBarChart(432, 112, 360, 190, "Plants - Injuries", report.rows.map((row) => row.plantCode.toUpperCase()), [
      { label: "2025", color: blue, values: report.rows.map((row) => row.injuries2025Ytd) },
      { label: `${report.selectedYear} YTD`, color: accent, values: report.rows.map((row) => row.injuriesYtd) },
    ]);
    drawPareto(
      48,
      326,
      360,
      190,
      "Plants - Pareto Days Lost YTD",
      report.rows.map((row) => ({ label: row.plantCode.toUpperCase(), value: row.lostDaysYtd })),
    );
    drawBarChart(432, 326, 360, 190, "Plants - Days Lost", report.rows.map((row) => row.plantCode.toUpperCase()), [
      { label: "2025", color: blue, values: report.rows.map((row) => row.lostDays2025Ytd) },
      { label: `${report.selectedYear} YTD`, color: accent, values: report.rows.map((row) => row.lostDaysYtd) },
    ]);
    footer("06");

    addPage("landscape");
    header("Historical Comparison", `${report.selectedYear} YTD`);
    const years = report.series.yearlyComparison.map((row) => row.yearLabel);
    drawLineChart(48, 112, 360, 190, "Division - Gravity Rate and Frequency Rate comparison", years, [
      { label: "Gravity Rate", color: brand, values: report.series.yearlyComparison.map((row) => row.gravityRate) },
      { label: "Frequency Rate", color: accent, values: report.series.yearlyComparison.map((row) => row.frequencyRate) },
    ]);
    drawBarChart(432, 112, 360, 190, "Division - Injuries and Days Lost comparison", years, [
      { label: "Injuries", color: accent, values: report.series.yearlyComparison.map((row) => row.injuries) },
      { label: "Days Lost", color: blue, values: report.series.yearlyComparison.map((row) => row.lostDays) },
    ]);
    drawBarChart(48, 326, 360, 190, "Division - Injuries vs Working Hours", years, [
      { label: "N Hours/Inc", color: brand, values: report.series.yearlyComparison.map((row) => row.hoursPerInjury) },
      { label: "Injuries", color: accent, values: report.series.yearlyComparison.map((row) => row.injuries) },
    ]);
    metricCard(432, 326, 170, "MA Division Hours YTD", formatNumber(report.division.hoursYtd), "Worked hours", "#E8F2FC");
    metricCard(622, 326, 170, "MA Division FR YTD", formatRate(report.division.frequencyRateYtd), "Frequency Rate", "#FEE2E2");
    footer("07");

    doc.end();
  });
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

  async generateCorporatePeriodReport(input: {
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
    plantId?: string;
    recipients?: string[];
  }) {
    const selectedYear = input.periodEnd.getUTCFullYear();
    const selectedMonth = input.periodEnd.getUTCMonth() + 1;
    const historyEndYear = Math.max(selectedYear, 2025);
    const plantFilter = input.plantId ? { plantId: input.plantId } : {};
    const [plants, historicalCommunications, historicalKpiInputs] = await prisma.$transaction([
      prisma.plant.findMany({
        where: input.plantId
          ? {
              id: input.plantId,
              isActive: true,
            }
          : {
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
      prisma.communication.findMany({
        where: {
          eventDatetime: {
            gte: monthStartUtc(2022, 1),
            lte: monthEndUtc(historyEndYear, 12),
          },
          status: {
            in: KPI_STATUSES,
          },
          ...plantFilter,
        },
        select: {
          plantId: true,
          type: true,
          lostDays: true,
          eventDatetime: true,
        },
      }),
      prisma.safetyKpiMonthlyInput.findMany({
        where: {
          year: {
            gte: 2022,
            lte: historyEndYear,
          },
          ...plantFilter,
        },
        select: {
          plantId: true,
          year: true,
          month: true,
          hoursWorked: true,
        },
      }),
    ]);

    if (input.plantId && plants.length === 0) {
      throw new Error("Selected plant was not found.");
    }

    const selectedPlant = input.plantId ? plants[0] : null;
    const reportScope = selectedPlant ? "FACTORY" : "GLOBAL";
    const plantLabel = selectedPlant ? `${selectedPlant.name} (${selectedPlant.code.toUpperCase()})` : null;
    const scopeLabel = plantLabel ? `Factory: ${plantLabel}` : "Global";
    const safetyReport = buildCorporateSafetyReportData({
      plants,
      communications: historicalCommunications,
      kpiInputs: historicalKpiInputs.map((entry) => ({
        plantId: entry.plantId,
        year: entry.year,
        month: entry.month,
        hoursWorked: Number(entry.hoursWorked),
      })),
      selectedYear,
      selectedMonth,
      scopeLabel,
    });

    const title = `${input.reportType} - ${plantLabel ?? "Global"} (${format(input.periodStart, "yyyy-MM-dd")} to ${format(input.periodEnd, "yyyy-MM-dd")})`;
    const pdf = await pdfBufferFromCorporateSafetyReport(safetyReport);

    const storage = buildReportStorageKeys({
      scope: selectedPlant ? `corporate-${selectedPlant.code.toLowerCase()}` : "corporate",
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    await StorageService.uploadObject({
      key: storage.pdfKey,
      contentType: "application/pdf",
      body: pdf,
    });

    await prisma.$transaction(async (tx) => {
      const recordCode = await RecordCodeService.allocateReportCode(tx, {
        reportType: input.reportType,
        codigoFabrica: selectedPlant?.code ?? "GLOBAL",
        periodStart: input.periodStart,
      });

      await tx.reportRun.create({
        data: {
          plantId: selectedPlant?.id ?? null,
          type: input.reportType,
          codigoCompleto: recordCode.codigoCompleto,
          codigoAbreviado: recordCode.codigoAbreviado,
          tipo: recordCode.tipo,
          codigoFabrica: recordCode.codigoFabrica,
          ano: recordCode.ano,
          numeroSequencial: recordCode.numeroSequencial,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          fileKeys: {
            pdfKey: storage.pdfKey,
            pdfFileName: storage.files.pdf,
            scope: reportScope,
            scopeLabel,
            plantCode: selectedPlant?.code ?? null,
            plantName: selectedPlant?.name ?? null,
          },
          recipients: input.recipients ?? [],
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    });

    return {
      title,
      files: storage.files,
      storageKeys: {
        pdfKey: storage.pdfKey,
      },
      meta: {
        reportType: input.reportType,
        scope: reportScope,
        plantId: selectedPlant?.id ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      pdf,
    };
  },

  async getCorporateReportAudience(input?: { plantId?: string }) {
    const [corporateRecipients, roleRecipients] = await prisma.$transaction([
      prisma.reportRecipient.findMany({
        where: {
          list: {
            scope: input?.plantId ? "PLANT" : "CORPORATE",
            plantId: input?.plantId,
          },
          isActive: true,
        },
        select: {
          email: true,
        },
      }),
      prisma.userPlantRole.findMany({
        where: {
          role: {
            code: {
              in: [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            },
          },
          ...(input?.plantId ? { plantId: input.plantId } : {}),
          user: {
            isActive: true,
            email: {
              not: null,
            },
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      emails: Array.from(
        new Set([
          ...corporateRecipients.map((recipient) => recipient.email),
          ...roleRecipients.map((recipient) => recipient.user.email).filter((email): email is string => Boolean(email)),
        ]),
      ),
      userIds: Array.from(new Set(roleRecipients.map((recipient) => recipient.userId))),
    };
  },

  async generateAndShareCorporatePeriodReport(input: {
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
    plantId?: string;
    notificationTitle: string;
    notificationBody: string;
  }) {
    const audience = await this.getCorporateReportAudience({ plantId: input.plantId });
    const report = await this.generateCorporatePeriodReport({
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      plantId: input.plantId,
      recipients: audience.emails,
    });

    await NotificationService.notify({
      title: input.notificationTitle,
      body: input.notificationBody,
      emailTo: audience.emails,
      userIds: audience.userIds,
      attachments: [
        {
          filename: report.files.pdf,
          content: report.pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return report;
  },
};
