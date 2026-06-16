import { describe, expect, it } from "vitest";
import {
  gerarCodigoAbreviado,
  gerarCodigoCompleto,
  gerarCodigoSewo,
  getCommunicationRecordType,
} from "@/lib/record-code";

describe("record code generation", () => {
  it("generates communication/report and S-EWO codes with two digit sequence padding", () => {
    expect(gerarCodigoCompleto("UC", "MAAP", 2026, 1)).toBe("UC_MAAP_2026_01");
    expect(gerarCodigoAbreviado(2026, 1)).toBe("#202601");
    expect(gerarCodigoSewo("MAAP", "UC", 2026, 1)).toBe("sewo_MAAPUC202601");
  });

  it("keeps larger sequence numbers without truncating them", () => {
    expect(gerarCodigoCompleto("FA", "LIS", 2026, 12)).toBe("FA_LIS_2026_12");
    expect(gerarCodigoAbreviado(2026, 12)).toBe("#202612");
    expect(gerarCodigoSewo("LIS", "FA", 2026, 12)).toBe("sewo_LISFA202612");
  });

  it("supports 5S and improvement suggestion communication codes", () => {
    expect(getCommunicationRecordType("FIVE_S_IMPROVEMENT")).toBe("5S");
    expect(getCommunicationRecordType("IMPROVEMENT_SUGGESTION")).toBe("IMP");
    expect(gerarCodigoCompleto("5S", "MAAP", 2026, 1)).toBe("5S_MAAP_2026_01");
    expect(gerarCodigoCompleto("IMP", "MAAP", 2026, 2)).toBe("IMP_MAAP_2026_02");
    expect(gerarCodigoSewo("MAAP", "5S", 2026, 1)).toBe("sewo_MAAP5S202601");
    expect(gerarCodigoSewo("MAAP", "IMP", 2026, 2)).toBe("sewo_MAAPIMP202602");
  });
});
