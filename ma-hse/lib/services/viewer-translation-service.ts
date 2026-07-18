import crypto from "node:crypto";
import { getTranslationProvider } from "@/lib/services/translation-provider";

const SUPPORTED_LOCALES = new Set(["pt", "it", "en", "pl", "de", "ro", "fr"]);
const TRANSLATION_BATCH_SIZE = 20;

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
    let translations = batch;

    try {
      translations = await getTranslationProvider().translateBatch({
        targetLocale: normalizedLocale,
        texts: batch,
        purpose: "viewer",
      });
    } catch {
      // UI rendering must remain available while the optional provider is unavailable.
    }

    batch.forEach((text, batchIndex) => {
      translationCache.set(cacheKey(normalizedLocale, text), translations[batchIndex] ?? text);
    });
  }

  return input.map((text) => {
    if (!shouldTranslate(text)) return text;
    return translationCache.get(cacheKey(normalizedLocale, text)) ?? text;
  });
}
