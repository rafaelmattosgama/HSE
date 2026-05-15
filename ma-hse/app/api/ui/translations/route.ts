import { getServerSession } from "next-auth";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { authOptions } from "@/lib/auth/options";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

const translateUiInput = z.object({
  texts: z.array(z.string().min(1).max(240)).min(1).max(100),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = translateUiInput.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid translation payload", 422);
  }

  const locale = await getServerUiLocale({
    userLanguage: session.user.language,
  });
  const texts = [...new Set(parsed.data.texts.map((text) => text.trim()).filter(Boolean))];
  const translations = await translateForViewer(locale, texts);

  return ok({
    locale,
    translations: Object.fromEntries(texts.map((text, index) => [text, translations[index] ?? text])),
  });
}
