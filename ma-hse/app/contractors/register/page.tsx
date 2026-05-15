"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ContractorRegisterPage() {
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("t") ?? "";
  const [form, setForm] = useState({
    contactName: "",
    password: "",
    email: "",
    companyName: "",
    address: "",
    phone: "",
    taxId: "",
    socialSecurityId: "",
  });
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/contractors/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationToken, ...form }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Registration complete. You can now access the portal." : json.message ?? "Registration failed");
    if (json.ok) {
      window.location.href = "/contractors/portal";
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">External Company Registration</h1>
        <form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-2">
          {Object.entries(form).map(([key, value]) => (
            <input
              key={key}
              type={key === "password" ? "password" : "text"}
              value={value}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              placeholder={key}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          ))}
          <div className="md:col-span-2">
            <Button type="submit">Create account</Button>
          </div>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </div>
    </main>
  );
}
