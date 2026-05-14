import crypto from "node:crypto";
import { env } from "@/lib/env";

const SUPPORTED_LOCALES = new Set(["pt", "it", "en", "pl", "de", "ro", "fr"]);
const TRANSLATION_BATCH_SIZE = 20;

type TranslationResponse = {
  translations: string[];
};

declare global {
  var __viewerTranslationCache: Map<string, string> | undefined;
}

const translationCache = globalThis.__viewerTranslationCache ?? new Map<string, string>();
if (!globalThis.__viewerTranslationCache) {
  globalThis.__viewerTranslationCache = translationCache;
}

function normalizeLocale(locale: string) {
  return SUPPORTED_LOCALES.has(locale) ? locale : "en";
}

function cacheKey(locale: string, text: string) {
  return `${locale}:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

function shouldTranslate(text: string) {
  return text.trim().length >= 2;
}

async function requestTranslations(locale: string, texts: string[]) {
  if (!env.OPENAI_API_KEY || texts.length === 0) {
    return texts;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
            content: [
              {
                type: "input_text",
                text: "You translate workplace safety free-text fields for UI display. Translate each input into the target language while preserving meaning, tone, line breaks, bullet structure, IDs, people names, company names, codes, acronyms and dates. If text is already in the target language, return it unchanged. Return only the JSON schema output.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  targetLanguage: locale,
                  texts,
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
                  minItems: texts.length,
                  maxItems: texts.length,
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
      return texts;
    }

    const json = (await response.json()) as { output_text?: string };
    if (!json.output_text) {
      return texts;
    }

    const parsed = JSON.parse(json.output_text) as TranslationResponse;
    if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length) {
      return texts;
    }

    return parsed.translations;
  } catch {
    return texts;
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateForViewer(locale: string, texts: Array<string | null | undefined>) {
  const normalizedLocale = normalizeLocale(locale);
  const input = texts.map((value) => value ?? "");
  const uniqueToTranslate: string[] = [];
  const pendingKeys = new Set<string>();

  for (const text of input) {
    if (!shouldTranslate(text)) continue;
    const key = cacheKey(normalizedLocale, text);
    if (!translationCache.has(key) && !pendingKeys.has(key)) {
      pendingKeys.add(key);
      uniqueToTranslate.push(text);
    }
  }

  for (let index = 0; index < uniqueToTranslate.length; index += TRANSLATION_BATCH_SIZE) {
    const batch = uniqueToTranslate.slice(index, index + TRANSLATION_BATCH_SIZE);
    const translations = await requestTranslations(normalizedLocale, batch);
    batch.forEach((text, batchIndex) => {
      translationCache.set(cacheKey(normalizedLocale, text), translations[batchIndex] ?? text);
    });
  }

  return input.map((text) => {
    if (!shouldTranslate(text)) return text;
    return translationCache.get(cacheKey(normalizedLocale, text)) ?? text;
  });
}
