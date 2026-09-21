import { renderToStaticMarkup } from "react-dom/server";
import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CorporatePlantManager } from "@/components/feature/corporate-plant-manager";
import type { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";
import type { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  pyramid: vi.fn<(props: ComponentProps<typeof SafetyCommunicationPyramid>) => null>(() => null),
  manager: vi.fn<(props: ComponentProps<typeof CorporatePlantManager>) => null>(() => null),
  kpis: vi.fn<(props: ComponentProps<typeof SafetyDashboardKpiGroups>) => null>(() => null),
  db: {
    plant: { findUniqueOrThrow: vi.fn() }, area: { findMany: vi.fn() }, userPlantRole: { findFirst: vi.fn() },
    systemParameter: { findFirst: vi.fn() },
    communication: { findMany: vi.fn(), aggregate: vi.fn() }, action: { findMany: vi.fn() },
    sEWO: { findMany: vi.fn() }, plantMonthlyInput: { findMany: vi.fn(), aggregate: vi.fn() },
    employeeDirectory: { findMany: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/server-ui-language", () => ({ getServerUiLocale: async () => "pt" }));
vi.mock("@/lib/services/competence-service", () => ({ CompetenceService: { getPlantAuthorizationCoverage: async () => null } }));
vi.mock("@/lib/services/fire-equipment-service", () => ({ FireEquipmentService: { getPlantComplianceCoverage: async () => null } }));
vi.mock("@/lib/services/parameter-service", () => ({ getPlantSafetyDaysConfig: async () => ({}) }));
vi.mock("@/lib/services/master-data-translation-service", () => ({ localizeMasterDataRows: async (_type: unknown, rows: unknown[]) => rows }));
vi.mock("@/components/feature/safety-communication-pyramid", () => ({ SafetyCommunicationPyramid: mocks.pyramid }));
vi.mock("@/components/feature/corporate-plant-manager", () => ({ CorporatePlantManager: mocks.manager }));
vi.mock("@/components/feature/safety-dashboard-kpi-groups", () => ({ SafetyDashboardKpiGroups: mocks.kpis }));
vi.mock("@/components/feature/safety-days-dashboard", () => ({ SafetyDaysSpotlight: () => null }));

import DashboardsPage from "@/app/(secure)/app/[plant]/dashboards/page";

function setRole(role: RoleCode) {
  mocks.session.mockResolvedValue({ user: { id: "user-1", language: "pt", plantRoles: [{ plantId: "plant-1", plantCode: "pl01", role }] } });
}

function communication(areaId: string | null, name: string, status = "VALID_OPEN") {
  return { id: name, codigoCompleto: `CS-${name}`, areaId, type: "UNSAFE_ACT", status, lostDays: 0, classification: null, eventDatetime: new Date("2026-01-05"), reporterName: name, reporterEmployeeNo: name, targetText: null, targetEmployee: { name, dept: areaId }, workstation: { id: name, name, sourceLanguage: "pt" }, unsafeActType: { name }, unsafeConditionType: null, nearMissType: null, actions: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  setRole(RoleCode.N2_PLANT_MANAGER);
  mocks.db.plant.findUniqueOrThrow.mockResolvedValue({ id: "plant-1", code: "pl01", name: "Plant", timezone: "Europe/Lisbon", defaultLanguage: "pt", createdAt: new Date("2020-01-01") });
  mocks.db.area.findMany.mockResolvedValue([{ id: "a", code: "D1", name: "Production" }, { id: "b", code: "D2", name: "Quality" }, { id: "empty", code: "D3", name: "Empty" }]);
  mocks.db.userPlantRole.findFirst.mockResolvedValue({ departmentId: "a" });
  mocks.db.systemParameter.findFirst.mockResolvedValue(null);
  const rows = [communication("a", "Worker A"), communication("b", "Worker B"), communication(null, "Unassigned"), communication("a", "Pending", "SUBMITTED")];
  mocks.db.communication.findMany.mockReset()
    .mockResolvedValueOnce(rows).mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([communication("a", "Previous A"), communication("b", "Previous B"), communication("b", "Previous B2")])
    .mockResolvedValue([]);
  mocks.db.communication.aggregate.mockResolvedValue({ _min: { eventDatetime: null }, _max: { eventDatetime: null } });
  mocks.db.action.findMany.mockResolvedValue([]);
  mocks.db.sEWO.findMany.mockResolvedValue(["a", "b"].map(areaId => ({ areaId, communication: null, analysisDate: new Date("2026-01-05"), templateData: null, causeSelections: [{ selected: true, isRootCause: true, causeItem: { label: `Cause ${areaId}` } }] })));
  mocks.db.plantMonthlyInput.findMany.mockResolvedValue([]);
  mocks.db.plantMonthlyInput.aggregate.mockResolvedValue({ _min: { year: null }, _max: { year: null } });
  mocks.db.employeeDirectory.findMany.mockResolvedValue(["A", "B"].map(name => ({ employeeNo: `Worker ${name}`, name: `Worker ${name}`, dept: name.toLowerCase() })));
  mocks.db.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
});

async function renderPage(departmentId?: string) {
  return renderToStaticMarkup(await DashboardsPage({ params: Promise.resolve({ plant: "pl01" }), searchParams: Promise.resolve({ year: "2026", ...(departmentId === undefined ? {} : { departmentId }) }) }));
}

describe("department-filtered safety dashboard", () => {
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("opens %s with its department and filters the pyramid, rankings and monthly series", async role => {
    setRole(role);
    const html = await renderPage();
    expect(html).toContain('value="a" selected=""');
    expect(mocks.db.userPlantRole.findFirst).toHaveBeenCalledWith({ where: { userId: "user-1", plantId: "plant-1", role: { code: role } }, select: { departmentId: true } });
    const pyramid = mocks.pyramid.mock.calls[0][0];
    expect(pyramid.counts.unsafeAct).toBe(2);
    expect(pyramid.previousCounts?.unsafeAct).toBe(1);
    expect(pyramid.scopeLabel).toBe("Plant / Production");
    expect(pyramid.records).toEqual([
      { id: "Worker A", code: "CS-Worker A", level: "unsafeAct", pending: false },
      { id: "Pending", code: "CS-Pending", level: "unsafeAct", pending: true },
    ]);
    const manager = mocks.manager.mock.calls[0][0];
    const serialized = JSON.stringify(manager.rankings);
    expect(serialized).toContain("Worker A");
    expect(serialized).toContain("Cause a");
    expect(serialized).not.toContain("Worker B");
    expect(serialized).not.toContain("Cause b");
    expect(JSON.stringify(manager.rankingMonthlySeries)).not.toContain("Worker B");
    expect(manager.initialPlants[0].monthlyMetrics[0].validatedEvents).toBe(1);
    expect(manager.departmentScope).toBe(true);
    expect(manager.compactPlantRankings).toBe(true);
    // Only the requested sections change, not the plant-wide KPI cards.
    expect(mocks.kpis.mock.calls[0][0].metrics.validatedEvents).toBe(3);
    expect(html).toContain("dashboards?departmentId=a");
  });

  it("allows N2 to explicitly show all departments, including unassigned records", async () => {
    await renderPage("all");
    expect(mocks.pyramid.mock.calls[0][0].counts.unsafeAct).toBe(4);
    expect(mocks.manager.mock.calls[0][0].departmentScope).toBe(false);
    expect(JSON.stringify(mocks.manager.mock.calls[0][0].rankings)).toContain("Unassigned");
  });

  it("allows selecting another department and keeps date-reset links in that scope", async () => {
    const html = await renderPage("b");
    expect(mocks.pyramid.mock.calls[0][0].counts.unsafeAct).toBe(1);
    expect(mocks.pyramid.mock.calls[0][0].previousCounts?.unsafeAct).toBe(2);
    expect(html).toContain("dashboards?departmentId=b");
    expect(mocks.manager.mock.calls[0][0].scopeLabelOverride).toBe("Plant / Quality");
  });

  it("shows empty results for a department without records", async () => {
    await renderPage("empty");
    expect(mocks.pyramid.mock.calls[0][0].counts.unsafeAct).toBe(0);
    expect(mocks.manager.mock.calls[0][0].rankings.every(group => group.higher.length === 0)).toBe(true);
  });

  it("opens other roles with the whole plant selected", async () => {
    setRole(RoleCode.N3_SAFETY);
    await renderPage();
    expect(mocks.pyramid.mock.calls[0][0].counts.unsafeAct).toBe(4);
    expect(mocks.db.userPlantRole.findFirst).not.toHaveBeenCalled();
  });

  it("uses an updated assignment without a new login", async () => {
    mocks.db.userPlantRole.findFirst.mockResolvedValue({ departmentId: "b" });
    await renderPage();
    expect(mocks.pyramid.mock.calls[0][0].scopeLabel).toBe("Plant / Quality");
    expect(mocks.pyramid.mock.calls[0][0].counts.unsafeAct).toBe(1);
  });
});
