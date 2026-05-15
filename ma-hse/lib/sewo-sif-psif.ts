export const SIF_PSIF_EXPOSURE_KEYS = [
  "suspendedLoad",
  "mobileEquipment",
  "energyIsolation",
  "workAtHeight",
  "movingEquipment",
  "confinedSpace",
  "significantMassEnergy",
] as const;

export type SifPsifExposureKey = (typeof SIF_PSIF_EXPOSURE_KEYS)[number];
export type YesNoAnswer = "YES" | "NO" | "";
export type SifPsifResult = "SIF" | "PSIF" | "NO_PSIF" | "PENDING";

export type SifPsifDecision = {
  actualSif: YesNoAnswer;
  exposures: Record<SifPsifExposureKey, YesNoAnswer>;
  repeatedSifPotential: YesNoAnswer;
  oneWhatIfAway: YesNoAnswer;
  noPsifExplanation: string;
};

export function createEmptySifPsifDecision(): SifPsifDecision {
  return {
    actualSif: "",
    exposures: {
      suspendedLoad: "",
      mobileEquipment: "",
      energyIsolation: "",
      workAtHeight: "",
      movingEquipment: "",
      confinedSpace: "",
      significantMassEnergy: "",
    },
    repeatedSifPotential: "",
    oneWhatIfAway: "",
    noPsifExplanation: "",
  };
}

export function hasPsifExposure(decision: SifPsifDecision) {
  return SIF_PSIF_EXPOSURE_KEYS.some((key) => decision.exposures[key] === "YES");
}

export function allPsifExposuresAnsweredNo(decision: SifPsifDecision) {
  return SIF_PSIF_EXPOSURE_KEYS.every((key) => decision.exposures[key] === "NO");
}

export function getVisibleSifPsifExposureKeys(decision: SifPsifDecision): SifPsifExposureKey[] {
  if (decision.actualSif !== "NO") return [];

  const visibleKeys: SifPsifExposureKey[] = [];

  for (const key of SIF_PSIF_EXPOSURE_KEYS) {
    visibleKeys.push(key);

    if (decision.exposures[key] !== "NO") {
      break;
    }
  }

  return visibleKeys;
}

export function getActivePsifExposureKey(decision: SifPsifDecision): SifPsifExposureKey | null {
  const visibleKeys = getVisibleSifPsifExposureKeys(decision);
  const lastVisibleKey = visibleKeys[visibleKeys.length - 1];

  return lastVisibleKey && decision.exposures[lastVisibleKey] === "YES" ? lastVisibleKey : null;
}

export function getSifPsifResult(decision: SifPsifDecision): SifPsifResult {
  if (decision.actualSif === "YES") return "SIF";
  if (decision.actualSif !== "NO") return "PENDING";
  if (allPsifExposuresAnsweredNo(decision)) return "NO_PSIF";
  if (!hasPsifExposure(decision)) return "PENDING";
  if (decision.repeatedSifPotential === "YES" || decision.oneWhatIfAway === "YES") return "PSIF";
  if (decision.repeatedSifPotential === "NO" && decision.oneWhatIfAway === "NO") return "NO_PSIF";

  return "PENDING";
}
