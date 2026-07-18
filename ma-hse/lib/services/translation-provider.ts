import { env } from "@/lib/env";

export type TranslationPurpose = "viewer" | "master-data";

export type TranslationBatchInput = {
  targetLocale: string;
  texts: string[];
  purpose: TranslationPurpose;
};

export interface TranslationProvider {
  translateBatch(input: TranslationBatchInput): Promise<string[]>;
}

export class TranslationProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TranslationProviderError";
  }
}

type TranslationResponse = {
  translations: string[];
};

type OpenAiResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function getOpenAiResponseText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) return payload.output_text;
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text?.trim())
    ?.text;
}

const SYSTEM_PROMPTS: Record<TranslationPurpose, string> = {
  viewer:
    "Translate workplace safety UI text into the target language. Preserve meaning, tone, line breaks, bullet structure, IDs, people names, company names, codes, acronyms and dates. If text is already in the target language, return it unchanged. Return only the requested JSON schema output.",
  "master-data":
    "Translate Plant Master Data names into the target language. Never translate or alter internal codes, identifiers, technical references, proper names, product names or acronyms. Keep established workplace-safety terminology natural and concise. If a value is already in the target language, return it unchanged. Return only the requested JSON schema output.",
};

class DisabledTranslationProvider implements TranslationProvider {
  async translateBatch(): Promise<string[]> {
    throw new TranslationProviderError("Translation provider is disabled");
  }
}

class OpenAiTranslationProvider implements TranslationProvider {
  async translateBatch(input: TranslationBatchInput) {
    if (!env.OPENAI_API_KEY) {
      throw new TranslationProviderError("OPENAI_API_KEY is not configured");
    }

    if (input.texts.length === 0) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${env.OPENAI_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_TRANSLATION_MODEL,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: SYSTEM_PROMPTS[input.purpose] }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    targetLanguage: input.targetLocale,
                    texts: input.texts,
                  }),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "translation_batch",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  translations: {
                    type: "array",
                    items: { type: "string" },
                    minItems: input.texts.length,
                    maxItems: input.texts.length,
                  },
                },
                required: ["translations"],
              },
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TranslationProviderError(`Translation provider returned HTTP ${response.status}`);
      }

      const json = (await response.json()) as OpenAiResponsePayload;
      const outputText = getOpenAiResponseText(json);
      if (!outputText) {
        throw new TranslationProviderError("Translation provider returned an empty response");
      }

      const parsed = JSON.parse(outputText) as TranslationResponse;
      if (!Array.isArray(parsed.translations) || parsed.translations.length !== input.texts.length) {
        throw new TranslationProviderError("Translation provider returned an invalid batch");
      }

      return parsed.translations.map((value, index) => value?.trim() || input.texts[index]);
    } catch (error) {
      if (error instanceof TranslationProviderError) throw error;
      throw new TranslationProviderError("Translation provider request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

const provider: TranslationProvider =
  env.TRANSLATION_PROVIDER === "disabled"
    ? new DisabledTranslationProvider()
    : new OpenAiTranslationProvider();

export function getTranslationProvider() {
  return provider;
}
