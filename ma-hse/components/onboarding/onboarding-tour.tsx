"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import { waitForOnboardingElement } from "@/components/onboarding/onboarding-dom";
import { formatOnboardingCopy, type OnboardingTourCopy } from "@/components/onboarding/onboarding-i18n";
import type { OnboardingStep } from "@/components/onboarding/onboarding-types";
import { isTaskComplete } from "@/components/onboarding/task-condition";

/** Steps anchored on "body" are shown as a centered popover, without highlighting the page. */
const PAGE_LEVEL_ELEMENT = "body";

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
  // Each step navigates to its page at most once: task steps then let the user leave it, and a
  // page that redirects elsewhere (e.g. no access) makes the step skip instead of looping.
  const navigatedStepRef = useRef<number | null>(null);
  // Task in progress whose highlighted element is not on the current page: shown as a small card.
  const [pendingTask, setPendingTask] = useState<{ index: number; step: OnboardingStep } | null>(null);

  useEffect(() => {
    if (!active) {
      driverRef.current?.destroy();
      driverRef.current = null;
      terminalActionRef.current = false;
      navigatedStepRef.current = null;
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
    const stepIndex = Math.max(0, currentStep);
    const step = steps[stepIndex];
    const task = step.completeWhen;
    const isLast = stepIndex === steps.length - 1;
    const advance = () => {
      if (isLast) onComplete();
      else onMove(stepIndex + 1);
    };

    if (step.route && !routeMatches(pathname, step.route) && navigatedStepRef.current !== stepIndex) {
      driverRef.current?.destroy();
      driverRef.current = null;
      navigatedStepRef.current = stepIndex;
      router.push(step.route);
      return;
    }
    navigatedStepRef.current = stepIndex;

    const abortController = new AbortController();
    let disposed = false;

    // Practical task: advance as soon as its condition holds, on any page.
    let taskInterval: number | undefined;
    let taskObserver: MutationObserver | undefined;
    if (task) {
      const check = () => {
        if (disposed || !isTaskComplete(task, window.location.pathname, document)) return;
        disposed = true;
        driverRef.current?.destroy();
        driverRef.current = null;
        setPendingTask(null);
        advance();
      };
      taskInterval = window.setInterval(check, 500);
      taskObserver = new MutationObserver(check);
      taskObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    }

    void waitForOnboardingElement(step.element, { signal: abortController.signal }).then((element) => {
      if (disposed) return;

      if (!element) {
        if (task) {
          driverRef.current?.destroy();
          driverRef.current = null;
          setPendingTask({ index: stepIndex, step });
          return;
        }
        advance();
        return;
      }

      setPendingTask(null);
      const isFirst = stepIndex === 0;
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
            current: stepIndex + 1,
            total: steps.length,
          });
          popover.progress.setAttribute("aria-live", "polite");
          popover.closeButton.setAttribute("aria-label", copy.exit);
          popover.closeButton.setAttribute("title", copy.exit);
        },
        onPrevClick() {
          instance.destroy();
          onMove(Math.max(0, stepIndex - 1));
        },
        onNextClick() {
          // On a task step this is "Skip task".
          instance.destroy();
          advance();
        },
        onCloseClick() {
          instance.destroy();
          onExit();
        },
      });

      driverRef.current?.destroy();
      driverRef.current = instance;
      instance.highlight({
        element: step.element === PAGE_LEVEL_ELEMENT ? undefined : element,
        popover: {
          title: step.title,
          description: step.description,
          align: "start",
          showButtons: ["previous", "next", "close"],
          disableButtons: isFirst ? ["previous"] : [],
          showProgress: true,
          prevBtnText: copy.previous,
          nextBtnText: task ? copy.skipTask : isLast ? copy.finish : copy.next,
        },
      });
    });

    return () => {
      disposed = true;
      abortController.abort();
      if (taskInterval !== undefined) window.clearInterval(taskInterval);
      taskObserver?.disconnect();
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [active, copy, currentStep, onComplete, onExit, onMove, pathname, router, steps]);

  if (!active || !pendingTask || pendingTask.index !== currentStep) return null;
  const isLastTask = pendingTask.index === steps.length - 1;
  return (
    <div
      role="status"
      aria-live="polite"
      data-no-translate
      className="fixed bottom-4 right-4 z-[10001] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-300 bg-white p-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.2)]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        {formatOnboardingCopy(copy.progress, { current: pendingTask.index + 1, total: steps.length })}
      </p>
      <p className="mt-1 font-semibold text-slate-900">{pendingTask.step.title}</p>
      <p className="mt-1 text-slate-600">{pendingTask.step.description}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="app-toolbar" onClick={onExit}>
          {copy.exit}
        </button>
        <button
          type="button"
          className="app-toolbar"
          onClick={() => {
            setPendingTask(null);
            if (isLastTask) onComplete();
            else onMove(pendingTask.index + 1);
          }}
        >
          {copy.skipTask}
        </button>
      </div>
    </div>
  );
}
