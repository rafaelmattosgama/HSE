import { CommunicationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSifPsifIndicatorBreakdown } from "@/lib/sif-psif-indicators";

const noPsifDecision = {
  actualSif: "NO",
  exposures: {
    suspendedLoad: "NO",
    mobileEquipment: "NO",
    energyIsolation: "NO",
    workAtHeight: "NO",
    movingEquipment: "NO",
    confinedSpace: "NO",
    significantMassEnergy: "NO",
  },
};

describe("SIF / PSIF dashboard indicators", () => {
  it("counts each eligible communication once and keeps pending classifications in the denominator", () => {
    const result = buildSifPsifIndicatorBreakdown([
      {
        id: "first-aid-sif",
        type: CommunicationType.FIRST_AID,
        sewoRecords: [{ templateData: { sifPsifDecision: { actualSif: "YES" } } }],
      },
      {
        id: "first-aid-no-psif",
        type: CommunicationType.FIRST_AID,
        sewoRecords: [{ templateData: { sifPsifDecision: noPsifDecision } }],
      },
      {
        id: "near-miss-psif",
        type: CommunicationType.NEAR_MISS,
        sewoRecords: [{
          templateData: {
            sifPsifDecision: {
              actualSif: "NO",
              exposures: { mobileEquipment: "YES" },
              oneWhatIfAway: "YES",
            },
          },
        }],
      },
      {
        id: "injury-pending",
        type: CommunicationType.ACCIDENT,
        sewoRecords: [{ templateData: {} }],
      },
    ]);

    expect(result.overall).toMatchObject({
      total: 4,
      sif: 1,
      psif: 1,
      sifOrPsif: 2,
      sifPercent: 25,
      psifPercent: 25,
      sifOrPsifPercent: 50,
    });
    expect(result.byCategory.FIRST_AID).toMatchObject({ total: 2, sif: 1, psif: 0, sifOrPsif: 1, sifOrPsifPercent: 50 });
    expect(result.byCategory.NEAR_MISS).toMatchObject({ total: 1, sif: 0, psif: 1, sifOrPsif: 1, sifOrPsifPercent: 100 });
    expect(result.byCategory.ACCIDENT).toMatchObject({ total: 1, sif: 0, psif: 0, sifOrPsif: 0, sifOrPsifPercent: 0 });
  });

  it("uses no data when no eligible closed S-EWO incident exists", () => {
    const result = buildSifPsifIndicatorBreakdown([]);

    expect(result.overall).toMatchObject({ total: 0, sifPercent: null, psifPercent: null, sifOrPsifPercent: null });
  });
});
