import { describe, expect, it } from "vitest";
import {
  createEmptySifPsifDecision,
  getActivePsifExposureKey,
  getSifPsifResult,
  getVisibleSifPsifExposureKeys,
} from "@/lib/sewo-sif-psif";

describe("SIF / PSIF decision tree", () => {
  it("classifies an actual serious injury or fatality as SIF", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "YES";

    expect(getSifPsifResult(decision)).toBe("SIF");
  });

  it("classifies an exposure with positive reasonability as PSIF", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "NO";
    decision.exposures.mobileEquipment = "YES";
    decision.oneWhatIfAway = "YES";

    expect(getSifPsifResult(decision)).toBe("PSIF");
  });

  it("classifies no exposures as no PSIF", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "NO";
    Object.keys(decision.exposures).forEach((key) => {
      decision.exposures[key as keyof typeof decision.exposures] = "NO";
    });

    expect(getSifPsifResult(decision)).toBe("NO_PSIF");
  });

  it("stays pending until reasonability is answered for a PSIF exposure", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "NO";
    decision.exposures.workAtHeight = "YES";

    expect(getSifPsifResult(decision)).toBe("PENDING");
  });

  it("reveals PSIF exposure questions one by one while previous answers are no", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "NO";

    expect(getVisibleSifPsifExposureKeys(decision)).toEqual(["suspendedLoad"]);

    decision.exposures.suspendedLoad = "NO";

    expect(getVisibleSifPsifExposureKeys(decision)).toEqual(["suspendedLoad", "mobileEquipment"]);
  });

  it("opens reasonability on the selected yes exposure and stops the exposure sequence", () => {
    const decision = createEmptySifPsifDecision();
    decision.actualSif = "NO";
    decision.exposures.suspendedLoad = "NO";
    decision.exposures.mobileEquipment = "YES";
    decision.exposures.energyIsolation = "NO";

    expect(getVisibleSifPsifExposureKeys(decision)).toEqual(["suspendedLoad", "mobileEquipment"]);
    expect(getActivePsifExposureKey(decision)).toBe("mobileEquipment");
  });
});
