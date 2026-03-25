import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales } from "@/lib/i18n/routing";

const COOKIE_NAME = "ehs_locale";

async function resolveLocale(): Promise<string> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value;
  if (cookieLocale && locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(",")
      .map((part) => part.trim().split(";")[0]?.toLowerCase().slice(0, 2))
      .find((lang): lang is string => Boolean(lang && locales.includes(lang as (typeof locales)[number])));

    if (preferred) {
      return preferred;
    }
  }

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
