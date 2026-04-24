"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ContractorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/contractors/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Login successful" : json.message ?? "Login failed");
    if (json.ok) {
      window.location.href = "/contractors/portal";
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">External Company Login</h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <Button type="submit">Login</Button>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </div>
    </main>
  );
}
