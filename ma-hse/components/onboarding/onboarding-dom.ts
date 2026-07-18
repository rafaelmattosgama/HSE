type WaitForElementOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function waitForOnboardingElement(
  selector: string,
  { timeoutMs = 3000, signal }: WaitForElementOptions = {},
): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);
  if (signal?.aborted) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (element: Element | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve(element);
    };
    const onAbort = () => finish(null);
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) finish(element);
    });
    const timeout = window.setTimeout(() => finish(document.querySelector(selector)), timeoutMs);

    observer.observe(document.documentElement, { childList: true, subtree: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
