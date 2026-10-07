import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), plants: vi.fn(), runs: vi.fn(), factory: vi.fn(), generate: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: { plant: { findMany: mocks.plants, findFirst: mocks.factory }, reportRun: { findMany: mocks.runs } } }));
vi.mock("@/lib/services/report-service", () => ({ ReportService: { generateAndShareCorporatePeriodReport: mocks.generate } }));

import CorporateReportsPage from "@/app/(secure)/app/corporate/reports/page";
import { generateCorporateReportAction } from "@/app/(secure)/app/corporate/reports/actions";

function session(role: RoleCode, plantIds: Array<string | null> = ["plant-1", "plant-2"]) {
  mocks.session.mockResolvedValue({ user: { plantRoles: plantIds.map(plantId => ({ role, plantId })) } });
}
function form(scope = "FACTORY", factoryId = "plant-2") {
  const data = new FormData();
  Object.entries({ reportType: "MONTHLY", scope, factoryId, periodStart: "2026-09-01", periodEnd: "2026-09-30" }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("Group KPI report authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session(RoleCode.N3_SAFETY);
    mocks.plants.mockResolvedValue([{ id: "plant-2", code: "pt02", name: "Factory Two" }]);
    mocks.runs.mockResolvedValue([]);
    mocks.factory.mockResolvedValue({ id: "plant-2", code: "pt02", name: "Factory Two" });
  });

  it("filters N3 history and factory choices and offers only factory generation", async () => {
    const html = renderToStaticMarkup(await CorporateReportsPage({}));
    expect(mocks.plants).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, id: { in: ["plant-1", "plant-2"] } } }));
    expect(mocks.runs).toHaveBeenCalledWith(expect.objectContaining({ where: { plantId: { in: ["plant-1", "plant-2"] } } }));
    expect(html).toContain("Generate and share");
    expect(html).toContain("Factory Two");
    expect(html).not.toContain('value="GLOBAL"');
  });

  it("allows N3 to generate for a second assigned factory", async () => {
    await expect(generateCorporateReportAction(form())).rejects.toThrow("redirect:/app/corporate/reports?generated=1");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ plantId: "plant-2", reportType: "MONTHLY" }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/corporate/reports");
  });

  it.each([["GLOBAL", ""], ["FACTORY", "other-plant"], ["FACTORY", ""]])("rejects forged N3 scope %s/%s before generation", async (scope, id) => {
    await expect(generateCorporateReportAction(form(scope, id))).rejects.toThrow("error=forbidden");
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not let a role on another factory expand N3's scope", async () => {
    mocks.session.mockResolvedValue({ user: { plantRoles: [{ role: RoleCode.N3_SAFETY, plantId: "plant-1" }, { role: RoleCode.N4_SUPERVISOR, plantId: "plant-2" }] } });
    await expect(generateCorporateReportAction(form())).rejects.toThrow("error=forbidden");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("preserves N1 global history and generation", async () => {
    session(RoleCode.N1_CORPORATE, [null]);
    const html = renderToStaticMarkup(await CorporateReportsPage({}));
    expect(html).toContain('value="GLOBAL"');
    expect(mocks.runs).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    await expect(generateCorporateReportAction(form("GLOBAL", ""))).rejects.toThrow("generated=1");
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ plantId: undefined }));
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("blocks %s from reports and generation", async role => {
    session(role);
    await expect(CorporateReportsPage({})).rejects.toThrow("redirect:/app/corporate");
    await expect(generateCorporateReportAction(form())).rejects.toThrow("error=forbidden");
    expect(mocks.plants).not.toHaveBeenCalled();
    expect(mocks.runs).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("requires authentication before reading or generating", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(CorporateReportsPage({})).rejects.toThrow("redirect:/login");
    await expect(generateCorporateReportAction(form())).rejects.toThrow("redirect:/login");
    expect(mocks.runs).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
