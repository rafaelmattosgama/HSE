import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    TRANSLATION_PROVIDER: "disabled",
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL: "claude-sonnet-5-5",
    ANTHROPIC_TRANSLATION_MODEL: undefined,
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_TRANSLATION_MODEL: "gpt-5.2",
  },
}));

import {
  AnthropicTranslationProvider,
  TranslationProviderError,
} from "@/lib/services/translation-provider";

function fakeClient(response: { stop_reason: string; text?: string }) {
  const create = vi.fn().mockResolvedValue({
    stop_reason: response.stop_reason,
    content: response.text === undefined ? [] : [{ type: "text", text: response.text }],
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

describe("AnthropicTranslationProvider", () => {
  it("translates a batch with structured output and the configured model", async () => {
    const { client, create } = fakeClient({
      stop_reason: "end_turn",
      text: JSON.stringify({ translations: ["Escorregadela", " "] }),
    });
    const provider = new AnthropicTranslationProvider(client);

    const result = await provider.translateBatch({
      targetLocale: "pt",
      texts: ["Slip", "ACT-12"],
      purpose: "viewer",
    });

    // Empty translations fall back to the original text.
    expect(result).toEqual(["Escorregadela", "ACT-12"]);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.output_config.format).toBeDefined();
    expect(JSON.parse(request.messages[0].content)).toEqual({
      targetLanguage: "pt",
      texts: ["Slip", "ACT-12"],
    });
  });

  it("rejects a batch with the wrong number of translations", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      text: JSON.stringify({ translations: ["only one"] }),
    });
    await expect(
      new AnthropicTranslationProvider(client).translateBatch({
        targetLocale: "pt",
        texts: ["a", "b"],
        purpose: "master-data",
      }),
    ).rejects.toBeInstanceOf(TranslationProviderError);
  });

  it("maps detected locales and turns unknown into null", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      text: JSON.stringify({ locales: ["it", "unknown"] }),
    });
    await expect(
      new AnthropicTranslationProvider(client).detectLocales(["Carrello elevatore", "PL01"]),
    ).resolves.toEqual(["it", null]);
  });

  it("fails clearly on refusal, truncation or a missing API key", async () => {
    const refusal = fakeClient({ stop_reason: "refusal" });
    await expect(
      new AnthropicTranslationProvider(refusal.client).detectLocales(["x"]),
    ).rejects.toThrow("refused");

    const truncated = fakeClient({ stop_reason: "max_tokens", text: "{" });
    await expect(
      new AnthropicTranslationProvider(truncated.client).detectLocales(["x"]),
    ).rejects.toThrow("truncated");

    await expect(new AnthropicTranslationProvider().detectLocales(["x"])).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured",
    );
  });

  it("skips the API for empty input", async () => {
    const { client, create } = fakeClient({ stop_reason: "end_turn", text: "{}" });
    const provider = new AnthropicTranslationProvider(client);
    await expect(provider.translateBatch({ targetLocale: "pt", texts: [], purpose: "viewer" })).resolves.toEqual([]);
    await expect(provider.detectLocales([])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
