"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    if (newPassword.length < 8) {
      setMessage("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("A confirmacao da senha nao confere.");
      return;
    }
    if (currentPassword === newPassword) {
      setMessage("A nova senha precisa ser diferente da senha atual.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        const apiMessage = json?.message as string | undefined;
        setMessage(apiMessage ?? "Falha ao alterar a senha.");
        return;
      }

      setSuccess(true);
      setMessage("Senha alterada com sucesso. Redirecionando...");
      window.setTimeout(() => {
        window.location.href = "/app/corporate";
      }, 700);
    } catch {
      setMessage("Erro inesperado ao alterar senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Troca obrigatoria de senha</h1>
        <p className="text-sm text-slate-600">
          Este usuario recebeu senha temporaria. Defina uma nova senha para continuar.
        </p>
      </header>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-800">Senha atual</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-800">Nova senha</span>
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          minLength={8}
          required
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-800">Confirmar nova senha</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          minLength={8}
          required
        />
      </label>

      {message ? (
        <p className={`text-sm ${success ? "text-emerald-700" : "text-red-700"}`}>{message}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : "Alterar senha"}
      </Button>
    </form>
  );
}
