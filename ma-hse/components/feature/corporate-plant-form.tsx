"use client";

import Link from "next/link";
import { useState } from "react";
import { RoleCode } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";

const LANGUAGE_OPTIONS = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;

export function CorporatePlantForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Lisbon");
  const [defaultLanguage, setDefaultLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]>("en");
  const [n1Email, setN1Email] = useState("");
  const [n1Name, setN1Name] = useState("");
  const [n2Email, setN2Email] = useState("");
  const [n2Name, setN2Name] = useState("");
  const [n3Email, setN3Email] = useState("");
  const [n3Name, setN3Name] = useState("");
  const [message, setMessage] = useState("");
  const [generatedPasswords, setGeneratedPasswords] = useState<Array<{ role: RoleCode; email: string | null; password: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setGeneratedPasswords([]);

    try {
      const response = await fetch("/api/corporate/plants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          timezone,
          defaultLanguage,
          n1: { email: n1Email, name: n1Name },
          n2: { email: n2Email, name: n2Name, language: defaultLanguage },
          n3: { email: n3Email, name: n3Name, language: defaultLanguage },
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? "Failed to save plant");
      }

      setGeneratedPasswords(json.data.generatedPasswords ?? []);
      setMessage("Plant and leadership roles saved.");
      setCode("");
      setName("");
      setTimezone("Europe/Lisbon");
      setDefaultLanguage("en");
      setN1Email("");
      setN1Name("");
      setN2Email("");
      setN2Name("");
      setN3Email("");
      setN3Name("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save plant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Criar planta</h2>
          <p className="mt-1 text-xs text-slate-600">Define the plant and assign N1, N2 and N3 in a dedicated setup page.</p>
        </div>
        <Link href="/app/corporate" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Voltar ao corporate
        </Link>
      </header>

      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
        <input value={code} onChange={(event) => setCode(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Plant Code" required />
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Plant Name" required />
        <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Time zone" required />
        <select value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number])} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          {LANGUAGE_OPTIONS.map((entry) => (
            <option key={entry} value={entry}>
              {entry.toUpperCase()}
            </option>
          ))}
        </select>

        <input value={n1Email} onChange={(event) => setN1Email(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N1 email" required />
        <input value={n1Name} onChange={(event) => setN1Name(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N1 name" required />
        <input value={n2Email} onChange={(event) => setN2Email(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N2 email" required />
        <input value={n2Name} onChange={(event) => setN2Name(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N2 name" required />
        <input value={n3Email} onChange={(event) => setN3Email(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N3 email" required />
        <input value={n3Name} onChange={(event) => setN3Name(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="N3 name" required />

        <div className="md:col-span-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Saving..." : "Create plant"}
          </Button>
        </div>
      </form>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}

      {generatedPasswords.length ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Generated passwords</p>
          {generatedPasswords.map((entry) => (
            <p key={`${entry.role}-${entry.email}`}>
              {entry.role} - {entry.email}: {entry.password}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
