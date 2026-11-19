import type { OnboardingTaskCondition } from "@/components/onboarding/onboarding-types";

/** Route pattern match: "*" is exactly one path segment, a trailing "/**" is any (or no) suffix. */
export function routePatternMatches(pattern: string, pathname: string) {
  const source = pattern
    .split("/")
    .map((segment) => (segment === "**" ? "§§" : segment === "*" ? "§" : segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("/")
    .replace("/§§", "(?:/.*)?")
    .replaceAll("§", "[^/]+");
  return new RegExp(`^${source}$`).test(pathname);
}

/** A practical task is done when every part of its condition holds (and it has at least one). */
export function isTaskComplete(condition: OnboardingTaskCondition, pathname: string, doc: Pick<Document, "querySelector">) {
  if (condition.route && !routePatternMatches(condition.route, pathname)) return false;
  if (condition.element && !doc.querySelector(condition.element)) return false;
  return Boolean(condition.route || condition.element);
}
