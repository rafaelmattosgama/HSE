"use client";

import { useMemo, useState } from "react";
import { RoleCode } from "@prisma/client";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";

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

export function UserManager({ users, allowedCreateRoles, plantCode }: UserManagerProps) {
  const pathname = usePathname();
  const plant = plantCode ?? pathname.split("/")[2];

  const [rows, setRows] = useState<ManagedUser[]>(users);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]>("en");
  const [role, setRole] = useState<RoleCode | "">(
    allowedCreateRoles.length ? allowedCreateRoles[0] : "",
  );
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
  const roleFilterOptions = useMemo(() => {
    return [...new Set(rows.map((entry) => entry.role))].sort((a, b) => a.localeCompare(b));
  }, [rows]);
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

  function showPopup(tone: FeedbackPopup["tone"], title: string, message: string) {
    setPopup({ tone, title, message });
  }

  async function refreshUsers() {
    const response = await fetch(`/api/plants/${plant}/admin/users`, {
      method: "GET",
      headers: { "accept": "application/json" },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Failed to load users (HTTP ${response.status})`);
    }

    const json = await response.json();
    if (!json.ok) {
      throw new Error(json.message ?? "Failed to load users");
    }

    const nextUsers = (json.data.users as ManagedUser[]) ?? [];
    setRows(nextUsers);
  }

  async function toggleUserStatus(entry: ManagedUser) {
    setRowActionId(entry.id);
    setPopup(null);
    try {
      const response = await fetch(`/api/plants/${plant}/admin/users/${entry.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isActive: !entry.isActive,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const bodyPreview = (await response.text()).slice(0, 160);
        showPopup(
          "error",
          "Unexpected response",
          `Unexpected server response (HTTP ${response.status}). ${bodyPreview || "No response body."}`,
        );
        return;
      }

      const json = await response.json();
      if (!json.ok) {
        showPopup("error", "Failed to update user", json.message ?? "Failed to update user");
        return;
      }

      await refreshUsers();
      showPopup(
        "success",
        "User updated",
        !entry.isActive ? "User was activated successfully." : "User was deactivated successfully.",
      );
    } catch (error) {
      showPopup(
        "error",
        "Unexpected error",
        error instanceof Error ? error.message : "Unexpected error while updating user status",
      );
    } finally {
      setRowActionId(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate || !role) return;

    if (password.trim().length > 0 && password.trim().length < 8) {
      showPopup("error", "Validation error", "Password must be at least 8 characters, or leave it empty to auto-generate.");
      return;
    }

    setLoading(true);
    setPopup(null);

    try {
      const response = await fetch(`/api/plants/${plant}/admin/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          language,
          role,
          password: password.trim() ? password : undefined,
          isActive,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const bodyPreview = (await response.text()).slice(0, 160);
        showPopup(
          "error",
          "Unexpected response",
          `Unexpected server response (HTTP ${response.status}). ${bodyPreview || "No response body."}`,
        );
        return;
      }

      const json = await response.json();

      if (!json.ok) {
        showPopup("error", "Failed to save user", json.message ?? "Failed to save user");
        return;
      }

      await refreshUsers();

      const generatedPassword = json.data.generatedPassword as string | null;
      const passwordDelivery = json.data.passwordDelivery as
        | "UNCHANGED"
        | "CUSTOM_SET"
        | "TEMP_EMAILED"
        | "TEMP_MANUAL"
        | undefined;

      if (passwordDelivery === "TEMP_EMAILED") {
        showPopup(
          "success",
          "User saved",
          "Temporary password was sent by email and user must change it at first login.",
        );
      } else if (passwordDelivery === "TEMP_MANUAL" && generatedPassword) {
        showPopup(
          "error",
          "Email delivery failed",
          `User saved, but email delivery failed. Share this temporary password securely: ${generatedPassword}`,
        );
      } else if (passwordDelivery === "CUSTOM_SET") {
        showPopup("success", "User saved", "User saved with the password informed in the form.");
      } else if (passwordDelivery === "UNCHANGED") {
        showPopup("success", "User saved", "Existing password kept.");
      } else {
        showPopup("success", "User saved", "User saved.");
      }
      setEmail("");
      setName("");
      setPassword("");
      setIsActive(true);
      setRole(allowedCreateRoles[0] ?? "");
    } catch (error) {
      showPopup(
        "error",
        "Unexpected error",
        error instanceof Error ? error.message : "Unexpected error while saving user",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">User Management</h2>
        <p className="mt-1 text-xs text-slate-600">Create and assign users for this plant scope.</p>
      </header>

      {canCreate ? (
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="email@company.com"
            required
          />
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Full name"
            required
          />

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number])}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {LANGUAGE_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={role}
            onChange={(event) => setRole(event.target.value as RoleCode)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          >
            {allowedCreateRoles.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS[entry]}
              </option>
            ))}
          </select>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            placeholder="Password (optional, auto-generated if empty)"
          />
          <p className="text-xs text-slate-500 md:col-span-2">
            Password is optional. If left empty, the system generates a temporary password, sends it by email,
            and requires password change at first login.
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active
          </label>

          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Saving..." : "Create / Update User"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You do not have permission to create users in this plant.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            placeholder="Search by name or email"
          />

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as RoleCode | "ALL")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ALL">All roles</option>
            {roleFilterOptions.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS[entry] ?? entry}
              </option>
            ))}
          </select>

          <select
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="created_desc">Created (newest first)</option>
            <option value="created_asc">Created (oldest first)</option>
            <option value="updated_desc">Updated (newest first)</option>
            <option value="updated_asc">Updated (oldest first)</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
          </select>
        </div>

        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((entry) => (
              <tr key={`${entry.id}-${entry.role}`} className="border-t border-slate-200">
                <td className="px-3 py-2">{entry.name}</td>
                <td className="px-3 py-2">{entry.email ?? "-"}</td>
                <td className="px-3 py-2">{ROLE_LABELS[entry.role] ?? entry.role}</td>
                <td className="px-3 py-2">{entry.language.toUpperCase()}</td>
                <td className="px-3 py-2">{entry.isActive ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
                <td className="px-3 py-2">
                  {formatDate(entry.updatedAt)}
                </td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.isActive ? "destructive" : "secondary"}
                    onClick={() => toggleUserStatus(entry)}
                    disabled={rowActionId === entry.id}
                  >
                    {rowActionId === entry.id ? "Saving..." : entry.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3
              className={`text-base font-semibold ${
                popup.tone === "success" ? "text-emerald-700" : "text-red-700"
              }`}
            >
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
