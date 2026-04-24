"use client";

import Image from "next/image";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/app/corporate";

  const [email, setEmail] = useState("corporate@ma-hse.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState<string>("");

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });

    if (result?.error) {
      setError(result.error);
      return;
    }

    const session = await getSession();
    const isCorporate = session?.user?.plantRoles?.some((entry) => entry.role === "N0_ADMIN" || entry.role === "N1_CORPORATE");
    const primaryPlant = session?.user?.plantRoles?.find((entry) => entry.plantCode)?.plantCode;

    if (session?.user?.plantRoles?.some((entry) => entry.role === "N0_ADMIN")) {
      window.location.href = "/app/settings";
      return;
    }

    if (isCorporate) {
      window.location.href = "/app/corporate";
      return;
    }

    if (primaryPlant) {
      window.location.href = `/app/${primaryPlant}/dashboards`;
      return;
    }

    if (result?.url) {
      window.location.href = result.url;
      return;
    }

    setError("Login failed. Please verify credentials and app URL.");
  }

  async function submitMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const result = await signIn("email", {
      email: magicEmail,
      callbackUrl,
      redirect: false,
    });

    if (result?.error) {
      setError(result.error);
      return;
    }

    setError("Magic link sent. Check your inbox (Mailpit in local setup).");
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 py-10 md:grid-cols-2">
      <section className="rounded-3xl bg-gradient-to-br from-teal-700 via-cyan-700 to-emerald-600 p-8 text-white shadow-2xl">
        <div className="flex h-20 w-32 items-center justify-center rounded-2xl border border-white/20 bg-white px-3 py-2 shadow-lg">
          <Image src="/max-safety-logo.svg" alt="MAx Safety" width={96} height={42} className="h-auto w-full" priority />
        </div>
        <h1 className="mt-3 text-4xl font-bold leading-tight">Saude, Seguranca do Trabalho e Ambiente</h1>
        <p className="mt-5 text-sm text-teal-50">
          MVP com comunicacoes, validacao N3, plano CAPA, S-EWO, KPIs, alertas e relatorios automatizados por planta.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
        <p className="mt-2 text-sm text-slate-600">Use credenciais ou link por e-mail.</p>

        <form onSubmit={submitCredentials} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              required
            />
          </label>

          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-200" />
          <span>ou</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submitMagicLink} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Magic link por email</span>
            <input
              type="email"
              value={magicEmail}
              onChange={(event) => setMagicEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="user@empresa.com"
            />
          </label>

          <Button type="submit" variant="secondary" className="w-full">
            Enviar link
          </Button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      </section>
    </main>
  );
}
