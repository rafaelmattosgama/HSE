// @vitest-environment jsdom
import { createElement, useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGroupSafetyPlant } from "@/lib/group-safety-dashboard";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); },
    () => window.location.search,
    () => "",
  )),
}));
import { GroupSafetyDashboard, GroupDashboardAreaNavigation } from "@/components/feature/group-safety-dashboard";

const today = new Date("2026-01-31T12:00:00Z");
const date = new Date("2026-01-10T12:00:00Z");
const period = { year: 2026, month: 1, from: "2026-01-01", to: "2026-01-31", mode: "month", label: "2026-01-01 - 2026-01-31" };
function makePlant(code: string, name: string, count: number) {
  return buildGroupSafetyPlant({ id: code, code, name, createdAt: new Date(period.from), communications: Array.from({ length: count }, () => ({ type: "ACCIDENT", status: "CLOSED", classification: "MINOR", eventDatetime: date, reportedAt: date, updatedAt: date, lostDays: 1, unsafeActType: null, nearMissType: null })), kpiInputs: [{ year: 2026, month: 1, hoursWorked: 1000, updatedAt: date }], sewoRecords: [], actions: [] }, { from: new Date(period.from), to: today, today, injuryDates: count ? [date] : [], safetyConfig: null });
}
const plants = [makePlant("a", "Alpha", 1), makePlant("b", "Beta", 3)];
function show() { return render(createElement(GroupSafetyDashboard, { plants, locale: "pt", period, loadedAt: today.toISOString() })); }
const nativePush = window.history.pushState.bind(window.history);

describe("group safety view and scope navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/corporate?year=2026&month=1");
    vi.spyOn(window.history, "pushState").mockImplementation((...args) => { nativePush(...args); window.dispatchEvent(new PopStateEvent("popstate")); });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("opens executive/group by default and switches views without data requests", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    show();
    expect(screen.getByTestId("view-executive")).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("4");
    fireEvent.click(screen.getByRole("link", { name: "Controlo operacional" }));
    expect(screen.getByTestId("view-operational")).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("4");
    expect(window.location.search).toContain("view=operational");
    expect(window.location.search).toContain("month=1");
    fireEvent.click(screen.getByRole("link", { name: "Visão de risco" }));
    expect(screen.getByTestId("view-risk")).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("4");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["executive", "operational", "risk"])("opens a direct URL for %s", view => {
    window.history.replaceState(null, "", `/app/corporate?view=${view}&plant=b&from=2026-01-01&to=2026-01-31`);
    show();
    expect(screen.getByTestId(`view-${view}`)).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("3");
    expect(screen.getByRole("link", { name: "Abrir dashboard da fábrica" }).getAttribute("href")).toContain("/app/b/dashboards");
  });

  it("searches plants, changes every summary to one plant and returns to Group", () => {
    show();
    fireEvent.click(screen.getByText("Âmbito: Grupo"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar fábrica por nome" }), { target: { value: "bet" } });
    const options = screen.getByRole("list", { name: "Âmbito" });
    expect(within(options).queryByRole("button", { name: "Alpha A" })).toBeNull();
    fireEvent.click(within(options).getByRole("button", { name: "Beta B" }));
    expect(window.location.search).toContain("plant=b");
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("3");
    expect(screen.getByTestId("pyramid-events-minorInjury").textContent).toBe("3");
    fireEvent.click(screen.getByText("Âmbito: Beta"));
    fireEvent.click(screen.getByRole("button", { name: "Grupo" }));
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("4");
  });

  it("preserves view and scope in filter submissions, date reset, current year and area links", () => {
    window.history.replaceState(null, "", "/app/corporate?area=safety&view=risk&plant=b&year=2025&month=6&from=2025-06-02&to=2025-06-20");
    const { container } = show();
    const form = container.querySelector("form")!;
    const inputs = new FormData(form);
    expect(inputs.get("view")).toBe("risk"); expect(inputs.get("plant")).toBe("b");
    for (const name of ["Limpar datas", "Ano atual"]) {
      const query = new URL(screen.getByRole("link", { name }).getAttribute("href")!, "http://localhost").searchParams;
      expect(query.get("view")).toBe("risk"); expect(query.get("plant")).toBe("b"); expect(query.has("from")).toBe(false);
    }
    render(createElement(GroupDashboardAreaNavigation, { locale: "pt", area: "safety" }));
    const env = new URL(screen.getByRole("link", { name: "Ambiente" }).getAttribute("href")!, "http://localhost").searchParams;
    expect(env.get("view")).toBe("risk"); expect(env.get("plant")).toBe("b"); expect(env.get("from")).toBe("2025-06-02");
  });

  it("supports the compact view selector and history changes", () => {
    show();
    fireEvent.change(screen.getByRole("combobox", { name: "Vista do dashboard" }), { target: { value: "risk" } });
    expect(screen.getByTestId("view-risk")).toBeTruthy();
    act(() => { window.history.replaceState(null, "", "/app/corporate?view=operational&plant=a"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByTestId("view-operational")).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("1");
  });

  it("shows an unavailable-scope message instead of silently displaying other plants", () => {
    window.history.replaceState(null, "", "/app/corporate?plant=unauthorized");
    show();
    expect(screen.getByText(/Esta fábrica não está disponível/)).toBeTruthy();
    expect(screen.queryByTestId("kpi-accidents")).toBeNull();
  });

  it("renders no-data states for empty scope and missing denominators", () => {
    const first = render(createElement(GroupSafetyDashboard, { plants: [], locale: "pt", period, loadedAt: today.toISOString() }));
    expect(screen.getByText("Sem fábricas autorizadas neste âmbito.")).toBeTruthy();
    first.unmount();
    const plant = makePlant("a", "Alpha", 0);
    plant.current.hours = 0; plant.rates.frequency = null;
    render(createElement(GroupSafetyDashboard, { plants: [plant], locale: "pt", period, loadedAt: today.toISOString() }));
    expect(screen.getByTestId("kpi-frequency").textContent).toBe("Sem dados");
    expect(screen.getByText(/Horas trabalhadas em falta ou incompletas: Alpha/)).toBeTruthy();
    expect(screen.getByTestId("kpi-accidents").textContent).toBe("0");
  });
});
