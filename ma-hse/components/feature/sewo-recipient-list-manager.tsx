"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";
import {
  SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS,
  type SewoReportRecipient,
  type SewoReportRecipientLanguage,
} from "@/lib/services/sewo-recipient-service";

const LANGUAGE_LABELS: Record<SewoReportRecipientLanguage, string> = {
  pt: "Portuguese",
  it: "Italian",
  en: "English",
  pl: "Polish",
  de: "German",
  ro: "Romanian",
  fr: "French",
};

function sortRecipients(recipients: SewoReportRecipient[]) {
  return [...recipients].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.email.localeCompare(right.email) ||
      left.language.localeCompare(right.language),
  );
}

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  message?: string;
};

async function readApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  const body = await response.text();
  if (!body.trim()) {
    return null;
  }

  try {
    return JSON.parse(body) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

export function SewoRecipientListManager({
  plantCode,
  initialRecipients,
  labels = getStaticN0MasterDataUi("en"),
}: {
  plantCode: string;
  initialRecipients: SewoReportRecipient[];
  labels?: N0MasterDataUi;
}) {
  const [recipients, setRecipients] = useState(() => sortRecipients(initialRecipients));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<SewoReportRecipientLanguage>("en");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setRecipients(sortRecipients(initialRecipients));
  }, [initialRecipients]);

  function clearForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setLanguage("en");
  }

  function startEdit(recipient: SewoReportRecipient) {
    setEditingId(recipient.id);
    setName(recipient.name);
    setEmail(recipient.email);
    setLanguage(recipient.language);
    setMessage(formatMasterDataMessage(labels.sewoRecipients.editing, { name: recipient.name || recipient.email }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/sewo-report-recipients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          name: name.trim(),
          email: email.trim(),
          language,
        }),
      });
      const json = await readApiEnvelope<{ recipient: SewoReportRecipient }>(response);
      if (!response.ok || !json?.ok || !json.data?.recipient) {
        throw new Error(json?.message ?? labels.sewoRecipients.saveError);
      }

      const recipient = json.data.recipient as SewoReportRecipient;
      setRecipients((current) => sortRecipients([...current.filter((entry) => entry.id !== recipient.id), recipient]));
      clearForm();
      setMessage(editingId ? labels.sewoRecipients.savedUpdated : labels.sewoRecipients.savedCreated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.sewoRecipients.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipient(recipient: SewoReportRecipient) {
    if (!window.confirm(formatMasterDataMessage(labels.sewoRecipients.deleteConfirm, { name: recipient.name || recipient.email }))) {
      return;
    }

    setDeletingId(recipient.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/sewo-report-recipients`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: recipient.id,
        }),
      });
      const json = await readApiEnvelope<{ recipientId: string }>(response);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message ?? labels.sewoRecipients.deleteError);
      }

      setRecipients((current) => current.filter((entry) => entry.id !== recipient.id));
      if (editingId === recipient.id) {
        clearForm();
      }
      setMessage(labels.sewoRecipients.deleted);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.sewoRecipients.deleteError);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.sewoRecipients.title}</h2>
        <HelpPopover title={labels.sewoRecipients.title} body={labels.sewoRecipients.help} buttonLabel={labels.helpButton} />
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">{editingId ? labels.sewoRecipients.edit : labels.sewoRecipients.create}</h3>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={clearForm}>
                {labels.users.cancelEdit}
              </button>
            ) : null}
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.users.fullName}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
              placeholder="Maria Silva"
              required
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.users.email}</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
              placeholder="maria.silva@example.com"
              type="email"
              required
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.users.language}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as SewoReportRecipientLanguage)}
              className="h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
            >
              {SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {LANGUAGE_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" size="sm" disabled={saving}>
            {saving ? labels.saving : editingId ? labels.saveChanges : labels.sewoRecipients.create}
          </Button>
        </form>

        <div className="space-y-3">
          {recipients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              {labels.sewoRecipients.noRecipients}
            </div>
          ) : null}

          {recipients.map((recipient) => (
            <article key={recipient.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{recipient.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{recipient.email}</p>
                  <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {LANGUAGE_LABELS[recipient.language]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                    onClick={() => startEdit(recipient)}
                  >
                    {labels.edit}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                    onClick={() => void removeRecipient(recipient)}
                    disabled={Boolean(deletingId)}
                  >
                    {deletingId === recipient.id ? labels.updating : labels.users.delete}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
