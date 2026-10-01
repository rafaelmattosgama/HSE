import { CommunicationStatus, CommunicationType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";

const capture = vi.hoisted(() => ({ boxes: [] as Array<{ page: object; text: string; x: number; y: number; w: number; h: number; pageWidth: number; pageHeight: number }> }));
vi.mock("@/lib/services/pdfkit-helper", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/services/pdfkit-helper")>();
  return { createPdfDocument: (...args: Parameters<typeof original.createPdfDocument>) => {
    const doc = original.createPdfDocument(...args);
    const text = doc.text.bind(doc);
    doc.text = ((value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => {
      const w = options.lineBreak === false ? doc.widthOfString(value) : options.width ?? doc.widthOfString(value);
      const h = options.lineBreak === false ? doc.currentLineHeight() : doc.heightOfString(value, { ...options, width: w });
      capture.boxes.push({ page: doc.page, text: value, x, y, w, h, pageWidth: doc.page.width, pageHeight: doc.page.height });
      return text(value, x, y, options);
    }) as typeof doc.text;
    return doc;
  } };
});

import { buildCorporateSafetyReportData, CORPORATE_COMMUNICATION_TYPES, pdfBufferFromCorporateSafetyReport } from "@/lib/services/corporate-safety-report";
import { buildPlantReportRankings } from "@/lib/plant-report-rankings";

const plants = [{ id: "a", code: "MAAP", name: "Valenca" }, { id: "b", code: "MACH", name: "Chivasso" }];
const date = new Date("2026-09-15T12:00:00Z");
function communication(type: CommunicationType, overrides: Partial<Parameters<typeof buildCorporateSafetyReportData>[0]["communications"][number]> = {}) {
  return { plantId: "a", type, status: CommunicationStatus.VALID_OPEN, eventDatetime: date, reportedAt: date, lostDays: 0, actions: [], ...overrides };
}
function build(overrides: Partial<Parameters<typeof buildCorporateSafetyReportData>[0]> = {}) {
  return buildCorporateSafetyReportData({ plants, communications: [], kpiInputs: [], selectedYear: 2026, selectedMonth: 9, scopeLabel: "Global", ...overrides });
}

describe("corporate report metrics", () => {
  it("separates submitted counts from validated first-aid rates and weights division rates by hours", () => {
    const result = build({
      communications: [communication(CommunicationType.FIRST_AID), communication(CommunicationType.FIRST_AID, { plantId: "b" }), communication(CommunicationType.FIRST_AID, { status: CommunicationStatus.PENDING_VALIDATION }), communication(CommunicationType.FIRST_AID, { status: CommunicationStatus.REJECTED })],
      kpiInputs: [{ plantId: "a", year: 2026, month: 9, hoursWorked: 1000 }, { plantId: "b", year: 2026, month: 9, hoursWorked: 3000 }],
    });
    expect(result.rows[0].communicationsMonth.firstAidRate).toBe(1000);
    expect(result.rows[1].communicationsMonth.firstAidRate).toBeCloseTo(333.333);
    expect(result.division.communicationsMonth).toMatchObject({ firstAidRate: 500, firstAids: 2, reported: { FIRST_AID: 3 } });
  });

  it("counts every supported type by submission date, including late reports and pending records", () => {
    const result = build({ communications: [
      ...CORPORATE_COMMUNICATION_TYPES.map(({ type }) => communication(type, { eventDatetime: new Date("2025-12-31"), status: CommunicationStatus.SUBMITTED })),
      communication(CommunicationType.FIRST_AID, { reportedAt: new Date("2026-10-01T00:00:00Z") }),
      communication(CommunicationType.NEAR_MISS, { reportedAt: new Date("2026-08-31T23:59:59Z") }),
      communication(CommunicationType.NEAR_MISS, { status: CommunicationStatus.INVALID }),
    ] });
    expect(Object.values(result.division.communicationsMonth.reported)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(result.division.communicationsYtd.reported.NEAR_MISS).toBe(2);
    expect(result.division.injuriesYtd).toBe(0);
  });

  it("counts closed communications, including records without actions, rather than averaging plant percentages", () => {
    const result = build({ communications: [
      communication(CommunicationType.UNSAFE_ACT, { actions: [{ status: "CLOSED" }] }),
      communication(CommunicationType.UNSAFE_ACT, { actions: [{ status: "CLOSED" }, { status: "OPEN" }] }),
      communication(CommunicationType.UNSAFE_ACT, { status: CommunicationStatus.CLOSED }),
      communication(CommunicationType.UNSAFE_ACT, { plantId: "b", status: CommunicationStatus.CLOSED, actions: [{ status: "CLOSED" }] }),
      communication(CommunicationType.UNSAFE_CONDITION, { actions: [{ status: "ONGOING" }] }),
      communication(CommunicationType.UNSAFE_ACT, { status: CommunicationStatus.SUBMITTED, actions: [{ status: "CLOSED" }] }),
    ] });
    expect(result.rows[0].communicationsMonth.unsafeActsClosedPercent).toBeCloseTo(100 / 3);
    expect(result.division.communicationsMonth.unsafeActsClosedPercent).toBe(50);
    expect(result.division.communicationsMonth.unsafeConditionsClosedPercent).toBe(0);
    expect(result.rows[1].communicationsMonth.unsafeConditionsClosedPercent).toBeNull();
  });

  it("keeps monthly and YTD cohorts separate and returns N/A when denominators are missing", () => {
    const result = build({ communications: [communication(CommunicationType.FIRST_AID, { eventDatetime: new Date("2026-08-31T23:59:59Z") })], kpiInputs: [{ plantId: "a", year: 2026, month: 8, hoursWorked: 2000 }] });
    expect(result.division.communicationsYtd.firstAidRate).toBe(500);
    expect(result.division.communicationsMonth.firstAidRate).toBeNull();
    expect(result.division.communicationsMonth.unsafeActsClosedPercent).toBeNull();
  });

  it("excludes inactive or out-of-scope plants from division totals and historical charts", () => {
    const result = build({ communications: [communication(CommunicationType.ACCIDENT, { plantId: "excluded", lostDays: 9 })], kpiInputs: [{ plantId: "excluded", year: 2026, month: 9, hoursWorked: 9000 }] });
    expect(result.division.hoursYtd).toBe(0);
    expect(result.series.injuriesCurrent.every(value => value === 0)).toBe(true);
    expect(result.series.yearlyComparison.at(-1)?.hoursWorked).toBe(0);
    expect(result.division.communicationsMonth.reported.ACCIDENT).toBe(0);
  });

  it("pools closed communication counts and keeps the current snapshot separate from YTD", () => {
    const result = build({
      communications: [
        communication(CommunicationType.UNSAFE_ACT, { status: CommunicationStatus.CLOSED }),
        communication(CommunicationType.FIRST_AID, { plantId: "b", status: CommunicationStatus.CLOSED }),
        communication(CommunicationType.NEAR_MISS, { plantId: "b" }),
        communication(CommunicationType.NEAR_MISS, { status: CommunicationStatus.SUBMITTED }),
        communication(CommunicationType.NEAR_MISS, { status: CommunicationStatus.INVALID }),
      ],
      communicationStatusCounts: [
        { plantId: "a", status: CommunicationStatus.SUBMITTED, count: 3 },
        { plantId: "b", status: CommunicationStatus.PENDING_VALIDATION, count: 5 },
        { plantId: "a", status: CommunicationStatus.VALID_OPEN, count: 7 },
        { plantId: "b", status: CommunicationStatus.ONGOING, count: 11 },
        { plantId: "excluded", status: CommunicationStatus.SUBMITTED, count: 100 },
      ],
    });
    expect(result.division.communicationsYtd).toMatchObject({ closed: 2, valid: 3 });
    expect(result.division.communicationsYtd.closedPercent).toBeCloseTo(200 / 3);
    expect(result.operational).toMatchObject({ pendingValidations: 8, openCommunications: 18 });
  });

  it("calculates action cards from the scoped YTD cohort, including ongoing actions and excluding undated closures", () => {
    const action = { plantId: "a", status: "CLOSED", createdAt: date, closedAt: date, dueDate: date };
    const result = build({ actions: [
      action,
      { ...action, plantId: "b", closedAt: new Date("2026-09-16") },
      { ...action, closedAt: null },
      { ...action, status: "OPEN", closedAt: null },
      { ...action, status: "ONGOING", closedAt: null },
      { ...action, status: "OPEN", createdAt: new Date("2025-12-31") },
      { ...action, plantId: "excluded" },
    ] });
    expect(result.operational).toMatchObject({ openActions: 2, closedOnTimePercent: 50 });
    expect(build().operational.closedOnTimePercent).toBeNull();
  });
});

describe("corporate PDF layout", () => {
  it.each([false, true])("renders the factory-specific pages, empty or populated (%s), without affecting global sections", async populated => {
    capture.boxes.length = 0;
    const plantRankings = buildPlantReportRankings({ communications: [], analyses: [], employees: [] }, "a", new Date("2026-01-01"), date);
    if (populated) for (const ranking of [...plantRankings.paretos, ...plantRankings.people]) {
      ranking.total = 19;
      ranking.entries = Array.from({ length: 5 }, (_, i) => ({ label: `${i + 1}. A long classification or employee department name with accents: João Gonçalves - manufacturing area ${i}`, count: 5 - i, percentage: (5 - i) / 19 * 100 }));
    }
    const result = build({ selectedPlantId: "a", scopeLabel: "Factory: Valenca (MAAP)", plantRankings });
    const pdf = await pdfBufferFromCorporateSafetyReport(result);
    const boxes = capture.boxes;
    const pageFor = (title: string) => new Set(boxes.filter(box => box.text === title).map(box => box.page));
    expect(pageFor("Plant Closure & Follow-up").size).toBe(1);
    expect(pageFor("Global Closure & Follow-up").size).toBe(0);
    expect(pageFor("Reported Communications by Plant").size).toBe(0);
    expect(boxes.some(box => box.text.includes("Chivasso") || box.text.includes("Division") || box.text.includes("Plants - Pareto"))).toBe(false);
    const paretoPages = new Set(plantRankings.paretos.flatMap(ranking => [...pageFor(ranking.title)]));
    const peoplePages = new Set(plantRankings.people.flatMap(ranking => [...pageFor(ranking.title)]));
    expect(paretoPages.size).toBe(1);
    expect(peoplePages.size).toBe(1);
    expect([...paretoPages][0]).not.toBe([...peoplePages][0]);
    expect(new Set(boxes.map(box => box.page)).size).toBe(8);
    for (const box of boxes) {
      expect(box.x, box.text).toBeGreaterThanOrEqual(44);
      expect(box.x + box.w, box.text).toBeLessThanOrEqual(box.pageWidth - 40);
      expect(box.y + box.h, box.text).toBeLessThanOrEqual(box.pageHeight - 16);
    }
    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.page === b.page && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5) collisions.push(`${a.text} / ${b.text}`);
    }
    expect(collisions).toEqual([]);
    if (process.env.CORPORATE_PDF_QA_DIR) {
      await mkdir(process.env.CORPORATE_PDF_QA_DIR, { recursive: true });
      await writeFile(`${process.env.CORPORATE_PDF_QA_DIR}/factory-${populated ? "populated" : "empty"}.pdf`, pdf);
    }
  });

  it.each([0, 1, 18, 35])("keeps text inside pages and prevents collisions with %i plants", async count => {
    capture.boxes.length = 0;
    const manyPlants = Array.from({ length: count }, (_, i) => ({ id: String(i), code: `PL${String(i).padStart(3, "0")}`, name: `Manufacturing plant ${i} - Long location name` }));
    const result = build({
      plants: manyPlants, selectedMonth: count === 35 ? 12 : 9,
      scopeLabel: count === 1 ? `Factory: ${manyPlants[0].name} (PL000)` : "Global",
      communications: count < 2 ? [] : manyPlants.flatMap(plant => Array.from({ length: 12 }, (_, i) => communication(CommunicationType.ACCIDENT, { plantId: plant.id, lostDays: i * 1234, eventDatetime: new Date(Date.UTC(2026, i, 15)) }))),
      kpiInputs: manyPlants.flatMap(plant => Array.from({ length: 12 }, (_, i) => ({ plantId: plant.id, year: 2026, month: i + 1, hoursWorked: 100000 + i * 1234 }))),
    });
    const pdf = await pdfBufferFromCorporateSafetyReport(result);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const boxes = capture.boxes;
    for (const box of boxes) {
      expect(box.x, box.text).toBeGreaterThanOrEqual(44);
      expect(box.x + box.w, box.text).toBeLessThanOrEqual(box.pageWidth - 40);
      expect(box.y + box.h, box.text).toBeLessThanOrEqual(box.pageHeight - 16);
    }
    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.page === b.page && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5) collisions.push(`${a.text} / ${b.text}`);
    }
    expect(collisions).toEqual([]);
    const kpiPages = new Set(boxes.filter(box => box.text.startsWith("Safety KPI Progressive YTD")).map(box => box.page));
    for (const page of kpiPages) {
      const contents = boxes.filter(box => box.page === page);
      expect(contents[0].pageWidth).toBeGreaterThan(1100);
      expect(contents.filter(box => box.text === "First-aid rate")).toHaveLength(2);
      expect(contents.some(box => box.text === "Budget 2026")).toBe(true);
      expect(contents.some(box => box.text === result.selectedMonthName)).toBe(true);
    }
    expect(boxes.some(box => box.text === "Division - Monthly Outcomes" || box.text === "Division - Monthly Rates")).toBe(false);
    expect(boxes.some(box => box.text === "Safety communication pyramid")).toBe(true);
    expect(boxes.some(box => box.text === "% UNSAFE ACTS CLOSED")).toBe(true);
    expect(boxes.some(box => box.text === "% UNSAFE CONDITIONS CLOSED")).toBe(true);
    if (count === 18) {
      expect(kpiPages.size).toBe(1);
      expect(new Set(boxes.filter(box => box.text.startsWith("Reported Communications by Plant")).map(box => box.page)).size).toBe(1);
    }
    const footerPages = boxes.filter(box => box.text.startsWith("Generated by"));
    expect(footerPages.length).toBe(new Set(boxes.map(box => box.page)).size);
    if (process.env.CORPORATE_PDF_QA_DIR) {
      await mkdir(process.env.CORPORATE_PDF_QA_DIR, { recursive: true });
      await writeFile(`${process.env.CORPORATE_PDF_QA_DIR}/layout-${count}.pdf`, pdf);
    }
  });
});
