import { describe, expect, it } from "vitest";
import { resolveUiLocale } from "@/lib/server-ui-language";

describe("resolveUiLocale", () => {
  it("uses the user language before stale locale cookies", () => {
    expect(
      resolveUiLocale({
        userLanguage: "pt",
        cookieLocale: "en",
        plantLanguage: "de",
        requestLocale: "fr",
      }),
    ).toBe("pt");
  });

  it("falls back through cookie, plant and request locales", () => {
    expect(resolveUiLocale({ cookieLocale: "it", plantLanguage: "de", requestLocale: "fr" })).toBe("it");
    expect(resolveUiLocale({ plantLanguage: "de", requestLocale: "fr" })).toBe("de");
    expect(resolveUiLocale({ requestLocale: "fr" })).toBe("fr");
  });

  it("normalizes unsupported values to English", () => {
    expect(resolveUiLocale({ userLanguage: "unsupported" })).toBe("en");
  });
});
