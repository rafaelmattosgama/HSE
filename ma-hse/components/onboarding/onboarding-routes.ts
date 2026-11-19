/** Fills "{plant}" in an onboarding route; steps that need a plant are dropped (undefined) without one. */
export function resolveOnboardingRoute(route: string | undefined, plantCode: string | null) {
  if (!route) return undefined;
  if (!route.includes("{plant}")) return route;
  return plantCode ? route.replaceAll("{plant}", encodeURIComponent(plantCode)) : undefined;
}
