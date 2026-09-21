export type DashboardPyramidLevel = "unsafeAct" | "unsafeCondition" | "nearMiss" | "firstAid" | "minorInjury" | "seriousInjury" | "fatal";

export function getDashboardPyramidLevel(row: { type: string; classification: string | null }): DashboardPyramidLevel | null {
  switch (row.type) {
    case "UNSAFE_ACT": return "unsafeAct";
    case "UNSAFE_CONDITION": return "unsafeCondition";
    case "NEAR_MISS": return "nearMiss";
    case "FIRST_AID": return "firstAid";
    case "ACCIDENT":
      return row.classification === "MINOR" ? "minorInjury" : row.classification === "SERIOUS" ? "seriousInjury" : row.classification === "FATAL" ? "fatal" : null;
    default: return null;
  }
}
