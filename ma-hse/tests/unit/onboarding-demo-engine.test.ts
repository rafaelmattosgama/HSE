import { describe, expect, it } from "vitest";
import { isTaskComplete, routePatternMatches } from "@/components/onboarding/task-condition";
import { getOnboardingSteps } from "@/components/onboarding/onboarding-config";
import { DEMO_SCRIPTS, getDemoScriptSteps } from "@/components/onboarding/demo-scripts";

const noElements = { querySelector: () => null };

describe("task conditions", () => {
  it("matches route patterns", () => {
    expect(routePatternMatches("/app/*/communications/*", "/app/demo-lis/communications/abc")).toBe(true);
    expect(routePatternMatches("/app/*/communications/*", "/app/demo-lis/communications")).toBe(false);
    expect(routePatternMatches("/app/corporate/**", "/app/corporate/reports/x")).toBe(true);
    expect(routePatternMatches("/app/corporate/**", "/app/corporate")).toBe(true);
    expect(routePatternMatches("/app/corporate/**", "/app/corporate-x")).toBe(false);
  });

  it("requires every given part of the condition", () => {
    expect(isTaskComplete({ route: "/app/*/actions" }, "/app/demo-lis/actions", noElements)).toBe(true);
    expect(isTaskComplete({ route: "/app/*/actions", element: "[data-x]" }, "/app/demo-lis/actions", noElements)).toBe(false);
    expect(isTaskComplete({ element: "[data-x]" }, "/", { querySelector: () => ({}) as Element })).toBe(true);
    expect(isTaskComplete({}, "/", { querySelector: () => ({}) as Element })).toBe(false);
  });
});

describe("named demo scripts", () => {
  it("demo users get their script, in their language, with the plant resolved", () => {
    const steps = getOnboardingSteps({ role: "N3_SAFETY", plantCode: "demo-lis", permissions: [], locale: "en", demoScript: "demo-training-n3" });
    expect(steps).toEqual(getDemoScriptSteps("demo-training-n3", "en", "demo-lis"));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => !step.route?.includes("{plant}"))).toBe(true);
  });

  it("other users keep the role tour", () => {
    const steps = getOnboardingSteps({ role: "N3_SAFETY", plantCode: "pl01", permissions: [], locale: "pt" });
    expect(steps[0].id).toBe("topbar");
  });

  it("falls back to English for languages other than pt", () => {
    const [first] = getDemoScriptSteps("demo-presentation", "it", null);
    expect(first.title).toBe(DEMO_SCRIPTS["demo-presentation"][0].copy.en.title);
    const [firstPt] = getDemoScriptSteps("demo-presentation", "pt", null);
    expect(firstPt.title).toBe(DEMO_SCRIPTS["demo-presentation"][0].copy.pt.title);
  });
});
