// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { waitForOnboardingElement } from "@/components/onboarding/onboarding-dom";

describe("onboarding DOM detection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("continues when an element is added after the page starts rendering", async () => {
    const result = waitForOnboardingElement('[data-onboarding="late-element"]', { timeoutMs: 100 });
    const element = document.createElement("div");
    element.dataset.onboarding = "late-element";
    document.body.append(element);

    await expect(result).resolves.toBe(element);
  });

  it("returns null without throwing when an element never exists", async () => {
    await expect(waitForOnboardingElement('[data-onboarding="missing"]', { timeoutMs: 5 })).resolves.toBeNull();
  });
});
