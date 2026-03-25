import { defineRouting } from "next-intl/routing";

export const locales = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "pt";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
});