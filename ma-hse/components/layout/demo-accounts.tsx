"use client";

import { isClientDemoMode } from "@/components/layout/demo-banner";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoScriptId } from "@/lib/demo-mode";

const LABELS: Record<DemoScriptId, string> = {
  "demo-presentation": "Apresentação / Presentation",
  "demo-training-n0": "Formação Admin (N0)",
  "demo-training-n1": "Formação Corporate (N1)",
  "demo-training-n3": "Formação Segurança (N3)",
};

/** Demo account list shown under the login form (demo mode only); clicking one fills the form. */
export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  if (!isClientDemoMode()) return null;
  return (
    <section data-no-translate className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-slate-900">Contas de demonstração · password: {DEMO_PASSWORD}</p>
      <ul className="mt-2 space-y-1">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button type="button" className="text-left text-blue-900 underline" onClick={() => onPick(account.email)}>
              {account.email}
            </button>{" "}
            <span className="text-slate-600">– {LABELS[account.script]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
