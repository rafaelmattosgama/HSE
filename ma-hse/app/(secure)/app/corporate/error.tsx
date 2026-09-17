"use client";

import { useLocale } from "next-intl";
import { getUiDictionary } from "@/lib/ui-language";

export default function CorporateError({ reset }: { reset: () => void }) {
  const text = getUiDictionary(useLocale()).groupSafety;
  return <section className="app-card mx-auto my-6 max-w-2xl" role="alert">
    <h1 className="text-xl font-bold text-slate-950">{text.error}</h1>
    <button type="button" onClick={reset} className="app-toolbar mt-4 bg-slate-900 !text-white">{text.retry}</button>
  </section>;
}
