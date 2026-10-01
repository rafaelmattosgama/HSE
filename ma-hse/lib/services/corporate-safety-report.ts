import { CommunicationStatus, CommunicationType } from "@prisma/client";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { isCommunicationLinkableStatus, isDashboardPyramidCommunicationStatus } from "@/lib/communication-status";
import { buildPlantReportRankings, type PlantRanking } from "@/lib/plant-report-rankings";

const ONE_MILLION = 1_000_000;

export const CORPORATE_COMMUNICATION_TYPES = [
  { type: CommunicationType.ACCIDENT, label: "Injuries" },
  { type: CommunicationType.NEAR_MISS, label: "Near misses" },
  { type: CommunicationType.FIRST_AID, label: "First aids" },
  { type: CommunicationType.UNSAFE_ACT, label: "Unsafe acts" },
  { type: CommunicationType.UNSAFE_CONDITION, label: "Unsafe conditions" },
  { type: CommunicationType.FIVE_S_IMPROVEMENT, label: "5S improvements" },
  { type: CommunicationType.IMPROVEMENT_SUGGESTION, label: "Improvement suggestions" },
] as const;

type ReportCommunication = {
  plantId: string; type: CommunicationType; status: CommunicationStatus;
  lostDays: number | null; eventDatetime: Date; reportedAt: Date;
  actions: Array<{ status: string }>;
};

type CommunicationMetrics = {
  reported: Record<CommunicationType, number>;
  firstAids: number;
  firstAidRate: number | null;
  unsafeActsClosedPercent: number | null;
  unsafeConditionsClosedPercent: number | null;
  closed: number;
  valid: number;
  closedPercent: number | null;
};

function communicationMetrics(communications: ReportCommunication[], hours: number, start: Date, end: Date): CommunicationMetrics {
  const valid = communications.filter(entry => isCommunicationLinkableStatus(entry.status) && entry.eventDatetime >= start && entry.eventDatetime <= end);
  const reported = Object.fromEntries(CORPORATE_COMMUNICATION_TYPES.map(({ type }) => [type, 0])) as Record<CommunicationType, number>;
  for (const entry of communications) {
    if (isDashboardPyramidCommunicationStatus(entry.status) && entry.reportedAt >= start && entry.reportedAt <= end) reported[entry.type] += 1;
  }
  const firstAids = valid.filter(entry => entry.type === CommunicationType.FIRST_AID).length;
  const closed = valid.filter(entry => entry.status === CommunicationStatus.CLOSED).length;
  const closureRate = (type: CommunicationType) => {
    const entries = valid.filter(entry => entry.type === type);
    return entries.length ? entries.filter(entry => entry.status === CommunicationStatus.CLOSED).length / entries.length * 100 : null;
  };
  return {
    reported, firstAids, closed, valid: valid.length,
    closedPercent: valid.length ? closed / valid.length * 100 : null,
    firstAidRate: hours > 0 ? firstAids / hours * ONE_MILLION : null,
    unsafeActsClosedPercent: closureRate(CommunicationType.UNSAFE_ACT),
    unsafeConditionsClosedPercent: closureRate(CommunicationType.UNSAFE_CONDITION),
  };
}

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
  communicationsYtd: CommunicationMetrics;
  communicationsMonth: CommunicationMetrics;
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
  plant: { id: string; code: string; name: string } | null;
  plantRankings: ReturnType<typeof buildPlantReportRankings> | null;
  plants: Array<{ id: string; code: string; name: string; country: string; location: string }>;
  rows: CorporateSafetyPlantRow[];
  division: CorporateSafetyPlantRow;
  series: CorporateSafetySeries;
  budgetAvailable: boolean;
  operational: {
    openActions: number;
    closedOnTimePercent: number | null;
    pendingValidations: number;
    openCommunications: number;
  };
};

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

function nullableRate(value: number | null) {
  return value === null ? "N/A" : formatRate(value);
}

function percent(value: number | null) {
  return value === null ? "N/A" : `${formatNumber(value, 1)}%`;
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
    communicationsYtd: communicationMetrics([], 0, new Date(0), new Date(0)),
    communicationsMonth: communicationMetrics([], 0, new Date(0), new Date(0)),
  };
}

