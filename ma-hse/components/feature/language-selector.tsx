"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DASHBOARD_LANGUAGES } from "@/lib/ui-language";

export function LanguageSelector({
  currentLocale,
  label,
}: {
  currentLocale: string;
  label: string;
}) {
  const router = useRouter();
  const [selectedLocale, setSelectedLocale] = useState(currentLocale);
  const [isPending, startTransition] = useTransition();

  async function updateLocale(locale: string) {
    setSelectedLocale(locale);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
    });

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {DASHBOARD_LANGUAGES.map((language) => {
          const active = selectedLocale === language.code;
          return (
            <button
              key={language.code}
              type="button"
              disabled={isPending}
              onClick={() => updateLocale(language.code)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                active
                  ? "border-teal-300 bg-teal-50 font-semibold text-teal-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true">{language.flag}</span>
              <span>{language.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

