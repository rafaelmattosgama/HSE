import { OnboardingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  CURRENT_ONBOARDING_VERSION,
  getOnboardingState,
  restartOnboarding,
  shouldPresentOnboardingWelcome,
  shouldResumeOnboardingTour,
  startOnboarding,
  updateOnboardingProgress,
} from "@/lib/onboarding";

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    isActive: true,
    onboardingStatus: OnboardingStatus.NOT_STARTED,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    currentOnboardingStep: 0,
    ...overrides,
  };
}

describe("onboarding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presents the welcome state to a user without onboarding", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored());

    const state = await getOnboardingState("user-1");

    expect(state).not.toBeNull();
    expect(shouldPresentOnboardingWelcome(state!)).toBe(true);
    expect(shouldResumeOnboardingTour(state!)).toBe(false);
  });

  it.each([OnboardingStatus.COMPLETED, OnboardingStatus.DISMISSED])(
    "does not present the welcome state after %s",
    async (status) => {
      prismaMock.user.findUnique.mockResolvedValue(stored({ onboardingStatus: status }));

      const state = await getOnboardingState("user-1");

      expect(shouldPresentOnboardingWelcome(state!)).toBe(false);
      expect(shouldResumeOnboardingTour(state!)).toBe(false);
    },
  );

  it("reactivates onboarding when the configured version increases", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored({
      onboardingStatus: OnboardingStatus.COMPLETED,
      onboardingVersion: CURRENT_ONBOARDING_VERSION - 1,
      onboardingStartedAt: new Date("2026-01-01T10:00:00.000Z"),
      onboardingCompletedAt: new Date("2026-01-01T10:10:00.000Z"),
      currentOnboardingStep: 20,
    }));

    const state = await getOnboardingState("user-1");

    expect(state).toMatchObject({
      status: OnboardingStatus.NOT_STARTED,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      currentOnboardingStep: 0,
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
    });
  });

  it("persists progress only on the requested authenticated user record", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored({ onboardingStatus: OnboardingStatus.IN_PROGRESS }));
    prismaMock.user.update.mockResolvedValue(stored({
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      currentOnboardingStep: 4,
    }));

    const state = await updateOnboardingProgress("user-1", 4);

    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ currentOnboardingStep: 4 }),
    }));
    expect(state?.currentOnboardingStep).toBe(4);
  });

  it("starts and can later restart the current onboarding version", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(stored())
      .mockResolvedValueOnce(stored({ onboardingStatus: OnboardingStatus.COMPLETED }));
    prismaMock.user.update
      .mockResolvedValueOnce(stored({
        onboardingStatus: OnboardingStatus.IN_PROGRESS,
        onboardingStartedAt: new Date("2026-07-18T10:00:00.000Z"),
      }))
      .mockResolvedValueOnce(stored());

    const started = await startOnboarding("user-1");
    const restarted = await restartOnboarding("user-1");

    expect(started?.status).toBe(OnboardingStatus.IN_PROGRESS);
    expect(shouldResumeOnboardingTour(started!)).toBe(true);
    expect(restarted?.status).toBe(OnboardingStatus.NOT_STARTED);
    expect(shouldPresentOnboardingWelcome(restarted!)).toBe(true);
  });
});
