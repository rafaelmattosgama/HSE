"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { waitForOnboardingElement } from "@/components/onboarding/onboarding-dom";
import { formatOnboardingCopy, type OnboardingTourCopy } from "@/components/onboarding/onboarding-i18n";
import type { OnboardingStep } from "@/components/onboarding/onboarding-types";

function routeMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function OnboardingTour({
  active,
  currentStep,
  steps,
  copy,
  onMove,
  onComplete,
  onExit,
}: {
  active: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  copy: OnboardingTourCopy;
  onMove: (step: number) => void;
  onComplete: () => void;
  onExit: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const driverRef = useRef<Driver | null>(null);
  const terminalActionRef = useRef(false);

  useEffect(() => {
    if (!active) {
      driverRef.current?.destroy();
      driverRef.current = null;
      terminalActionRef.current = false;
      return;
    }

    if (!steps.length || currentStep >= steps.length) {
      if (!terminalActionRef.current) {
        terminalActionRef.current = true;
        onComplete();
      }
      return;
    }

    terminalActionRef.current = false;
    const step = steps[Math.max(0, currentStep)];
    if (step.route && !routeMatches(pathname, step.route)) {
      driverRef.current?.destroy();
      driverRef.current = null;
      router.push(step.route);
      return;
    }

    const abortController = new AbortController();
    let disposed = false;

    void waitForOnboardingElement(step.element, { signal: abortController.signal }).then((element) => {
      if (disposed) return;

      if (!element) {
        if (currentStep >= steps.length - 1) onComplete();
        else onMove(currentStep + 1);
        return;
      }

      const isFirst = currentStep === 0;
      const isLast = currentStep === steps.length - 1;
      const instance = driver({
        animate: true,
        smoothScroll: true,
        allowClose: false,
        allowScroll: true,
        allowKeyboardControl: true,
        disableActiveInteraction: false,
        overlayColor: "#020617",
        overlayOpacity: 0.62,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "ma-hse-onboarding-popover",
        onPopoverRender(popover) {
          popover.wrapper.setAttribute("role", "dialog");
          popover.wrapper.setAttribute("aria-modal", "true");
          popover.wrapper.setAttribute("data-no-translate", "");
          popover.wrapper.setAttribute("aria-label", formatOnboardingCopy(copy.dialogLabel, { title: step.title }));
          popover.progress.textContent = formatOnboardingCopy(copy.progress, {
            current: currentStep + 1,
            total: steps.length,
          });
          popover.progress.setAttribute("aria-live", "polite");
          popover.closeButton.setAttribute("aria-label", copy.exit);
          popover.closeButton.setAttribute("title", copy.exit);
        },
        onPrevClick() {
          instance.destroy();
          onMove(Math.max(0, currentStep - 1));
        },
        onNextClick() {
          instance.destroy();
          if (isLast) onComplete();
          else onMove(currentStep + 1);
        },
        onCloseClick() {
          instance.destroy();
          onExit();
        },
      });

      driverRef.current?.destroy();
      driverRef.current = instance;
      instance.highlight({
        element,
        popover: {
          title: step.title,
          description: step.description,
          align: "start",
          showButtons: ["previous", "next", "close"],
          disableButtons: isFirst ? ["previous"] : [],
          showProgress: true,
          prevBtnText: copy.previous,
          nextBtnText: isLast ? copy.finish : copy.next,
        },
      });
    });

    return () => {
      disposed = true;
      abortController.abort();
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [active, copy, currentStep, onComplete, onExit, onMove, pathname, router, steps]);

  return null;
}
