import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import ExcelJS from "exceljs";
import { CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { differenceInCalendarDays, endOfMonth, format, max, min, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { KpiService } from "@/lib/services/kpi-service";
import { StorageService } from "@/lib/services/storage-service";

const KPI_STATUSES = [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED];
const INCLUDED_OPEN_COMMUNICATION_STATUSES = [
  CommunicationStatus.SUBMITTED,
  CommunicationStatus.PENDING_VALIDATION,
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];
const COMMUNICATION_TYPE_ORDER = [
  CommunicationType.UNSAFE_ACT,
  CommunicationType.UNSAFE_CONDITION,
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
  CommunicationType.ACCIDENT,
] as const;
const ONE_MILLION = 1_000_000;

type CorporatePlantMetrics = {
  plantId: string;
  plantCode: string;
  plantName: string;
  openedByType: Record<(typeof COMMUNICATION_TYPE_ORDER)[number], number>;
  totalOpenedCommunications: number;
  closedActionsPercent: number;
  accidentFrequencyRate: number;
  gravityRate: number;
  nearMissFrequencyRate: number;
  firstAidFrequencyRate: number;
  hoursWorked: number;
  accidents: number;
  nearMisses: number;
  firstAidCases: number;
  lostDays: number;
  totalActions: number;
  closedActions: number;
};

function pdfBufferFromText(lines: string[]) {
  return new Promise<Buffer>((resolve) => {
    const doc = createPdfDocument({ margin: 50 });
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

function createEmptyByTypeRecord() {
  return {
    UNSAFE_ACT: 0,
    UNSAFE_CONDITION: 0,
    NEAR_MISS: 0,
    FIRST_AID: 0,
    ACCIDENT: 0,
  } satisfies Record<(typeof COMMUNICATION_TYPE_ORDER)[number], number>;
}

function buildReportFileNames(input: { scope: "plant" | "corporate"; reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST"; periodStart: Date; periodEnd: Date }) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const baseName = `${input.scope}-${input.reportType.toLowerCase()}-${periodToken}`;

  return {
    pdf: `${baseName}.pdf`,
    xlsx: `${baseName}.xlsx`,
  };
}

function buildReportStorageKeys(input: {
  scope: "plant" | "corporate";
  reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
  periodStart: Date;
  periodEnd: Date;
}) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const basePath = `reports/${input.scope}/${input.reportType.toLowerCase()}/${periodToken}`;
  const files = buildReportFileNames(input);

  return {
    pdfKey: `${basePath}/${files.pdf}`,
    xlsxKey: `${basePath}/${files.xlsx}`,
    files,
  };
}

async function xlsxBufferFromCorporateSummary(summary: {
  title: string;
  metrics: CorporatePlantMetrics[];
  groupMetrics: CorporatePlantMetrics;
}) {
  const workbook = new ExcelJS.Workbook();

  const communicationsSheet = workbook.addWorksheet("Opened Communications");
  communicationsSheet.columns = [
    { header: "Plant", key: "plant", width: 28 },
    ...COMMUNICATION_TYPE_ORDER.map((type) => ({ header: type, key: type, width: 18 })),
    { header: "Total", key: "total", width: 14 },
  ];

  summary.metrics.forEach((metric) => {
    communicationsSheet.addRow({
      plant: `${metric.plantCode.toUpperCase()} - ${metric.plantName}`,
      ...metric.openedByType,
      total: metric.totalOpenedCommunications,
    });
  });
  communicationsSheet.addRow({
    plant: "GROUP",
    ...summary.groupMetrics.openedByType,
    total: summary.groupMetrics.totalOpenedCommunications,
  });

  const performanceSheet = workbook.addWorksheet("Performance");
  performanceSheet.columns = [
    { header: "Plant", key: "plant", width: 28 },
    { header: "% Closed Actions", key: "closedActionsPercent", width: 18 },
    { header: "Accident Frequency Rate", key: "accidentFrequencyRate", width: 22 },
    { header: "Gravity Rate", key: "gravityRate", width: 18 },
    { header: "Near Miss Frequency Rate", key: "nearMissFrequencyRate", width: 24 },
    { header: "First Aid Frequency Rate", key: "firstAidFrequencyRate", width: 24 },
  ];

  [...summary.metrics, summary.groupMetrics].forEach((metric) => {
    performanceSheet.addRow({
      plant: metric.plantId === "GROUP" ? "GROUP" : `${metric.plantCode.toUpperCase()} - ${metric.plantName}`,
      closedActionsPercent: Number(metric.closedActionsPercent.toFixed(2)),
      accidentFrequencyRate: Number(metric.accidentFrequencyRate.toFixed(2)),
      gravityRate: Number(metric.gravityRate.toFixed(2)),
      nearMissFrequencyRate: Number(metric.nearMissFrequencyRate.toFixed(2)),
      firstAidFrequencyRate: Number(metric.firstAidFrequencyRate.toFixed(2)),
    });
  });

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 36 },
    { header: "Value", key: "value", width: 24 },
  ];
  summarySheet.addRow({ metric: "Title", value: summary.title });
  summarySheet.addRow({ metric: "Plants included", value: summary.metrics.length });
  summarySheet.addRow({ metric: "Group opened communications", value: summary.groupMetrics.totalOpenedCommunications });
  summarySheet.addRow({ metric: "Group % closed actions", value: Number(summary.groupMetrics.closedActionsPercent.toFixed(2)) });
  summarySheet.addRow({ metric: "Group accident frequency rate", value: Number(summary.groupMetrics.accidentFrequencyRate.toFixed(2)) });
  summarySheet.addRow({ metric: "Group gravity rate", value: Number(summary.groupMetrics.gravityRate.toFixed(2)) });
  summarySheet.addRow({ metric: "Group near miss frequency rate", value: Number(summary.groupMetrics.nearMissFrequencyRate.toFixed(2)) });
  summarySheet.addRow({ metric: "Group first aid frequency rate", value: Number(summary.groupMetrics.firstAidFrequencyRate.toFixed(2)) });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function getOverlappingMonths(periodStart: Date, periodEnd: Date) {
  const months: Array<{ year: number; month: number; monthStart: Date; monthEnd: Date }> = [];
  let cursor = startOfMonth(periodStart);

  while (cursor <= periodEnd) {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    months.push({
      year: monthStart.getUTCFullYear(),
      month: monthStart.getUTCMonth() + 1,
      monthStart,
      monthEnd,
    });
    cursor = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  }

  return months;
}

function getProratedHoursWorked(input: {
  periodStart: Date;
  periodEnd: Date;
  kpiInputs: Array<{ year: number; month: number; hoursWorked: number }>;
}) {
  const overlappingMonths = getOverlappingMonths(input.periodStart, input.periodEnd);

  return overlappingMonths.reduce((sum, monthEntry) => {
    const matchedInput = input.kpiInputs.find(
      (row) => row.year === monthEntry.year && row.month === monthEntry.month,
    );

    if (!matchedInput) {
      return sum;
    }

    const overlapStart = max([input.periodStart, monthEntry.monthStart]);
    const overlapEnd = min([input.periodEnd, monthEntry.monthEnd]);
    const overlapDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;

    if (overlapDays <= 0) {
      return sum;
    }

    const monthDays = differenceInCalendarDays(monthEntry.monthEnd, monthEntry.monthStart) + 1;
    return sum + (matchedInput.hoursWorked * overlapDays) / monthDays;
  }, 0);
}

function buildCorporateMetrics(input: {
  plants: Array<{ id: string; code: string; name: string }>;
  openedCommunications: Array<{ plantId: string; type: CommunicationType }>;
  kpiCommunications: Array<{ plantId: string; type: CommunicationType; lostDays: number | null }>;
  actions: Array<{ plantId: string; status: string }>;
  kpiInputs: Array<{ plantId: string; year: number; month: number; hoursWorked: number }>;
  periodStart: Date;
  periodEnd: Date;
}) {
  const perPlant = input.plants.map<CorporatePlantMetrics>((plant) => {
    const openedByType = createEmptyByTypeRecord();
    const openedRows = input.openedCommunications.filter((row) => row.plantId === plant.id);
    const kpiRows = input.kpiCommunications.filter((row) => row.plantId === plant.id);
    const actionRows = input.actions.filter((row) => row.plantId === plant.id);
    const plantKpiInputs = input.kpiInputs.filter((row) => row.plantId === plant.id);

    openedRows.forEach((row) => {
      openedByType[row.type] += 1;
    });

    const accidents = kpiRows.filter((row) => row.type === CommunicationType.ACCIDENT).length;
    const nearMisses = kpiRows.filter((row) => row.type === CommunicationType.NEAR_MISS).length;
    const firstAidCases = kpiRows.filter((row) => row.type === CommunicationType.FIRST_AID).length;
    const lostDays = kpiRows.reduce((sum, row) => sum + (row.lostDays ?? 0), 0);
    const hoursWorked = getProratedHoursWorked({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      kpiInputs: plantKpiInputs,
    });
    const totalActions = actionRows.length;
    const closedActions = actionRows.filter((row) => row.status === "CLOSED").length;

    return {
      plantId: plant.id,
      plantCode: plant.code,
      plantName: plant.name,
      openedByType,
      totalOpenedCommunications: openedRows.length,
      closedActionsPercent: totalActions > 0 ? (closedActions / totalActions) * 100 : 0,
      accidentFrequencyRate: hoursWorked > 0 ? (accidents / hoursWorked) * ONE_MILLION : 0,
      gravityRate: hoursWorked > 0 ? (lostDays / hoursWorked) * ONE_MILLION : 0,
      nearMissFrequencyRate: hoursWorked > 0 ? (nearMisses / hoursWorked) * ONE_MILLION : 0,
      firstAidFrequencyRate: hoursWorked > 0 ? (firstAidCases / hoursWorked) * ONE_MILLION : 0,
      hoursWorked,
      accidents,
      nearMisses,
      firstAidCases,
      lostDays,
      totalActions,
      closedActions,
    };
  });

  const groupOpenedByType = createEmptyByTypeRecord();
  perPlant.forEach((metric) => {
    COMMUNICATION_TYPE_ORDER.forEach((type) => {
      groupOpenedByType[type] += metric.openedByType[type];
    });
  });

  const groupHoursWorked = perPlant.reduce((sum, metric) => sum + metric.hoursWorked, 0);
  const groupAccidents = perPlant.reduce((sum, metric) => sum + metric.accidents, 0);
  const groupNearMisses = perPlant.reduce((sum, metric) => sum + metric.nearMisses, 0);
  const groupFirstAidCases = perPlant.reduce((sum, metric) => sum + metric.firstAidCases, 0);
  const groupLostDays = perPlant.reduce((sum, metric) => sum + metric.lostDays, 0);
  const groupTotalActions = perPlant.reduce((sum, metric) => sum + metric.totalActions, 0);
  const groupClosedActions = perPlant.reduce((sum, metric) => sum + metric.closedActions, 0);

  const groupMetrics: CorporatePlantMetrics = {
    plantId: "GROUP",
    plantCode: "GROUP",
    plantName: "Group",
    openedByType: groupOpenedByType,
    totalOpenedCommunications: perPlant.reduce((sum, metric) => sum + metric.totalOpenedCommunications, 0),
    closedActionsPercent: groupTotalActions > 0 ? (groupClosedActions / groupTotalActions) * 100 : 0,
    accidentFrequencyRate: groupHoursWorked > 0 ? (groupAccidents / groupHoursWorked) * ONE_MILLION : 0,
    gravityRate: groupHoursWorked > 0 ? (groupLostDays / groupHoursWorked) * ONE_MILLION : 0,
    nearMissFrequencyRate: groupHoursWorked > 0 ? (groupNearMisses / groupHoursWorked) * ONE_MILLION : 0,
    firstAidFrequencyRate: groupHoursWorked > 0 ? (groupFirstAidCases / groupHoursWorked) * ONE_MILLION : 0,
    hoursWorked: groupHoursWorked,
    accidents: groupAccidents,
    nearMisses: groupNearMisses,
    firstAidCases: groupFirstAidCases,
    lostDays: groupLostDays,
    totalActions: groupTotalActions,
    closedActions: groupClosedActions,
  };

  return { perPlant, groupMetrics };
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
    recipients?: string[];
  }) {
    const [plants, openedCommunications, kpiCommunications, actions, kpiInputs] = await prisma.$transaction([
      prisma.plant.findMany({
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
          reportedAt: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
          status: {
            in: INCLUDED_OPEN_COMMUNICATION_STATUSES,
          },
        },
        select: {
          plantId: true,
          type: true,
        },
      }),
      prisma.communication.findMany({
        where: {
          eventDatetime: {
            gte: input.periodStart,
            lte: input.periodEnd,
          },
          status: {
            in: KPI_STATUSES,
          },
        },
        select: {
          plantId: true,
          type: true,
          lostDays: true,
        },
      }),
      prisma.action.findMany({
        where: {
          createdAt: {
            lte: input.periodEnd,
          },
        },
        select: {
          plantId: true,
          status: true,
        },
      }),
      prisma.safetyKpiMonthlyInput.findMany({
        select: {
          plantId: true,
          year: true,
          month: true,
          hoursWorked: true,
        },
      }),
    ]);

    const { perPlant, groupMetrics } = buildCorporateMetrics({
      plants,
      openedCommunications,
      kpiCommunications,
      actions,
      kpiInputs: kpiInputs.map((entry) => ({
        plantId: entry.plantId,
        year: entry.year,
        month: entry.month,
        hoursWorked: Number(entry.hoursWorked),
      })),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    const title = `${input.reportType} - Corporate Group (${format(input.periodStart, "yyyy-MM-dd")} to ${format(input.periodEnd, "yyyy-MM-dd")})`;
    const pdf = await pdfBufferFromText([
      "Scope: Corporate Group",
      `Period: ${format(input.periodStart, "yyyy-MM-dd")} - ${format(input.periodEnd, "yyyy-MM-dd")}`,
      "",
      "Automatic indicators:",
      `1. Opened communications by type: ${groupMetrics.totalOpenedCommunications}`,
      `2. % closed actions: ${groupMetrics.closedActionsPercent.toFixed(2)}%`,
      `3. Accident frequency rate: ${groupMetrics.accidentFrequencyRate.toFixed(2)}`,
      `4. Gravity rate: ${groupMetrics.gravityRate.toFixed(2)}`,
      `5. Near miss frequency rate: ${groupMetrics.nearMissFrequencyRate.toFixed(2)}`,
      `6. First aid frequency rate: ${groupMetrics.firstAidFrequencyRate.toFixed(2)}`,
      "",
      ...perPlant.flatMap((metric) => [
        `${metric.plantCode.toUpperCase()} - ${metric.plantName}`,
        `Opened communications: ${metric.totalOpenedCommunications} | % closed actions: ${metric.closedActionsPercent.toFixed(2)}%`,
        `Accident FR: ${metric.accidentFrequencyRate.toFixed(2)} | Gravity: ${metric.gravityRate.toFixed(2)} | Near miss FR: ${metric.nearMissFrequencyRate.toFixed(2)} | First aid FR: ${metric.firstAidFrequencyRate.toFixed(2)}`,
        "",
      ]),
    ]);

    const xlsx = await xlsxBufferFromCorporateSummary({
      title,
      metrics: perPlant,
      groupMetrics,
    });

    const storage = buildReportStorageKeys({
      scope: "corporate",
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    await Promise.all([
      StorageService.uploadObject({
        key: storage.pdfKey,
        contentType: "application/pdf",
        body: pdf,
      }),
      StorageService.uploadObject({
        key: storage.xlsxKey,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: xlsx,
      }),
    ]);

    await prisma.reportRun.create({
      data: {
        plantId: null,
        type: input.reportType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        fileKeys: {
          pdfKey: storage.pdfKey,
          xlsxKey: storage.xlsxKey,
          pdfFileName: storage.files.pdf,
          xlsxFileName: storage.files.xlsx,
          scope: "CORPORATE",
        },
        recipients: input.recipients ?? [],
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return {
      title,
      files: storage.files,
      storageKeys: {
        pdfKey: storage.pdfKey,
        xlsxKey: storage.xlsxKey,
      },
      meta: {
        reportType: input.reportType,
        scope: "CORPORATE" as const,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      pdf,
      xlsx,
    };
  },

  async getCorporateReportAudience() {
    const [corporateRecipients, roleRecipients] = await prisma.$transaction([
      prisma.reportRecipient.findMany({
        where: {
          list: {
            scope: "CORPORATE",
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
    notificationTitle: string;
    notificationBody: string;
  }) {
    const audience = await this.getCorporateReportAudience();
    const report = await this.generateCorporatePeriodReport({
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
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
        {
          filename: report.files.xlsx,
          content: report.xlsx,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    return report;
  },
};
