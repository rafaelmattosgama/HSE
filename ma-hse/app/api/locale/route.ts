import { NextResponse } from "next/server";
import { locales } from "@/lib/i18n/routing";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { locale?: string } | null;
  const locale = body?.locale;

  if (!locale || !locales.includes(locale as (typeof locales)[number])) {
    return NextResponse.json({ ok: false, message: "Invalid locale" }, { status: 422 });
  }

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set("ehs_locale", locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

