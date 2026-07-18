"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getOnboardingSteps } from "@/components/onboarding/onboarding-config";
import { getOnboardingCopy } from "@/components/onboarding/onboarding-i18n";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import type { OnboardingState, OnboardingUserContext } from "@/components/onboarding/onboarding-types";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";

type OnboardingContextValue = {
  restartOnboarding: () => Promise<void>;
  restarting: boolean;
  restartLabel: string;
  restartingLabel: string;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

async function onboardingRequest(path: string, init?: RequestInit): Promise<OnboardingState> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error("ONBOARDING_REQUEST_FAILED");
  }

  return payload.data as OnboardingState;
}

export function OnboardingProvider({
  children,
  userContext,
}: {
  children: React.ReactNode;
  userContext: OnboardingUserContext;
}) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const progressSequenceRef = useRef(0);
  const copy = useMemo(() => getOnboardingCopy(userContext.locale), [userContext.locale]);
  const steps = useMemo(() => getOnboardingSteps(userContext), [userContext]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void onboardingRequest("/api/me/onboarding")
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch(() => {
        if (!cancelled) setError(copy.requestError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy.requestError]);

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setState(await onboardingRequest("/api/me/onboarding/start", { method: "POST" }));
    } catch {
      setError(copy.requestError);
    } finally {
      setBusy(false);
    }
  }, [copy.requestError]);

  const dismiss = useCallback(async () => {
    progressSequenceRef.current += 1;
    setBusy(true);
    setError("");
    try {
      setState(await onboardingRequest("/api/me/onboarding/dismiss", { method: "POST" }));
    } catch {
      setError(copy.requestError);
    } finally {
      setBusy(false);
    }
  }, [copy.requestError]);

  const move = useCallback((step: number) => {
    const requestSequence = ++progressSequenceRef.current;
    setState((current) => current ? { ...current, currentOnboardingStep: step } : current);
    void onboardingRequest("/api/me/onboarding/progress", {
      method: "PATCH",
      body: JSON.stringify({ step }),
    })
      .then((persisted) => {
        setState((current) => {
          if (requestSequence !== progressSequenceRef.current || current?.status !== "IN_PROGRESS") return current;
          return persisted;
        });
      })
      .catch(() => {
        setError(copy.requestError);
      });
  }, [copy.requestError]);

  const complete = useCallback(async () => {
    progressSequenceRef.current += 1;
    setBusy(true);
    setError("");
    try {
      setState(await onboardingRequest("/api/me/onboarding/complete", { method: "POST" }));
    } catch {
      setError(copy.requestError);
    } finally {
      setBusy(false);
    }
  }, [copy.requestError]);

  const restart = useCallback(async () => {
    progressSequenceRef.current += 1;
    setBusy(true);
    setError("");
    try {
      const nextState = await onboardingRequest("/api/me/onboarding/restart", { method: "POST" });
      setState(nextState);
    } catch {
      setError(copy.requestError);
      throw new Error(copy.requestError);
    } finally {
      setBusy(false);
    }
  }, [copy.requestError]);

  const contextValue = useMemo(() => ({
    restartOnboarding: restart,
    restarting: busy,
    restartLabel: copy.menu.restart,
    restartingLabel: copy.menu.restarting,
  }), [busy, copy.menu.restart, copy.menu.restarting, restart]);
  const welcomeOpen = !loading && state?.status === "NOT_STARTED";
  const tourActive = !loading && state?.status === "IN_PROGRESS";

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
      <WelcomeModal open={welcomeOpen} busy={busy} error={error} copy={copy.welcome} onStart={start} onDismiss={dismiss} />
      <OnboardingTour
        active={tourActive}
        currentStep={state?.currentOnboardingStep ?? 0}
        steps={steps}
        copy={copy.tour}
        onMove={move}
        onComplete={complete}
        onExit={dismiss}
      />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used within OnboardingProvider");
  return context;
}
