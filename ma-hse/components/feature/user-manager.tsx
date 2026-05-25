"use client";

import { useMemo, useState } from "react";
import { RoleCode } from "@prisma/client";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

type ManagedUser = {
  id: string;
  email: string | null;
  name: string;
  language: string;
  isActive: boolean;
  role: RoleCode;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type UserManagerProps = {
  users: ManagedUser[];
  allowedCreateRoles: RoleCode[];
  plantCode?: string;
  labels?: N0MasterDataUi;
};

type FeedbackPopup = {
  tone: "success" | "error";
  title: string;
  message: string;
};

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";
type SortOption =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc";

const LANGUAGE_OPTIONS = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;

function toTimestamp(value: string | Date) {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function sortUsers(rows: ManagedUser[], sortBy: SortOption) {
  const next = [...rows];

  switch (sortBy) {
    case "created_asc":
      return next.sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
    case "updated_desc":
      return next.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
    case "updated_asc":
      return next.sort((a, b) => toTimestamp(a.updatedAt) - toTimestamp(b.updatedAt));
    case "name_asc":
      return next.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return next.sort((a, b) => b.name.localeCompare(a.name));
    case "created_desc":
    default:
      return next.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  }
}

function formatDate(value: string | Date) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

export function UserManager({ users, allowedCreateRoles, plantCode, labels = getStaticN0MasterDataUi("en") }: UserManagerProps) {
  const pathname = usePathname();
  const plant = plantCode ?? pathname.split("/")[2];

  const [rows, setRows] = useState<ManagedUser[]>(users);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]>("en");
  const [role, setRole] = useState<RoleCode | "">(allowedCreateRoles.length ? allowedCreateRoles[0] : "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleCode | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("created_desc");
  const [popup, setPopup] = useState<FeedbackPopup | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const canCreate = useMemo(() => allowedCreateRoles.length > 0, [allowedCreateRoles.length]);
  const roleFilterOptions = useMemo(() => [...new Set(rows.map((entry) => entry.role))].sort((a, b) => a.localeCompare(b)), [rows]);
  const visibleRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = rows.filter((entry) => {
      if (roleFilter !== "ALL" && entry.role !== roleFilter) return false;
      if (activeFilter === "ACTIVE" && !entry.isActive) return false;
      if (activeFilter === "INACTIVE" && entry.isActive) return false;
      if (!normalizedSearch) return true;
      const haystack = `${entry.name} ${entry.email ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    return sortUsers(filtered, sortBy);
  }, [activeFilter, roleFilter, rows, searchTerm, sortBy]);

  function resetForm() {
    setEditingUserId(null);
    setEmail("");
    setName("");
    setLanguage("en");
    setRole(allowedCreateRoles[0] ?? "");
    setPassword("");
    setIsActive(true);
  }

  function showPopup(tone: FeedbackPopup["tone"], title: string, message: string) {
    setPopup({ tone, title, message });
  }

  async function refreshUsers() {
    const response = await fetch(`/api/plants/${plant}/admin/users`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const json = await response.json();
    if (!json.ok) {
      throw new Error(json.message ?? labels.users.loadError);
    }
    setRows((json.data.users as ManagedUser[]) ?? []);
  }

  function startEdit(entry: ManagedUser) {
    setEditingUserId(entry.id);
    setEmail(entry.email ?? "");
    setName(entry.name);
    setLanguage(entry.language as (typeof LANGUAGE_OPTIONS)[number]);
    setRole(entry.role);
    setPassword("");
    setIsActive(entry.isActive);
    setPopup(null);
  }

  async function toggleUserStatus(entry: ManagedUser) {
    setRowActionId(entry.id);
    setPopup(null);
    try {
      const response = await fetch(`/api/plants/${plant}/admin/users/${entry.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      const json = await response.json();
      if (!json.ok) {
        showPopup("error", labels.users.updateError, json.message ?? labels.users.updateError);
        return;
      }
      await refreshUsers();
      showPopup("success", labels.users.userUpdated, !entry.isActive ? labels.users.userActivated : labels.users.userDeactivated);
    } catch (error) {
      showPopup("error", labels.users.unexpectedError, error instanceof Error ? error.message : labels.users.updateStatusUnexpected);
    } finally {
      setRowActionId(null);
    }
  }

  async function deleteUser(entry: ManagedUser) {
    const confirmed = window.confirm(formatMasterDataMessage(labels.users.deleteConfirm, { name: entry.name }));
    if (!confirmed) return;

    setRowActionId(entry.id);
    setPopup(null);
    try {
      const response = await fetch(`/api/plants/${plant}/admin/users/${entry.id}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!json.ok) {
        showPopup("error", labels.users.deleteError, json.message ?? labels.users.deleteError);
        return;
      }
      await refreshUsers();
      if (editingUserId === entry.id) {
        resetForm();
      }
      showPopup("success", labels.users.userDeleted, labels.users.userDeletedMessage);
    } catch (error) {
      showPopup("error", labels.users.unexpectedError, error instanceof Error ? error.message : labels.users.deleteUnexpected);
    } finally {
      setRowActionId(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate || !role) return;

    if (password.trim().length > 0 && password.trim().length < 8) {
      showPopup("error", labels.users.validationError, labels.users.passwordMinLength);
      return;
    }

    setLoading(true);
    setPopup(null);

    try {
      const isEditing = Boolean(editingUserId);
      const response = await fetch(
        isEditing ? `/api/plants/${plant}/admin/users/${editingUserId}` : `/api/plants/${plant}/admin/users`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            name,
            language,
            role,
            password: password.trim() ? password : undefined,
            isActive,
          }),
        },
      );

      const json = await response.json();
      if (!json.ok) {
        showPopup("error", isEditing ? labels.users.updateError : labels.users.saveError, json.message ?? labels.users.saveError);
        return;
      }

      await refreshUsers();

      if (!isEditing) {
        const generatedPassword = json.data.generatedPassword as string | null;
        const passwordDelivery = json.data.passwordDelivery as "UNCHANGED" | "CUSTOM_SET" | "TEMP_EMAILED" | "TEMP_MANUAL" | undefined;

        if (passwordDelivery === "TEMP_EMAILED") {
          showPopup("success", labels.users.userSaved, labels.users.tempPasswordEmailed);
        } else if (passwordDelivery === "TEMP_MANUAL" && generatedPassword) {
          showPopup("error", labels.users.emailDeliveryFailed, formatMasterDataMessage(labels.users.emailDeliveryFailedMessage, { password: generatedPassword }));
        } else if (passwordDelivery === "CUSTOM_SET") {
          showPopup("success", labels.users.userSaved, labels.users.customPasswordSet);
        } else {
          showPopup("success", labels.users.userSaved, labels.users.userSavedMessage);
        }
      } else {
        showPopup("success", labels.users.userUpdated, labels.users.userUpdatedMessage);
      }

      resetForm();
    } catch (error) {
      showPopup("error", labels.users.unexpectedError, error instanceof Error ? error.message : labels.users.saveUnexpected);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.users.title}</h2>
      </header>

      {canCreate ? (
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="email@company.com" required />
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.users.fullName} required />

          <select value={language} onChange={(event) => setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number])} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {LANGUAGE_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.toUpperCase()}
              </option>
            ))}
          </select>

          <select value={role} onChange={(event) => setRole(event.target.value as RoleCode)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
            {allowedCreateRoles.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS[entry]}
              </option>
            ))}
          </select>

          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder={editingUserId ? labels.users.newPasswordPlaceholder : labels.users.passwordPlaceholder} />
          <p className="text-xs text-slate-500 md:col-span-2">
            {editingUserId
              ? labels.users.keepPasswordHelp
              : labels.users.generatedPasswordHelp}
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            {labels.users.active}
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? labels.saving : editingUserId ? labels.users.updateUser : labels.users.createUser}
            </Button>
            {editingUserId ? (
              <Button type="button" size="sm" variant="secondary" onClick={resetForm}>
                {labels.users.cancelEdit}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {labels.users.noPermission}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
          <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder={labels.users.searchPlaceholder} />

          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleCode | "ALL")} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="ALL">{labels.users.allRoles}</option>
            {roleFilterOptions.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS[entry] ?? entry}
              </option>
            ))}
          </select>

          <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="ALL">{labels.users.allStatus}</option>
            <option value="ACTIVE">{labels.users.activeStatus}</option>
            <option value="INACTIVE">{labels.users.inactiveStatus}</option>
          </select>

          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="created_desc">{labels.users.sortCreatedDesc}</option>
            <option value="created_asc">{labels.users.sortCreatedAsc}</option>
            <option value="updated_desc">{labels.users.sortUpdatedDesc}</option>
            <option value="updated_asc">{labels.users.sortUpdatedAsc}</option>
            <option value="name_asc">{labels.users.sortNameAsc}</option>
            <option value="name_desc">{labels.users.sortNameDesc}</option>
          </select>
        </div>

        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{labels.users.fullName}</th>
              <th className="px-3 py-2">{labels.users.email}</th>
              <th className="px-3 py-2">{labels.users.role}</th>
              <th className="px-3 py-2">{labels.users.language}</th>
              <th className="px-3 py-2">{labels.users.active}</th>
              <th className="px-3 py-2">{labels.users.created}</th>
              <th className="px-3 py-2">{labels.users.updated}</th>
              <th className="px-3 py-2">{labels.users.actions}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((entry) => (
              <tr key={`${entry.id}-${entry.role}`} className="border-t border-slate-200">
                <td className="px-3 py-2">{entry.name}</td>
                <td className="px-3 py-2">{entry.email ?? "-"}</td>
                <td className="px-3 py-2">{ROLE_LABELS[entry.role] ?? entry.role}</td>
                <td className="px-3 py-2">{entry.language.toUpperCase()}</td>
                <td className="px-3 py-2">{entry.isActive ? labels.users.yes : labels.users.no}</td>
                <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
                <td className="px-3 py-2">{formatDate(entry.updatedAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(entry)} disabled={rowActionId === entry.id}>
                      {labels.edit}
                    </Button>
                    <Button type="button" size="sm" variant={entry.isActive ? "destructive" : "secondary"} onClick={() => toggleUserStatus(entry)} disabled={rowActionId === entry.id}>
                      {rowActionId === entry.id ? labels.saving : entry.isActive ? labels.users.deactivate : labels.users.activate}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => deleteUser(entry)} disabled={rowActionId === entry.id}>
                      {labels.users.delete}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className={`text-base font-semibold ${popup.tone === "success" ? "text-emerald-700" : "text-red-700"}`}>
              {popup.title}
            </h3>
            <p className="mt-2 text-sm text-slate-700">{popup.message}</p>
            <div className="mt-5 flex justify-end">
              <Button type="button" size="sm" onClick={() => setPopup(null)}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
