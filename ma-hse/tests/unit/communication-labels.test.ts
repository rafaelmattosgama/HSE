import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/routing";
import { getFixedCommunicationLabels } from "@/lib/communication-labels";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";

describe("fixed communication labels", () => {
  it.each(locales)("localizes improvement types in %s without using 5S's", async (locale) => {
    const fixed = getFixedCommunicationLabels(locale);
    const ui = await getLocalizedCommunicationUi(locale);

    expect(fixed.communicationTypeLabels.FIVE_S_IMPROVEMENT).toContain("5S");
    expect(fixed.communicationTypeLabels.FIVE_S_IMPROVEMENT).not.toMatch(/5S['’]s/i);
    expect(fixed.communicationTypeLabels.IMPROVEMENT_SUGGESTION.trim()).not.toBe("");
    expect(ui.communicationTypeLabels.FIVE_S_IMPROVEMENT).toBe(
      fixed.communicationTypeLabels.FIVE_S_IMPROVEMENT,
    );
    expect(ui.communicationTypeLabels.IMPROVEMENT_SUGGESTION).toBe(
      fixed.communicationTypeLabels.IMPROVEMENT_SUGGESTION,
    );
  });

  it("uses the expected Portuguese and English terminology", () => {
    expect(getFixedCommunicationLabels("pt").communicationTypeLabels).toMatchObject({
      FIVE_S_IMPROVEMENT: "Melhoria 5S",
      IMPROVEMENT_SUGGESTION: "Sugestão de melhoria",
    });
    expect(getFixedCommunicationLabels("en").communicationTypeLabels).toMatchObject({
      FIVE_S_IMPROVEMENT: "5S Improvement",
      IMPROVEMENT_SUGGESTION: "Improvement Suggestion",
    });
  });
});
