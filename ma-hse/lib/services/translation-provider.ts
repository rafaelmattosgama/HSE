import { env } from "@/lib/env";
import { locales, type AppLocale } from "@/lib/i18n/routing";

export type TranslationPurpose = "viewer" | "master-data";

export type TranslationBatchInput = {
  targetLocale: string;
  texts: string[];
  purpose: TranslationPurpose;
};

export interface TranslationProvider {
  translateBatch(input: TranslationBatchInput): Promise<string[]>;
  detectLocales(texts: string[]): Promise<Array<AppLocale | null>>;
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

type LanguageDetectionResponse = {
  locales: Array<AppLocale | "unknown">;
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

  async detectLocales(): Promise<Array<AppLocale | null>> {
    throw new TranslationProviderError("Translation provider is disabled");
  }
}

class OpenAiTranslationProvider implements TranslationProvider {
  private async requestStructured<T>(input: {
    systemPrompt: string;
    payload: Record<string, unknown>;
    schemaName: string;
    schema: Record<string, unknown>;
  }) {
    if (!env.OPENAI_API_KEY) {
      throw new TranslationProviderError("OPENAI_API_KEY is not configured");
    }

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
              content: [{ type: "input_text", text: input.systemPrompt }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify(input.payload),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName,
              schema: input.schema,
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

      return JSON.parse(outputText) as T;
    } catch (error) {
      if (error instanceof TranslationProviderError) throw error;
      throw new TranslationProviderError("Translation provider request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async translateBatch(input: TranslationBatchInput) {
    if (input.texts.length === 0) return [];

    const parsed = await this.requestStructured<TranslationResponse>({
      systemPrompt: SYSTEM_PROMPTS[input.purpose],
      payload: {
        targetLanguage: input.targetLocale,
        texts: input.texts,
      },
      schemaName: "translation_batch",
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
    });

    if (!Array.isArray(parsed.translations) || parsed.translations.length !== input.texts.length) {
      throw new TranslationProviderError("Translation provider returned an invalid batch");
    }

    return parsed.translations.map((value, index) => value?.trim() || input.texts[index]);
  }

  async detectLocales(texts: string[]) {
    if (texts.length === 0) return [];

    const parsed = await this.requestStructured<LanguageDetectionResponse>({
      systemPrompt:
        "Detect the source language of each Plant Master Data value. Return the matching locale code only when it is one of pt, it, en, pl, de, ro or fr. Return unknown for codes, acronyms, proper names, product names, technical references or ambiguous text. Do not translate or rewrite the input.",
      payload: { texts },
      schemaName: "master_data_language_detection",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          locales: {
            type: "array",
            items: { type: "string", enum: [...locales, "unknown"] },
            minItems: texts.length,
            maxItems: texts.length,
          },
        },
        required: ["locales"],
      },
    });

    if (!Array.isArray(parsed.locales) || parsed.locales.length !== texts.length) {
      throw new TranslationProviderError("Translation provider returned an invalid language detection batch");
    }

    return parsed.locales.map((locale) =>
      locales.includes(locale as AppLocale) ? (locale as AppLocale) : null,
    );
  }
}

const provider: TranslationProvider =
  env.TRANSLATION_PROVIDER === "disabled"
    ? new DisabledTranslationProvider()
    : new OpenAiTranslationProvider();

export function getTranslationProvider() {
  return provider;
}
