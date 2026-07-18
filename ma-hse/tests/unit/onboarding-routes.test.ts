import { OnboardingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requireAuth: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { CURRENT_ONBOARDING_VERSION } from "@/lib/onboarding";
import { GET } from "@/app/api/me/onboarding/route";
import { POST as start } from "@/app/api/me/onboarding/start/route";
import { PATCH as progress } from "@/app/api/me/onboarding/progress/route";
import { POST as restart } from "@/app/api/me/onboarding/restart/route";

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

function mutationRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("onboarding routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardsMock.requireAuth.mockResolvedValue({ session: { user: { id: "user-1" } } });
  });

  it("requires authentication", async () => {
    guardsMock.requireAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns only the authenticated user's onboarding state", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored({ onboardingStatus: OnboardingStatus.COMPLETED }));

    const response = await GET();
    const payload = await response.json();

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
    expect(payload.data.status).toBe(OnboardingStatus.COMPLETED);
  });

  it("does not accept another user id as the target of progress", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored({ onboardingStatus: OnboardingStatus.IN_PROGRESS }));
    prismaMock.user.update.mockResolvedValue(stored({
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      currentOnboardingStep: 3,
    }));

    const response = await progress(mutationRequest(
      "/api/me/onboarding/progress",
      "PATCH",
      { step: 3, userId: "user-2" },
    ));

    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
    expect(JSON.stringify(prismaMock.user.update.mock.calls)).not.toContain("user-2");
  });

  it("validates progress input", async () => {
    const response = await progress(mutationRequest(
      "/api/me/onboarding/progress",
      "PATCH",
      { step: -1 },
    ));

    expect(response.status).toBe(422);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations", async () => {
    const response = await start(new Request("http://localhost/api/me/onboarding/start", {
      method: "POST",
      headers: { origin: "https://example.invalid", host: "localhost" },
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("restarts only the authenticated user's onboarding", async () => {
    prismaMock.user.findUnique.mockResolvedValue(stored({ onboardingStatus: OnboardingStatus.DISMISSED }));
    prismaMock.user.update.mockResolvedValue(stored());

    const response = await restart(mutationRequest("/api/me/onboarding/restart", "POST"));

    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({
        onboardingStatus: OnboardingStatus.NOT_STARTED,
        currentOnboardingStep: 0,
      }),
    }));
  });
});