export function buildCorporateSafetyReportData(input: {
  plants: Array<{ id: string; code: string; name: string }>;
  communications: ReportCommunication[];
  kpiInputs: Array<{ plantId: string; year: number; month: number; hoursWorked: number }>;
  selectedYear: number;
  selectedMonth: number;
  scopeLabel: string;
  selectedPlantId?: string;
  plantRankings?: ReturnType<typeof buildPlantReportRankings>;
  actions?: Array<{ plantId: string; status: string; createdAt: Date; closedAt: Date | null; dueDate: Date }>;
  communicationStatusCounts?: Array<{ plantId: string; status: CommunicationStatus; count: number }>;
}): CorporateSafetyReportData {
  const selectedPlant = input.selectedPlantId ? input.plants.find(plant => plant.id === input.selectedPlantId) : null;
  if (input.selectedPlantId && !selectedPlant) throw new Error("Selected report plant was not found.");
  if (selectedPlant && input.plantRankings && input.plantRankings.plantId !== selectedPlant.id) throw new Error("Ranking data does not belong to the selected plant.");
  const reportPlants = (selectedPlant ? [selectedPlant] : input.plants).map((plant) => ({
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
  const plantIds = new Set(reportPlants.map(plant => plant.id));
  // All division totals use exactly the same active plants as the table.
  const communications = input.communications.filter(entry => plantIds.has(entry.plantId));
  const validCommunications = communications.filter(entry => isCommunicationLinkableStatus(entry.status));
  const kpiInputs = input.kpiInputs.filter(entry => plantIds.has(entry.plantId));
  const actions = (input.actions ?? []).filter(entry => plantIds.has(entry.plantId) && entry.createdAt >= ytdStart && entry.createdAt <= ytdEnd);
  const closedActions = actions.filter(entry => entry.status === "CLOSED" && entry.closedAt);
  const statusCounts = (input.communicationStatusCounts ?? communications.map(entry => ({ ...entry, count: 1 }))).filter(entry => plantIds.has(entry.plantId));
  const sumStatuses = (statuses: string[]) => statusCounts.filter(entry => statuses.includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0);

  const rows = reportPlants.map((plant) => {
    const row = createEmptySafetyRow(plant);
    const plantInputsYtd = kpiInputs.filter(
      (entry) => entry.plantId === plant.id && entry.year === input.selectedYear && entry.month <= input.selectedMonth,
    );
    const plantInputsMonth = kpiInputs.filter(
      (entry) => entry.plantId === plant.id && entry.year === input.selectedYear && entry.month === input.selectedMonth,
    );
    const communicationsYtd = validCommunications.filter(
      (entry) => entry.plantId === plant.id && entry.eventDatetime >= ytdStart && entry.eventDatetime <= ytdEnd,
    );
    const communicationsMonth = validCommunications.filter(
      (entry) => entry.plantId === plant.id && entry.eventDatetime >= monthStart && entry.eventDatetime <= monthEnd,
    );
    const communications2025Ytd = validCommunications.filter(
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
    const plantCommunications = communications.filter(entry => entry.plantId === plant.id);
    row.communicationsYtd = communicationMetrics(plantCommunications, hoursYtd, ytdStart, ytdEnd);
    row.communicationsMonth = communicationMetrics(plantCommunications, hoursMonth, monthStart, monthEnd);
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
  const monthHours = kpiInputs
    .filter((entry) => entry.year === input.selectedYear && entry.month === input.selectedMonth)
    .reduce((sum, entry) => sum + entry.hoursWorked, 0);
  division.frequencyRateYtd = safeRate(division.injuriesYtd, division.hoursYtd);
  division.gravityRateYtd = safeRate(division.lostDaysYtd, division.hoursYtd);
  division.frequencyRateMonth = safeRate(division.injuriesMonth, monthHours);
  division.gravityRateMonth = safeRate(division.lostDaysMonth, monthHours);
  division.communicationsYtd = communicationMetrics(communications, division.hoursYtd, ytdStart, ytdEnd);
  division.communicationsMonth = communicationMetrics(communications, monthHours, monthStart, monthEnd);

  const months = Array.from({ length: input.selectedMonth }, (_, index) => index + 1);
  const monthlyMetric = (year: number, month: number) => {
    const start = monthStartUtc(year, month);
    const end = monthEndUtc(year, month);
    const monthComms = validCommunications.filter((entry) => entry.eventDatetime >= start && entry.eventDatetime <= end);
    const injuries = monthComms.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const lostDays = monthComms.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = kpiInputs
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
    const rowsForPeriod = validCommunications.filter((entry) => entry.eventDatetime >= start && entry.eventDatetime <= end);
    const injuries = rowsForPeriod.filter((entry) => entry.type === CommunicationType.ACCIDENT).length;
    const lostDays = rowsForPeriod.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = kpiInputs
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
    plant: selectedPlant ?? null,
    plantRankings: selectedPlant ? input.plantRankings ?? buildPlantReportRankings({ communications: [], analyses: [], employees: [] }, selectedPlant.id, ytdStart, ytdEnd) : null,
    plants: reportPlants,
    rows,
    division,
    budgetAvailable: false,
    operational: {
      openActions: actions.filter(entry => entry.status === "OPEN" || entry.status === "ONGOING").length,
      closedOnTimePercent: closedActions.length ? closedActions.filter(entry => entry.closedAt! <= entry.dueDate).length / closedActions.length * 100 : null,
      pendingValidations: sumStatuses([CommunicationStatus.SUBMITTED, CommunicationStatus.PENDING_VALIDATION]),
      openCommunications: sumStatuses([CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING]),
    },
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

export function pdfBufferFromCorporateSafetyReport(report: CorporateSafetyReportData) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = createPdfDocument({ margin: 0, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ink = "#0F172A";
    const muted = "#64748B";
    const line = "#E2E8F0";
    const brand = "#0B4A7A";
    const accent = "#D10014";
    const blue = "#4F83BD";
    const card = "#FFFFFF";
    const bg = "#F6F8FB";
    const scopeText = report.plant ? `${report.plant.name} (${report.plant.code.toUpperCase()})` : `${report.plants.length} plants in scope`;
    const entity = report.plant ? "Plant" : "Division";

    let firstPage = true;
    const addPage = (layout: "portrait" | "landscape" = "portrait", size: "A4" | "A3" = "A4") => {
      if (firstPage) {
        firstPage = false;
      } else {
        doc.addPage({ margin: 0, size, layout });
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
    const metricCard = (x: number, y: number, w: number, label: string, value: string, note: string, tone = "#E8F2FC") => {
      doc.roundedRect(x, y, w, 86, 16).fillAndStroke(card, line);
      doc.save().roundedRect(x, y, w, 86, 16).clip();
      doc.circle(x + w - 14, y + 84, 38).fill(tone);
      doc.restore();
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x + 12, y + 13, { width: w - 24 });
      let valueSize = 24;
      doc.fontSize(valueSize);
      while (valueSize > 9 && doc.heightOfString(value, { width: w - 24 }) > 29) doc.fontSize(--valueSize);
      doc.fillColor(ink).text(value, x + 12, y + 31, { width: w - 24 });
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(note, x + 12, y + 64, { width: w - 24 });
    };
    const dashboardCard = (x: number, y: number, w: number, label: string, value: string, details: string, icon: "shield" | "clock" | "clipboard" | "inbox", informational = false) => {
      const tone = informational ? "#086F9E" : "#A14C0D";
      const wash = informational ? "#E1F1F9" : "#FCF1DF";
      const gradient = doc.linearGradient(x, y, x + w, y + 150).stop(0, "#FFFFFF").stop(0.5, wash).stop(1, "#FFFFFF");
      doc.lineWidth(0.7).roundedRect(x, y, w, 150, 12).fillAndStroke(gradient, "#C9D6E8");
      doc.fillColor(tone).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), x + 13, y + 15, { width: w - 87, lineGap: 2 });
      doc.circle(x + w - 57, y + 24, 8).fillAndStroke(card, "#C9D6E8");
      doc.fillColor(muted).fontSize(8).text("i", x + w - 60, y + 20, { width: 6, align: "center" });
      const ix = x + w - 35, iy = y + 17;
      doc.roundedRect(ix - 7, iy - 7, 28, 28, 8).fill(informational ? "#D8EDF7" : "#F4E5D5");
      doc.strokeColor(tone).lineWidth(1.1);
      if (icon === "shield") {
        doc.moveTo(ix, iy).lineTo(ix + 7, iy - 2).lineTo(ix + 14, iy).lineTo(ix + 13, iy + 9).lineTo(ix + 7, iy + 14).lineTo(ix + 1, iy + 9).closePath().stroke();
        doc.moveTo(ix + 4, iy + 6).lineTo(ix + 6, iy + 8).lineTo(ix + 10, iy + 4).stroke();
      } else if (icon === "clock") {
        doc.circle(ix + 7, iy + 6, 7).stroke();
        doc.moveTo(ix + 7, iy + 1).lineTo(ix + 7, iy + 6).lineTo(ix + 11, iy + 6).stroke();
      } else if (icon === "clipboard") {
        doc.roundedRect(ix + 1, iy, 12, 14, 2).stroke();
        doc.roundedRect(ix + 4, iy - 2, 6, 4, 1).fillAndStroke(wash, tone);
        doc.moveTo(ix + 4, iy + 8).lineTo(ix + 6, iy + 10).lineTo(ix + 10, iy + 6).stroke();
      } else {
        doc.moveTo(ix, iy + 6).lineTo(ix + 3, iy).lineTo(ix + 11, iy).lineTo(ix + 14, iy + 6).lineTo(ix + 14, iy + 13).lineTo(ix, iy + 13).closePath().stroke();
        doc.moveTo(ix, iy + 6).lineTo(ix + 4, iy + 6).lineTo(ix + 5, iy + 9).lineTo(ix + 9, iy + 9).lineTo(ix + 10, iy + 6).lineTo(ix + 14, iy + 6).stroke();
      }
      doc.fillColor(tone).font("Helvetica-Bold").fontSize(27).text(value, x + 13, y + 58, { width: w - 26 });
      doc.fillColor("#334155").font("Helvetica").fontSize(8).text(details, x + 13, y + 101, { width: w - 26, lineGap: 2 });
    };
    const tablePages = (title: string, subtitle: string, weights: number[], headers: string[], rows: string[][], note = "", layout: "portrait" | "landscape" = "landscape", options: { size?: "A4" | "A3"; fontSize?: number; padding?: number; rowHeight?: number; groups?: Array<{ label: string; columns: number }> } = {}) => {
      const fontSize = options.fontSize ?? 8;
      const padding = options.padding ?? 7;
      let widths: number[] = [];
      let cursorY = 0;
      let bottom = 0;
      const textHeight = (cells: string[], bold: boolean) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
        return Math.max(options.rowHeight ?? 26, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - padding * 2 }) + padding * 2));
      };
      const paintRow = (cells: string[], height: number, heading: boolean, index: number) => {
        let x = 64;
        const total = cells[0] === report.division.plantName;
        doc.rect(x, cursorY, doc.page.width - 128, height).fillAndStroke(heading ? brand : total ? "#E8F2FC" : index % 2 ? "#F8FBFE" : card, line);
        cells.forEach((cell, i) => {
          doc.fillColor(heading ? card : ink).font(heading || total ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize)
            .text(cell, x + padding, cursorY + padding, { width: widths[i] - padding * 2 });
          x += widths[i];
        });
        cursorY += height;
      };
      const startPage = (continued: boolean) => {
        addPage(layout, options.size);
        header(title);
        widths = weights.map(weight => weight / weights.reduce((sum, value) => sum + value, 0) * (doc.page.width - 128));
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(18).text(`${title}${continued ? " (continued)" : ""}`, 64, 110, { width: doc.page.width - 128 });
        cursorY = doc.y + 8;
        doc.fillColor(muted).font("Helvetica").fontSize(9).text(subtitle, 64, cursorY, { width: doc.page.width - 128 });
        cursorY = doc.y + 14;
        doc.fontSize(8);
        const noteHeight = note ? doc.heightOfString(note, { width: doc.page.width - 128 }) : 0;
        bottom = doc.page.height - 62 - (note ? noteHeight + 12 : 0);
        if (note) doc.fillColor(muted).text(note, 64, bottom + 12, { width: doc.page.width - 128 });
        if (options.groups) {
          let column = 0;
          let groupX = 64;
          options.groups.forEach((group, i) => {
            const width = widths.slice(column, column + group.columns).reduce((sum, value) => sum + value, 0);
            doc.rect(groupX, cursorY, width, 23).fillAndStroke(i % 2 ? "#E8F2FC" : "#D8E8F4", card);
            doc.fillColor(brand).font("Helvetica-Bold").fontSize(9).text(group.label, groupX + 4, cursorY + 7, { width: width - 8, align: "center" });
            column += group.columns;
            groupX += width;
          });
          cursorY += 23;
        }
        paintRow(headers, textHeight(headers, true), true, 0);
      };
      startPage(false);
      rows.forEach((row, index) => {
        const height = textHeight(row, row[0] === report.division.plantName);
        if (cursorY + height > bottom) startPage(true);
        paintRow(row, height, false, index);
      });
    };
    type ChartSeries = { label: string; color: string; values: number[] };
    const maxOf = (values: number[]) => Math.max(1, ...values.filter(Number.isFinite));
    const compact = (value: number) => value >= 1_000_000 ? `${formatNumber(value / 1_000_000, 1)}m` : value >= 10_000 ? `${formatNumber(value / 1_000, 1)}k` : formatNumber(value, value > 0 && value < 10 ? 1 : 0);
    const chartFrame = (x: number, y: number, w: number, h: number, title: string, categories: string[], series: ChartSeries[], max: number) => {
      doc.lineWidth(0.7).roundedRect(x, y, w, h, 16).fillAndStroke(card, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(title, x + 16, y + 14, { width: w - 32 });
      let legendY = doc.y + 8;
      let legendX = x + 16;
      doc.font("Helvetica").fontSize(8);
      series.forEach(entry => {
        const width = doc.widthOfString(entry.label) + 26;
        if (legendX + width > x + w - 16) { legendX = x + 16; legendY += 16; }
        doc.roundedRect(legendX, legendY + 1, 7, 7, 2).fill(entry.color);
        doc.fillColor(muted).text(entry.label, legendX + 11, legendY, { lineBreak: false });
        legendX += width;
      });
      const plotX = x + 50;
      const plotW = w - 70;
      const groupW = plotW / Math.max(1, categories.length);
      doc.font("Helvetica-Bold").fontSize(7);
      const labelHeight = Math.max(9, ...categories.map(label => doc.heightOfString(label, { width: groupW - 4 })));
      const plotY = legendY + 28;
      const plotH = h - (plotY - y) - labelHeight - 26;
      for (let step = 0; step <= 4; step++) {
        const lineY = plotY + plotH * (1 - step / 4);
        doc.moveTo(plotX, lineY).lineTo(plotX + plotW, lineY).strokeColor(line).lineWidth(0.5).stroke();
        doc.fillColor(muted).font("Helvetica").fontSize(7).text(compact(max * step / 4), x + 6, lineY - 3, { width: 37, align: "right", lineBreak: false });
      }
      categories.forEach((label, i) => {
        doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(label, plotX + i * groupW + 2, plotY + plotH + 10, { width: groupW - 4, align: "center" });
      });
      return { plotX, plotY, plotW, plotH, groupW };
    };
    const drawBarChart = (x: number, y: number, w: number, h: number, title: string, categories: string[], series: ChartSeries[], decimals = 0, cumulative?: number[]) => {
      const max = maxOf(series.flatMap(entry => entry.values)) * 1.12;
      const legends = cumulative ? [...series, { label: "Cumulative % (0-100)", color: brand, values: [] }] : series;
      const { plotX, plotY, plotH, groupW } = chartFrame(x, y, w, h, title, categories, legends, max);
      const barW = Math.min(18, groupW * 0.72 / Math.max(1, series.length));
      categories.forEach((_, i) => {
        series.forEach((entry, j) => {
          const value = entry.values[i] ?? 0;
          const barH = value / max * plotH;
          const bx = plotX + (i + 0.5) * groupW + (j - series.length / 2) * barW;
          if (value > 0) doc.rect(bx, plotY + plotH - barH, barW - 1, barH).fill(entry.color);
          const label = formatNumber(value, decimals);
          doc.font("Helvetica-Bold").fontSize(7);
          const labelWidth = groupW * 0.9 / series.length;
          if (doc.widthOfString(label) <= labelWidth - 2 && !cumulative) {
            doc.fillColor(entry.color).text(label, plotX + (i + 0.5) * groupW + (j - series.length / 2) * labelWidth, plotY + plotH - barH - 11, { width: labelWidth - 2, align: "center" });
          }
        });
      });
      if (cumulative) {
        cumulative.forEach((value, i) => {
          const px = plotX + (i + 0.5) * groupW;
          const py = plotY + plotH * (1 - value / 100);
          if (i > 0) doc.moveTo(px - groupW, plotY + plotH * (1 - cumulative[i - 1] / 100)).lineTo(px, py).strokeColor(brand).lineWidth(1.5).stroke();
          doc.circle(px, py, 2).fill(brand);
        });
      }
    };
    const drawLineChart = (x: number, y: number, w: number, h: number, title: string, categories: string[], series: ChartSeries[]) => {
      const max = maxOf(series.flatMap(entry => entry.values)) * 1.12;
      const { plotX, plotY, plotH, groupW } = chartFrame(x, y, w, h, title, categories, series, max);
      series.forEach(entry => {
        entry.values.forEach((value, i) => {
          const px = plotX + (i + 0.5) * groupW;
          const py = plotY + plotH * (1 - value / max);
          if (i > 0) doc.moveTo(px - groupW, plotY + plotH * (1 - entry.values[i - 1] / max)).lineTo(px, py).strokeColor(entry.color).lineWidth(1.5).stroke();
          doc.circle(px, py, 2).fill(entry.color);
        });
      });
    };

    const fittedLabel = (label: string, x: number, y: number, width: number, height: number) => {
      let size = 9;
      doc.font("Helvetica").fontSize(size);
      while (size > 6 && doc.heightOfString(label, { width }) > height) doc.fontSize(size -= 0.5);
      doc.fillColor(ink).text(label, x, y, { width });
    };
    const paretoCard = (x: number, y: number, w: number, ranking: PlantRanking) => {
      doc.lineWidth(0.7).roundedRect(x, y, w, 292, 14).fillAndStroke(card, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(ranking.title, x + 16, y + 15, { width: w - 32 });
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(`Base: ${formatNumber(ranking.total)}`, x + 16, y + 37, { width: 130 });
      doc.fillColor(brand).text("Bars: count", x + 165, y + 37, { width: 85 });
      doc.fillColor(accent).text("Line: cumulative % of base", x + 260, y + 37, { width: w - 276 });
      if (!ranking.entries.length) {
        doc.fillColor(muted).fontSize(11).text("No classified records for this period.", x + 16, y + 93, { width: w - 32 });
        return;
      }
      const px = x + 42, py = y + 66, pw = w - 84, ph = 88;
      const max = maxOf(ranking.entries.map(entry => entry.count));
      const group = pw / ranking.entries.length;
      for (let step = 0; step <= 2; step++) {
        const ly = py + ph * (1 - step / 2);
        doc.moveTo(px, ly).lineTo(px + pw, ly).strokeColor(line).lineWidth(0.5).stroke();
        doc.fillColor(muted).font("Helvetica").fontSize(7).text(formatNumber(max * step / 2, max % 2 && step === 1 ? 1 : 0), x + 5, ly - 3, { width: 29, align: "right" });
        doc.text(`${step * 50}%`, px + pw + 5, ly - 3, { width: 33 });
      }
      let cumulative = 0;
      const points = ranking.entries.map((entry, i) => {
        const bx = px + (i + 0.5) * group;
        const bh = entry.count / max * ph;
        doc.rect(bx - 14, py + ph - bh, 28, bh).fill(brand);
        doc.fillColor(muted).fontSize(8).text(String(i + 1), bx - 12, py + ph + 9, { width: 24, align: "center" });
        cumulative += entry.percentage;
        return { x: bx, y: py + ph * (1 - cumulative / 100) };
      });
      points.forEach((point, i) => {
        if (i) doc.moveTo(points[i - 1].x, points[i - 1].y).lineTo(point.x, point.y).lineWidth(1.5).strokeColor(accent).stroke();
        doc.circle(point.x, point.y, 2.5).fill(accent);
      });
      ranking.entries.forEach((entry, i) => {
        fittedLabel(`${i + 1}. ${entry.label}`, x + 16, y + 185 + i * 19, w - 148, 18);
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(8).text(`${formatNumber(entry.count)} | ${formatNumber(entry.percentage, 1)}%`, x + w - 122, y + 187 + i * 19, { width: 106, align: "right" });
      });
    };
    const rankingCard = (x: number, y: number, w: number, ranking: PlantRanking) => {
      doc.lineWidth(0.7).roundedRect(x, y, w, 190, 14).fillAndStroke(card, line);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(ranking.title, x + 16, y + 14, { width: w - 32 });
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(`Top 5 | Base: ${formatNumber(ranking.total)} | Count and share`, x + 16, y + 35, { width: w - 32 });
      if (!ranking.entries.length) {
        doc.fontSize(10).text("No classified records for this period.", x + 16, y + 77, { width: w - 32 });
        return;
      }
      ranking.entries.forEach((entry, i) => {
        const ry = y + 58 + i * 25;
        fittedLabel(entry.label, x + 16, ry, w - 132, 18);
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(9).text(`${formatNumber(entry.count)} | ${formatNumber(entry.percentage, 1)}%`, x + w - 112, ry + 1, { width: 96, align: "right" });
        doc.roundedRect(x + 16, ry + 20, w - 32, 4, 2).fill("#EAF0FF");
        if (entry.percentage > 0) doc.roundedRect(x + 16, ry + 20, Math.max(2, (w - 32) * entry.percentage / 100), 4, 2).fill("#082C6B");
      });
    };

    addPage();
    header("Safety Performance");
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(10).text(report.selectedMonthName.toUpperCase(), 64, 168);
    doc.fillColor(ink).fontSize(38).text("Key Performance Indicators", 64, 198, { width: 420 });
    doc.fillColor(muted).font("Helvetica").fontSize(16).text("Manufacturing", 64, 292);
    doc.roundedRect(64, 342, 210, 142, 22).fill(brand);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text("Sections", 86, 368);
    (report.plant ? ["Safety performance", "Communications & closure", "Top 5 & participation", "Historical comparison"] : ["Safety performance", "Communications & closure", "Trends & comparisons"]).forEach((item, index) => {
      doc.fillColor("#D5E9FF").font("Helvetica").fontSize(11).text(item, 88, 400 + index * 20);
    });
    metricCard(308, 342, 190, "Report Scope", report.scopeLabel, "Generated in English", "#E8F2FC");
    metricCard(308, 446, 190, "Plants included", String(report.plants.length), "Active plants in scope", "#DCFCE7");

    addPage();
    header("Safety");
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(44).text("Safety", 64, 245, { width: 420 });
    doc.fillColor(ink).fontSize(20).text(`Key Performance Indicators ${report.selectedYear}`, 64, 305, { width: 420 });
    doc.fillColor(muted).font("Helvetica").fontSize(15).text("Manufacturing", 64, 338);

    const allRows = report.plant ? report.rows : [...report.rows, report.division];
    const ytd = report.division.communicationsYtd;
    const month = report.division.communicationsMonth;
    const periodLabel = `${report.selectedYear}-01-01 - ${monthEndUtc(report.selectedYear, report.selectedMonth).toISOString().slice(0, 10)}`;
    tablePages("Safety KPI Progressive YTD", `${report.selectedMonthName} | All safety indicators by plant | Validated events by event date`,
      [150, 45, 85, 58, 60, 67, 67, 67, 58, 60, 67, 67, 67, 60, 67, 67],
      ["Plant", "Country", "Worked hours", "Injuries", "Days lost", "Gravity rate", "Frequency rate", "First-aid rate", "Injuries", "Days lost", "Gravity rate", "Frequency rate", "First-aid rate", "Injuries", "Gravity rate", "Frequency rate"],
      allRows.map(row => [row.plantName, row.country, formatNumber(row.hoursYtd), formatNumber(row.injuriesYtd), formatNumber(row.lostDaysYtd), formatRate(row.gravityRateYtd), formatRate(row.frequencyRateYtd), nullableRate(row.communicationsYtd.firstAidRate), formatNumber(row.injuriesMonth), formatNumber(row.lostDaysMonth), formatRate(row.gravityRateMonth), formatRate(row.frequencyRateMonth), nullableRate(row.communicationsMonth.firstAidRate), formatNumber(row.injuriesBudget), formatRate(row.gravityRateBudget), formatRate(row.frequencyRateBudget)]),
      "Rates per 1,000,000 worked hours. First-aid rates: N/A = no worked hours recorded. Budget indicators are 0 when no budget data is available.",
      "landscape", { size: "A3", padding: 5, rowHeight: 23, groups: [{ label: "Plant", columns: 2 }, { label: `${report.selectedYear} YTD`, columns: 6 }, { label: report.selectedMonthName, columns: 5 }, { label: `Budget ${report.selectedYear}`, columns: 3 }] });

    addPage("landscape");
    header("Reported Communications");
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(21).text("Reported Communications", 64, 112, { width: 714 });
    doc.fillColor(muted).font("Helvetica").fontSize(10).text(`${scopeText} | January - ${report.selectedMonthName} | By submission date`, 64, 142, { width: 714 });
    doc.roundedRect(64, 175, 450, 339, 14).fillAndStroke(card, line);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text("Safety communication pyramid", 82, 191, { width: 300 });
    doc.fillColor(muted).fontSize(8).text("YTD", 384, 222, { width: 48, align: "right" });
    doc.text("MONTH", 444, 222, { width: 48, align: "right" });
    const pyramid = [
      { type: CommunicationType.ACCIDENT, label: "Injuries", color: "#F6C9C9" },
      { type: CommunicationType.FIRST_AID, label: "First aids", color: "#FADBB9" },
      { type: CommunicationType.NEAR_MISS, label: "Near misses", color: "#F9E9AA" },
      { type: CommunicationType.UNSAFE_CONDITION, label: "Unsafe conditions", color: "#C7E3CF" },
      { type: CommunicationType.UNSAFE_ACT, label: "Unsafe acts", color: "#AFDCD8" },
    ];
    pyramid.forEach((level, i) => {
      const top = 244 + i * 46, center = 224, topWidth = 118 + i * 33, bottomWidth = topWidth + 29;
      doc.moveTo(center - topWidth / 2, top).lineTo(center + topWidth / 2, top).lineTo(center + bottomWidth / 2, top + 40).lineTo(center - bottomWidth / 2, top + 40).closePath().fill(level.color);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(level.label, center - topWidth / 2 + 3, top + 15, { width: topWidth - 6, align: "center" });
      doc.fontSize(15).text(formatNumber(ytd.reported[level.type]), 384, top + 12, { width: 48, align: "right" });
      doc.fillColor(muted).fontSize(12).text(formatNumber(month.reported[level.type]), 444, top + 14, { width: 48, align: "right" });
    });
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("Hierarchy of event types; band size is not proportional to volume.", 82, 488, { width: 414 });
    const totalReported = (metrics: CommunicationMetrics) => Object.values(metrics.reported).reduce((sum, value) => sum + value, 0);
    dashboardCard(532, 175, 246, "Reported communications", formatNumber(totalReported(ytd)), `YTD total | Month: ${formatNumber(totalReported(month))}\nAll communication types`, "inbox", true);
    doc.roundedRect(532, 341, 246, 173, 14).fillAndStroke("#F7FAFD", line);
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(12).text("Improvement communications", 547, 357, { width: 216 });
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("Shown separately from the safety hierarchy", 547, 377, { width: 216 });
    for (const [i, type, label] of [[0, CommunicationType.FIVE_S_IMPROVEMENT, "5S improvements"], [1, CommunicationType.IMPROVEMENT_SUGGESTION, "Improvement suggestions"]] as const) {
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(label, 547, 402 + i * 49, { width: 216 });
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(`YTD: ${formatNumber(ytd.reported[type])}    Month: ${formatNumber(month.reported[type])}`, 547, 419 + i * 49, { width: 216 });
    }
    doc.fillColor(muted).fontSize(8).text("Includes submitted, pending validation and validated records; excludes rejected and invalid records. Injuries includes all accident severities.", 64, 527, { width: 714 });

    if (!report.plant) tablePages("Reported Communications by Plant", `${report.selectedMonthName} | Each cell shows YTD / Month | By submission date`,
      [122, 43, 43, 43, 43, 43, 43, 56, 49],
      ["Plant", "Injuries", "Near misses", "First aids", "Unsafe acts", "Unsafe cond.", "5S impr.", "Suggestions", "Total"],
      allRows.map(row => [row.plantName, ...CORPORATE_COMMUNICATION_TYPES.map(({ type }) => `${formatNumber(row.communicationsYtd.reported[type])} / ${formatNumber(row.communicationsMonth.reported[type])}`), `${formatNumber(totalReported(row.communicationsYtd))} / ${formatNumber(totalReported(row.communicationsMonth))}`]),
      "YTD / Month. Cond. = conditions; impr. = improvements. Includes pending validation; excludes rejected and invalid records.", "portrait", { fontSize: 7, padding: 4, rowHeight: 22 });

    addPage("landscape");
    const closureTitle = report.plant ? "Plant Closure & Follow-up" : "Global Closure & Follow-up";
    header(closureTitle);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(21).text(closureTitle, 64, 110, { width: 714 });
    doc.fillColor(muted).font("Helvetica").fontSize(10).text(`${scopeText} | YTD: ${periodLabel}`, 64, 140, { width: 714 });
    const cards: Array<{ label: string; value: string; details: string; icon: "shield" | "clock" | "clipboard" | "inbox"; informational?: boolean }> = [
      { label: "% Communications closed", value: percent(ytd.closedPercent), details: `${ytd.closed} closed / ${ytd.valid} validated YTD\nMonth: ${percent(month.closedPercent)}`, icon: "shield" },
      { label: "% Unsafe acts closed", value: percent(ytd.unsafeActsClosedPercent), details: `YTD | Closed / validated unsafe acts\nMonth: ${percent(month.unsafeActsClosedPercent)}`, icon: "shield" },
      { label: "% Unsafe conditions closed", value: percent(ytd.unsafeConditionsClosedPercent), details: `YTD | Closed / validated conditions\nMonth: ${percent(month.unsafeConditionsClosedPercent)}`, icon: "shield" },
      { label: "Actions closed on time", value: percent(report.operational.closedOnTimePercent), details: "Actions created in the YTD period\nClosed by their due date", icon: "clock" },
      { label: "Open actions", value: formatNumber(report.operational.openActions), details: "Actions created in the YTD period\nOpen or ongoing now", icon: "clipboard" },
      { label: "Pending validations", value: formatNumber(report.operational.pendingValidations), details: "Current snapshot\nSubmitted or pending validation", icon: "clipboard" },
      { label: "Open communications", value: formatNumber(report.operational.openCommunications), details: "Current snapshot\nValidated open or ongoing", icon: "inbox", informational: true },
      { label: "Closed communications", value: formatNumber(ytd.closed), details: `Validated YTD events now CLOSED\nMonth: ${formatNumber(month.closed)}`, icon: "inbox", informational: true },
    ];
    cards.forEach((entry, i) => dashboardCard(64 + i % 4 * 181.5, 165 + Math.floor(i / 4) * 166, 169.5, entry.label, entry.value, entry.details, entry.icon, entry.informational));
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${report.plant ? "Plant" : "Global"} closure percentages = communications in CLOSED status / all validated communications of the same type and period, including records without actions. YTD and month use event dates. N/A = no applicable denominator. Statuses are current at generation; snapshot counts include all dates.`, 64, 495, { width: 714 });

    if (!report.plant) {
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

    // Wide charts keep plant codes readable; large scopes continue across pages.
    for (const [metric, field, reference] of [["Injuries", "injuriesYtd", "injuries2025Ytd"], ["Days Lost", "lostDaysYtd", "lostDays2025Ytd"]] as const) {
      const sorted = [...report.rows].sort((a, b) => b[field] - a[field] || a.plantCode.localeCompare(b.plantCode));
      const total = sorted.reduce((sum, row) => sum + row[field], 0);
      let cumulativeTotal = 0;
      const cumulative = sorted.map(row => { cumulativeTotal += row[field]; return total ? cumulativeTotal / total * 100 : 0; });
      for (let offset = 0; offset < Math.max(1, sorted.length); offset += 12) {
        const rows = sorted.slice(offset, offset + 12);
        const categories = rows.map(row => row.plantCode.toUpperCase());
        addPage("landscape");
        header(`Plants - ${metric}`, report.selectedMonthName);
        const suffix = sorted.length > 12 ? ` | Plants ${offset + 1}-${offset + rows.length} of ${sorted.length}` : "";
        drawBarChart(48, 112, 744, 190, `Plants - Pareto ${metric} YTD${suffix}`, categories,
          [{ label: `${report.selectedYear} YTD`, color: accent, values: rows.map(row => row[field]) }], 0, cumulative.slice(offset, offset + 12));
        drawBarChart(48, 326, 744, 190, `Plants - ${metric}${suffix}`, categories, [
          { label: "2025 YTD", color: blue, values: rows.map(row => row[reference]) },
          { label: `${report.selectedYear} YTD`, color: accent, values: rows.map(row => row[field]) },
        ]);
      }
    }
    }

    if (report.plantRankings) {
      addPage("landscape", "A3");
      header("Plant Top 5 - Pareto");
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(21).text("Plant Top 5 - Pareto", 64, 110, { width: doc.page.width - 128 });
      doc.fillColor(muted).font("Helvetica").fontSize(10).text(`${scopeText} | YTD: ${periodLabel}`, 64, 141, { width: doc.page.width - 128 });
      const w = (doc.page.width - 148) / 2;
      report.plantRankings.paretos.forEach((ranking, i) => paretoCard(64 + i % 2 * (w + 20), 168 + Math.floor(i / 2) * 305, w, ranking));
      doc.fillColor(muted).font("Helvetica").fontSize(8).text("Root causes: identified S-EWO root cause selections by analysis date. Type rankings: validated communications by event date, including unclassified records in the base. Cumulative shares use the full base, not only the Top 5.", 64, 778, { width: doc.page.width - 128 });

      addPage("landscape", "A3");
      header("Plant Communication Participation");
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(21).text("Plant Communication Participation", 64, 110, { width: doc.page.width - 128 });
      doc.fillColor(muted).font("Helvetica").fontSize(10).text(`${scopeText} | YTD: ${periodLabel} | Validated communications by event date`, 64, 141, { width: doc.page.width - 128 });
      report.plantRankings.people.forEach((ranking, i) => rankingCard(64 + i % 2 * (w + 20), 168 + Math.floor(i / 2) * 202, i === 4 ? doc.page.width - 128 : w, ranking));
      doc.fillColor(muted).font("Helvetica").fontSize(8).text("Dashboard basis: recorded involved worker, submitter employee number, employee department and workstation. Each chart uses its full classified base; missing fields are excluded. Percentages are not limited to the Top 5.", 64, 778, { width: doc.page.width - 128 });
    }

    addPage("landscape");
    header("Historical Comparison", `${report.selectedYear} YTD`);
    const years = report.series.yearlyComparison.map((row) => row.yearLabel);
    drawLineChart(48, 112, 360, 190, `${entity} - Gravity Rate and Frequency Rate comparison`, years, [
      { label: "Gravity Rate", color: brand, values: report.series.yearlyComparison.map((row) => row.gravityRate) },
      { label: "Frequency Rate", color: accent, values: report.series.yearlyComparison.map((row) => row.frequencyRate) },
    ]);
    drawBarChart(432, 112, 360, 190, `${entity} - Injuries and Days Lost comparison`, years, [
      { label: "Injuries", color: accent, values: report.series.yearlyComparison.map((row) => row.injuries) },
      { label: "Days Lost", color: blue, values: report.series.yearlyComparison.map((row) => row.lostDays) },
    ]);
    drawBarChart(48, 326, 360, 190, `${entity} - Injuries vs Working Hours`, years, [
      { label: "N Hours/Inc", color: brand, values: report.series.yearlyComparison.map((row) => row.hoursPerInjury) },
      { label: "Injuries", color: accent, values: report.series.yearlyComparison.map((row) => row.injuries) },
    ]);
    metricCard(432, 326, 170, report.plant ? "Plant Hours YTD" : "MA Division Hours YTD", formatNumber(report.division.hoursYtd), "Worked hours", "#E8F2FC");
    metricCard(622, 326, 170, report.plant ? "Plant FR YTD" : "MA Division FR YTD", formatRate(report.division.frequencyRateYtd), "Frequency Rate", "#FEE2E2");

    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      footer(String(page + 1).padStart(2, "0"));
    }
    doc.end();
  });
}

