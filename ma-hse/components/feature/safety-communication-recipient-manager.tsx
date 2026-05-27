"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { requireApiResponse } from "@/lib/client-api";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";
import type {
  SafetyCommunicationAlertRecipientDepartmentOption,
  SafetyCommunicationAlertRecipientRow,
  SafetyCommunicationAlertRecipientUserOption,
} from "@/lib/services/safety-communication-alert-service";

function sortRecipients(rows: SafetyCommunicationAlertRecipientRow[]) {
  return [...rows].sort(
    (left, right) =>
      left.departmentName.localeCompare(right.departmentName)
      || left.userName.localeCompare(right.userName)
      || (left.userEmail ?? "").localeCompare(right.userEmail ?? ""),
  );
}

export function SafetyCommunicationRecipientManager({
  plantCode,
  initialRecipients,
  users,
  departments,
  labels = getStaticN0MasterDataUi("en"),
}: {
  plantCode: string;
  initialRecipients: SafetyCommunicationAlertRecipientRow[];
  users: SafetyCommunicationAlertRecipientUserOption[];
  departments: SafetyCommunicationAlertRecipientDepartmentOption[];
  labels?: N0MasterDataUi;
}) {
  const [rows, setRows] = useState(() => sortRecipients(initialRecipients));
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setRows(sortRecipients(initialRecipients));
  }, [initialRecipients]);

  useEffect(() => {
    if (!users.some((entry) => entry.id === userId)) {
      setUserId(users[0]?.id ?? "");
    }
  }, [userId, users]);

  useEffect(() => {
    if (!departments.some((entry) => entry.id === departmentId)) {
      setDepartmentId(departments[0]?.id ?? "");
    }
  }, [departmentId, departments]);

  const selectedUser = useMemo(
    () => users.find((entry) => entry.id === userId) ?? null,
    [userId, users],
  );
  const selectedDepartment = useMemo(
    () => departments.find((entry) => entry.id === departmentId) ?? null,
    [departmentId, departments],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUser || !selectedDepartment) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/safety-communication-alert-recipients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          departmentId: selectedDepartment.id,
        }),
      });
      const json = await requireApiResponse<{ recipient: SafetyCommunicationAlertRecipientRow }>(
        response,
        labels.safetyCommunicationRecipients.saveError,
      );
      const recipient = json.data?.recipient;
      if (!recipient) {
        throw new Error(labels.safetyCommunicationRecipients.saveError);
      }
      setRows((current) => sortRecipients([...current.filter((entry) => entry.id !== recipient.id), recipient]));
      setMessage(labels.safetyCommunicationRecipients.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.safetyCommunicationRecipients.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipient(row: SafetyCommunicationAlertRecipientRow) {
    const confirmed = window.confirm(
      formatMasterDataMessage(labels.safetyCommunicationRecipients.deleteConfirm, {
        name: row.userName,
        department: row.departmentName,
      }),
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/safety-communication-alert-recipients`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: row.id,
        }),
      });
      await requireApiResponse<{ recipientId: string }>(response, labels.safetyCommunicationRecipients.deleteError);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setMessage(labels.safetyCommunicationRecipients.deleted);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.safetyCommunicationRecipients.deleteError);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.safetyCommunicationRecipients.title}</h2>
        <HelpPopover
          title={labels.safetyCommunicationRecipients.title}
          body={labels.safetyCommunicationRecipients.help}
          buttonLabel={labels.helpButton}
        />
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.safetyCommunicationRecipients.supervisorLabel}
            </span>
            <select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
              disabled={!users.length || saving}
              required
            >
              {users.length === 0 ? <option value="">{labels.safetyCommunicationRecipients.noUsers}</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}{user.email ? ` - ${user.email}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.safetyCommunicationRecipients.departmentLabel}
            </span>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
              disabled={!departments.length || saving}
              required
            >
              {departments.length === 0 ? <option value="">{labels.safetyCommunicationRecipients.noDepartments}</option> : null}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} - {department.name}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" size="sm" disabled={saving || !users.length || !departments.length}>
            {saving ? labels.saving : labels.safetyCommunicationRecipients.add}
          </Button>
        </form>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              {labels.safetyCommunicationRecipients.noRecipients}
            </div>
          ) : null}

          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{row.userName}</p>
                  <p className="mt-1 text-sm text-slate-600">{row.userEmail ?? "-"}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-semibold">{row.departmentCode}</span> - {row.departmentName}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                  onClick={() => void removeRecipient(row)}
                  disabled={Boolean(deletingId)}
                >
                  {deletingId === row.id ? labels.updating : labels.users.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
