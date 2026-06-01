"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { DASHBOARD_LANGUAGES } from "@/lib/ui-language";

type UserSettingsPanelProps = {
  initialName: string;
  initialLanguage: string;
};

export function UserSettingsPanel({ initialName, initialLanguage }: UserSettingsPanelProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState(initialLanguage);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const hasProfileChanges = useMemo(
    () => name.trim() !== initialName || language !== initialLanguage,
    [initialLanguage, initialName, language, name],
  );

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileMessage("");
    setProfileSuccess(false);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setProfileMessage("O nome de identificação deve ter pelo menos 2 caracteres.");
      return;
    }

    setProfileLoading(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          language,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setProfileMessage(json?.message ?? "Não foi possível guardar as definições.");
        return;
      }

      setProfileSuccess(true);
      setProfileMessage("Definições pessoais atualizadas com sucesso.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setProfileMessage("Erro inesperado ao guardar as definições.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordMessage("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("A confirmação da nova palavra-passe não coincide.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordMessage("A nova palavra-passe deve ser diferente da atual.");
      return;
    }

    setPasswordLoading(true);
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
        setPasswordMessage(json?.message ?? "Não foi possível alterar a palavra-passe.");
        return;
      }

      setPasswordSuccess(true);
      setPasswordMessage("Palavra-passe alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordMessage("Erro inesperado ao alterar a palavra-passe.");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-5 flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Definições pessoais</h1>
          <HelpPopover
            title="Definições pessoais"
            body="Atualize o seu nome de identificação e o idioma da aplicação. As alterações ficam guardadas para futuras sessões."
            buttonLabel="Ajuda sobre definições pessoais"
          />
        </header>

        <form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span>Nome de identificação</span>
              <HelpPopover
                title="Nome de identificação"
                body="Este nome é apresentado no topo da aplicação e em áreas internas da plataforma."
                buttonLabel="Ajuda sobre nome de identificação"
              />
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              maxLength={120}
              required
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span>Idioma da aplicação</span>
              <HelpPopover
                title="Idioma da aplicação"
                body="Selecione o idioma preferido. A escolha fica associada à sua conta e também é usada nas próximas sessões."
                buttonLabel="Ajuda sobre idioma da aplicação"
              />
            </span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            >
              {DASHBOARD_LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          {profileMessage ? (
            <p className={`text-sm md:col-span-2 ${profileSuccess ? "text-emerald-700" : "text-red-700"}`}>
              {profileMessage}
            </p>
          ) : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={profileLoading || isRefreshing || !hasProfileChanges}>
              {profileLoading || isRefreshing ? "A guardar..." : "Guardar definições"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-5 flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">Alterar palavra-passe</h2>
          <HelpPopover
            title="Alterar palavra-passe"
            body="Introduza a palavra-passe atual, depois defina e confirme a nova palavra-passe. A nova palavra-passe deve ser diferente da atual."
            buttonLabel="Ajuda sobre alteração de palavra-passe"
          />
        </header>

        <form onSubmit={changePassword} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span>Palavra-passe atual</span>
              <HelpPopover
                title="Palavra-passe atual"
                body="É usada para validar que a alteração está a ser feita pelo utilizador autenticado."
                buttonLabel="Ajuda sobre palavra-passe atual"
              />
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              autoComplete="current-password"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span>Nova palavra-passe</span>
              <HelpPopover
                title="Nova palavra-passe"
                body="A nova palavra-passe deve ter pelo menos 8 caracteres."
                buttonLabel="Ajuda sobre nova palavra-passe"
              />
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span>Confirmar nova palavra-passe</span>
              <HelpPopover
                title="Confirmar nova palavra-passe"
                body="Repita a nova palavra-passe exatamente como foi introduzida no campo anterior."
                buttonLabel="Ajuda sobre confirmação da palavra-passe"
              />
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {passwordMessage ? (
            <p className={`text-sm md:col-span-2 ${passwordSuccess ? "text-emerald-700" : "text-red-700"}`}>
              {passwordMessage}
            </p>
          ) : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? "A atualizar..." : "Atualizar palavra-passe"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
