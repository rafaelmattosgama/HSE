import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { getUiDictionary, normalizeUiLocale } from "@/lib/ui-language";

const COOKIE_NAME = "ehs_locale";

export function resolveUiLocale(input: {
  userLanguage?: string | null;
  cookieLocale?: string | null;
  plantLanguage?: string | null;
  requestLocale?: string | null;
} = {}) {
  return normalizeUiLocale(input.userLanguage ?? input.cookieLocale ?? input.plantLanguage ?? input.requestLocale);
}

export async function getServerUiLocale(input: {
  userLanguage?: string | null;
  plantLanguage?: string | null;
} = {}) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value;
  const requestLocale = await getLocale();

  return resolveUiLocale({
    userLanguage: input.userLanguage,
    cookieLocale,
    plantLanguage: input.plantLanguage,
    requestLocale,
  });
}

export async function getServerUiDictionary(input: {
  userLanguage?: string | null;
  plantLanguage?: string | null;
} = {}) {
  return getUiDictionary(await getServerUiLocale(input));
}
