import { describe, expect, it } from "vitest";
import { DEMO_SCRIPTS } from "@/components/onboarding/demo-scripts";

const MIN_STEPS = { "demo-presentation": 15, "demo-training-n3": 12, "demo-training-n1": 8, "demo-training-n0": 9 } as const;

describe("demo scripts content", () => {
  for (const [id, steps] of Object.entries(DEMO_SCRIPTS)) {
    it(`${id} is complete in pt and en`, () => {
      expect(steps.length).toBeGreaterThanOrEqual(MIN_STEPS[id as keyof typeof MIN_STEPS]);
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
      for (const step of steps) {
        for (const locale of ["pt", "en"] as const) {
          expect(step.copy[locale].title.trim().length, `${id}/${step.id}/${locale}`).toBeGreaterThan(2);
          expect(step.copy[locale].description.trim().length, `${id}/${step.id}/${locale}`).toBeGreaterThan(10);
        }
        expect(step.element, `${id}/${step.id}`).toMatch(/^\[data-onboarding="[a-z0-9-]+"\]$|^body$/);
        expect(step.section, `${id}/${step.id}`).toBeTruthy();
        if (step.route) expect(step.route, `${id}/${step.id}`).toMatch(/^\/app\//);
      }
    });
  }

  it("training scripts include practical tasks", () => {
    for (const id of ["demo-training-n3", "demo-training-n1", "demo-training-n0"] as const) {
      expect(DEMO_SCRIPTS[id].filter((s) => s.completeWhen).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("a task never starts already complete on its own starting page", () => {
    for (const [id, steps] of Object.entries(DEMO_SCRIPTS)) {
      for (const step of steps) {
        if (!step.completeWhen?.route || !step.route) continue;
        expect(step.completeWhen.route, `${id}/${step.id}`).not.toBe(step.route);
      }
    }
  });
});
