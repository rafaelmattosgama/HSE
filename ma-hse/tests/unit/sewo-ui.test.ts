import { describe, expect, it, vi } from "vitest";
import { locales } from "@/lib/i18n/routing";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { getSifPsifInformationCopy } from "@/lib/sewo-ui";

vi.mock("@/lib/services/viewer-translation-service", () => ({
  translateForViewer: vi.fn(async (_locale: string, texts: string[]) => texts),
}));

const EXPECTED_PORTUGUESE_INFORMATION =
  "A árvore classifica o evento pela consequência real e pelo potencial de gravidade. Uma fatalidade ou lesão grave corresponde a um SIF. Quando não existe uma consequência grave, mas o evento envolveu uma exposição capaz de causar realisticamente uma lesão grave ou fatalidade, poderá ser classificado como PSIF. Responda com base nas condições reais do evento e nos controlos existentes.";

describe("SIF/PSIF information copy", () => {
  it("preserves the approved Portuguese content exactly", () => {
    expect(getSifPsifInformationCopy("pt")).toEqual({
      sifPsifInformationTitle: "Classificação SIF / PSIF",
      sifPsifInformationBody: EXPECTED_PORTUGUESE_INFORMATION,
      sifPsifInformationButtonLabel: "Informação sobre a classificação SIF/PSIF",
    });
  });

  it("applies the approved copy through the S-EWO localization service", async () => {
    const { ui } = await getLocalizedSewoUi("pt");

    expect(ui.sifPsifInformationBody).toBe(EXPECTED_PORTUGUESE_INFORMATION);
    expect(ui.sifPsifInformationButtonLabel).toBe("Informação sobre a classificação SIF/PSIF");
  });

  it("provides localized accessible copy for every supported locale", () => {
    locales.forEach((locale) => {
      const copy = getSifPsifInformationCopy(locale);
      expect(copy.sifPsifInformationTitle.trim()).not.toBe("");
      expect(copy.sifPsifInformationBody.trim()).not.toBe("");
      expect(copy.sifPsifInformationButtonLabel.trim()).not.toBe("");
    });
  });

  it("falls back to English for an unsupported locale", () => {
    expect(getSifPsifInformationCopy("unsupported")).toEqual(getSifPsifInformationCopy("en"));
  });
});
