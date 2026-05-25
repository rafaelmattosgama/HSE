"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { groupUnsafeActTypes } from "@/components/feature/unsafe-act-type-select";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

type UnsafeActType = {
  id: string;
  code: string;
  category: string;
  name: string;
};

type UnsafeActTypeOption = {
  id: string;
  code?: string | null;
  category?: string | null;
  name: string;
};

function sortTypes(types: UnsafeActType[]) {
  return [...types].sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name) || left.code.localeCompare(right.code));
}

export function UnsafeActTypeManager({
  initialTypes,
  plantCode,
  labels = getStaticN0MasterDataUi("en"),
}: {
  initialTypes: UnsafeActType[];
  plantCode?: string;
  labels?: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const plant = plantCode ?? pathname.split("/")[2];
  const [types, setTypes] = useState(sortTypes(initialTypes));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const groups = useMemo(() => groupUnsafeActTypes(types), [types]);

  useEffect(() => {
    setTypes(sortTypes(initialTypes));
  }, [initialTypes]);

  function clearForm() {
    setEditingId(null);
    setCode("");
    setCategory("");
    setName("");
  }

  function startEdit(type: UnsafeActTypeOption) {
    setEditingId(type.id);
    setCode(type.code ?? "");
    setCategory(type.category ?? "");
    setName(type.name);
    setMessage(formatMasterDataMessage(labels.unsafeActManager.editing, { code: type.code ?? type.name }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/unsafe-act-types`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          code,
          category,
          name,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.unsafeActManager.saveError);
      }

      const saved = json.data.type as UnsafeActType;
      setTypes((current) => sortTypes([...current.filter((entry) => entry.id !== saved.id && entry.code !== saved.code), saved]));
      clearForm();
      setMessage(labels.unsafeActManager.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.unsafeActManager.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(type: UnsafeActTypeOption) {
    if (!window.confirm(formatMasterDataMessage(labels.unsafeActManager.deleteConfirm, { name: type.name }))) {
      return;
    }

    setDeletingId(type.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/unsafe-act-types`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: type.id }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.unsafeActManager.deleteError);
      }

      setTypes((current) => current.filter((entry) => entry.id !== type.id));
      if (editingId === type.id) clearForm();
      setMessage(labels.unsafeActManager.removed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.unsafeActManager.deleteError);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.sections.unsafeActType.title}</h2>
        <HelpPopover title={labels.sections.unsafeActType.title} body={labels.unsafeActManager.help} buttonLabel={labels.helpButton} />
      </header>

      <form onSubmit={submit} className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1fr_1.2fr_auto] lg:items-end">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.professionalRisks.code}</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required disabled={Boolean(editingId)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.category}</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.unsafeActManager.subcategoryOption}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? labels.saving : editingId ? labels.saveChanges : labels.unsafeActManager.addType}
          </Button>
          {editingId ? (
            <Button type="button" size="sm" variant="secondary" onClick={clearForm}>
              {labels.cancel}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <article key={group.category} className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">{group.category}</h3>
            <div className="mt-3 space-y-2">
              {group.types.map((type) => (
                <div key={type.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5 text-xs text-slate-700">
                  <p className="min-w-0 truncate">{type.code ? `${type.code} - ` : ""}{type.name}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className="font-medium text-slate-600 hover:text-slate-900" onClick={() => startEdit(type)} disabled={Boolean(deletingId)}>
                      {labels.edit}
                    </button>
                    <button type="button" className="font-medium text-red-700 hover:text-red-900" onClick={() => void deleteType(type)} disabled={Boolean(deletingId)}>
                      {deletingId === type.id ? labels.updating : labels.deactivate}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {message ? <p className="mt-3 text-xs text-slate-600">{message}</p> : null}
    </section>
  );
}
