import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const mocks = vi.hoisted(() => ({ session: vi.fn(), dataset: vi.fn(), config: vi.fn(), plants: vi.fn(), environment: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/server-ui-language", () => ({ getServerUiLocale: async () => "pt" }));
vi.mock("@/lib/services/group-safety-dashboard-service", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/services/group-safety-dashboard-service")>();
  return { ...original, getGroupSafetyDashboard: mocks.dataset };
});
vi.mock("@/lib/prisma", () => ({ prisma: { plant: { findMany: mocks.plants }, plantMonthlyInput: { findMany: mocks.environment } } }));
vi.mock("@/lib/services/parameter-service", () => ({ getGlobalRepeatabilityAlertConfig: mocks.config }));
vi.mock("@/components/feature/group-safety-dashboard", () => ({
  GroupSafetyDashboard: () => createElement("div", null, "safety-dataset"),
  GroupDashboardAreaNavigation: () => null,
  GroupDashboardFilters: () => null,
}));
vi.mock("@/components/feature/environment-dashboard-board", () => ({ EnvironmentDashboardBoard: () => createElement("div", null, "environment-dataset") }));
vi.mock("@/components/feature/repeatability-alert-editor", () => ({ RepeatabilityAlertEditor: () => null }));
import CorporatePage from "@/app/(secure)/app/corporate/page";

describe("corporate dashboard entry point", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.dataset.mockResolvedValue({ plants: [], loadedAt: "2026-01-31T12:00:00Z" }); mocks.plants.mockResolvedValue([]); mocks.environment.mockResolvedValue([]); });
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR])("%s opens the same safety dashboard and passes its roles to the data boundary", async role => {
    const roles = [{ plantId: "a", plantCode: "a", role }];
    mocks.session.mockResolvedValue({ user: { language: "pt", plantRoles: roles } });
    const page = await CorporatePage({ searchParams: Promise.resolve({ view: "risk", plant: "a", year: "2026", month: "1" }) });
    expect(renderToStaticMarkup(page)).toContain("safety-dataset");
    expect(mocks.dataset).toHaveBeenCalledOnce();
    expect(mocks.dataset).toHaveBeenCalledWith(roles, expect.objectContaining({ year: 2026, month: 1 }));
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.environment).not.toHaveBeenCalled();
  });
  it("keeps environment separate without loading safety data", async () => {
    mocks.session.mockResolvedValue({ user: { language: "pt", plantRoles: [{ plantId: null, plantCode: null, role: RoleCode.N1_CORPORATE }] } });
    const page = await CorporatePage({ searchParams: Promise.resolve({ area: "environment", year: "2026" }) });
    expect(renderToStaticMarkup(page)).toContain("environment-dataset");
    expect(mocks.dataset).not.toHaveBeenCalled();
    expect(mocks.environment).toHaveBeenCalledOnce();
  });
  it("requires a session before reading data", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(CorporatePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
    expect(mocks.dataset).not.toHaveBeenCalled();
    expect(mocks.plants).not.toHaveBeenCalled();
  });
});
