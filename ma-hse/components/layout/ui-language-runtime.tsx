"use client";

import { useEffect, useRef } from "react";

type TranslationResponse = {
  ok: boolean;
  data?: {
    locale: string;
    translations: Record<string, string>;
  };
};

const TEXT_NODE_PARENT_SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CODE", "PRE"]);
const ATTRIBUTE_NAMES = ["placeholder", "title", "aria-label"] as const;

function getCookie(name: string) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function shouldTranslateText(value: string) {
  const text = value.trim();
  if (text.length < 2 || text.length > 240) return false;
  if (!/\p{L}/u.test(text)) return false;
  if (/^[\d\s.,:/\\-]+$/.test(text)) return false;
  if (/^[A-Z0-9_-]{1,10}$/.test(text)) return false;
  if (text.includes("@") || /^https?:\/\//i.test(text)) return false;
  return true;
}

function hasNoTranslateAncestor(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest("[data-no-translate]"));
}

function preserveOuterWhitespace(original: string, translated: string) {
  const prefix = original.match(/^\s*/)?.[0] ?? "";
  const suffix = original.match(/\s*$/)?.[0] ?? "";
  return `${prefix}${translated}${suffix}`;
}

export function UiLanguageRuntime({ locale }: { locale: string }) {
  const textOriginals = useRef(new WeakMap<Text, string>());
  const attributeOriginals = useRef(new WeakMap<Element, Partial<Record<(typeof ATTRIBUTE_NAMES)[number], string>>>());
  const cache = useRef(new Map<string, string>());
  const pending = useRef(false);

  useEffect(() => {
    document.documentElement.lang = locale;

    if (getCookie("ehs_locale") !== locale) {
      void fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    }
  }, [locale]);

  useEffect(() => {
    let disposed = false;

    async function translateCollected() {
      if (disposed || pending.current) return;
      pending.current = true;

      try {
        const textTargets: Array<{ node: Text; original: string }> = [];
        const attrTargets: Array<{ element: Element; attribute: (typeof ATTRIBUTE_NAMES)[number]; original: string }> = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (!node.parentElement || TEXT_NODE_PARENT_SKIP.has(node.parentElement.tagName) || hasNoTranslateAncestor(node)) {
            continue;
          }

          const current = node.nodeValue ?? "";
          const storedOriginal = textOriginals.current.get(node);
          const storedTranslation = storedOriginal ? cache.current.get(storedOriginal.trim()) : undefined;
          const original =
            storedOriginal && (current === storedOriginal || (storedTranslation && current === preserveOuterWhitespace(storedOriginal, storedTranslation)))
              ? storedOriginal
              : current;
          if (original !== storedOriginal) {
            textOriginals.current.set(node, original);
          }

          if (shouldTranslateText(original)) {
            textTargets.push({ node, original });
          }
        }

        for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
          if (hasNoTranslateAncestor(element)) continue;

          for (const attribute of ATTRIBUTE_NAMES) {
            const value = element.getAttribute(attribute);
            if (!value) continue;

            const stored = attributeOriginals.current.get(element) ?? {};
            const storedOriginal = stored[attribute];
            const storedTranslation = storedOriginal ? cache.current.get(storedOriginal.trim()) : undefined;
            const original = storedOriginal && (value === storedOriginal || value === storedTranslation) ? storedOriginal : value;
            if (original !== storedOriginal) {
              attributeOriginals.current.set(element, { ...stored, [attribute]: original });
            }

            if (shouldTranslateText(original)) {
              attrTargets.push({ element, attribute, original });
            }
          }
        }

        const missing = [...new Set([...textTargets, ...attrTargets].map((target) => target.original.trim()))].filter(
          (text) => !cache.current.has(text),
        );

        for (let index = 0; index < missing.length; index += 100) {
          const texts = missing.slice(index, index + 100);
          const response = await fetch("/api/ui/translations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ texts }),
          });
          const json = (await response.json().catch(() => null)) as TranslationResponse | null;
          if (!response.ok || !json?.ok || !json.data?.translations) continue;

          for (const [source, translated] of Object.entries(json.data.translations)) {
            cache.current.set(source, translated);
          }
        }

        for (const target of textTargets) {
          const translated = cache.current.get(target.original.trim());
          if (translated && target.node.nodeValue !== preserveOuterWhitespace(target.original, translated)) {
            target.node.nodeValue = preserveOuterWhitespace(target.original, translated);
          }
        }

        for (const target of attrTargets) {
          const translated = cache.current.get(target.original.trim());
          if (translated) {
            target.element.setAttribute(target.attribute, translated);
          }
        }
      } finally {
        pending.current = false;
      }
    }

    function scheduleTranslation() {
      window.setTimeout(() => {
        void translateCollected();
      }, 150);
    }

    scheduleTranslation();
    const observer = new MutationObserver(scheduleTranslation);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTE_NAMES],
    });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [locale]);

  return null;
}
