import { OnboardingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CURRENT_ONBOARDING_VERSION = 1;

const onboardingStateSelect = {
  id: true,
  isActive: true,
  onboardingStatus: true,
  onboardingVersion: true,
  onboardingStartedAt: true,
  onboardingCompletedAt: true,
  currentOnboardingStep: true,
} as const;

type StoredOnboardingState = {
  id: string;
  isActive: boolean;
  onboardingStatus: OnboardingStatus;
  onboardingVersion: number;
  onboardingStartedAt: Date | null;
  onboardingCompletedAt: Date | null;
  currentOnboardingStep: number;
};

export type OnboardingState = {
  status: OnboardingStatus;
  onboardingVersion: number;
  currentVersion: number;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  currentOnboardingStep: number;
};

export class OnboardingTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingTransitionError";
  }
}

function normalizeOnboardingState(state: StoredOnboardingState): OnboardingState {
  if (state.onboardingVersion < CURRENT_ONBOARDING_VERSION) {
    return {
      status: OnboardingStatus.NOT_STARTED,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      currentVersion: CURRENT_ONBOARDING_VERSION,
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
      currentOnboardingStep: 0,
    };
  }

  return {
    status: state.onboardingStatus,
    onboardingVersion: state.onboardingVersion,
    currentVersion: CURRENT_ONBOARDING_VERSION,
    onboardingStartedAt: state.onboardingStartedAt?.toISOString() ?? null,
    onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null,
    currentOnboardingStep: Math.max(0, state.currentOnboardingStep),
  };
}

async function findStoredOnboardingState(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: onboardingStateSelect,
  });
}

async function updateStoredOnboardingState(
  userId: string,
  data: {
    onboardingStatus?: OnboardingStatus;
    onboardingVersion?: number;
    onboardingStartedAt?: Date | null;
    onboardingCompletedAt?: Date | null;
    currentOnboardingStep?: number;
  },
) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: onboardingStateSelect,
  });

  return normalizeOnboardingState(updated);
}

export function shouldPresentOnboardingWelcome(state: OnboardingState) {
  return state.status === OnboardingStatus.NOT_STARTED;
}

export function shouldResumeOnboardingTour(state: OnboardingState) {
  return state.status === OnboardingStatus.IN_PROGRESS;
}

export async function getOnboardingState(userId: string) {
  const stored = await findStoredOnboardingState(userId);
  return stored?.isActive ? normalizeOnboardingState(stored) : null;
}

export async function startOnboarding(userId: string) {
  const stored = await findStoredOnboardingState(userId);
  if (!stored?.isActive) return null;

  const current = normalizeOnboardingState(stored);
  if (current.status === OnboardingStatus.IN_PROGRESS) return current;
  if (current.status !== OnboardingStatus.NOT_STARTED) {
    throw new OnboardingTransitionError("Onboarding must be restarted before it can be started again");
  }

  return updateStoredOnboardingState(userId, {
    onboardingStatus: OnboardingStatus.IN_PROGRESS,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingStartedAt: new Date(),
    onboardingCompletedAt: null,
    currentOnboardingStep: 0,
  });
}

export async function updateOnboardingProgress(userId: string, step: number) {
  const stored = await findStoredOnboardingState(userId);
  if (!stored?.isActive) return null;

  const current = normalizeOnboardingState(stored);
  if (current.status !== OnboardingStatus.IN_PROGRESS) {
    throw new OnboardingTransitionError("Onboarding is not in progress");
  }

  return updateStoredOnboardingState(userId, {
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    currentOnboardingStep: step,
  });
}

export async function completeOnboarding(userId: string) {
  const stored = await findStoredOnboardingState(userId);
  if (!stored?.isActive) return null;

  const current = normalizeOnboardingState(stored);
  if (current.status === OnboardingStatus.COMPLETED) return current;
  if (current.status !== OnboardingStatus.IN_PROGRESS) {
    throw new OnboardingTransitionError("Onboarding is not in progress");
  }

  return updateStoredOnboardingState(userId, {
    onboardingStatus: OnboardingStatus.COMPLETED,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingCompletedAt: new Date(),
  });
}

export async function dismissOnboarding(userId: string) {
  const stored = await findStoredOnboardingState(userId);
  if (!stored?.isActive) return null;

  const current = normalizeOnboardingState(stored);
  if (current.status === OnboardingStatus.DISMISSED) return current;
  if (current.status === OnboardingStatus.COMPLETED) {
    throw new OnboardingTransitionError("Completed onboarding must be restarted before it can be dismissed");
  }

  return updateStoredOnboardingState(userId, {
    onboardingStatus: OnboardingStatus.DISMISSED,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingCompletedAt: null,
  });
}

export async function restartOnboarding(userId: string) {
  const stored = await findStoredOnboardingState(userId);
  if (!stored?.isActive) return null;

  return updateStoredOnboardingState(userId, {
    onboardingStatus: OnboardingStatus.NOT_STARTED,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    currentOnboardingStep: 0,
  });
}
