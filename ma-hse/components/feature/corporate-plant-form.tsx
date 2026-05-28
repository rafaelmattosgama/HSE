"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleCode } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

const LANGUAGE_OPTIONS = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;

type ManagedPlant = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  defaultLanguage: (typeof LANGUAGE_OPTIONS)[number];
  isActive: boolean;
};

type CorporatePlantFormProps = {
  plants?: ManagedPlant[];
  selectedPlantId?: string | null;
  labels?: N0MasterDataUi;
  showPlantSelector?: boolean;
};

function emptyCreateState() {
  return {
    code: "",
    name: "",
    timezone: "Europe/Lisbon",
    defaultLanguage: "en" as (typeof LANGUAGE_OPTIONS)[number],
    n1Email: "",
    n1Name: "",
    n2Email: "",
    n2Name: "",
    n3Email: "",
    n3Name: "",
  };
}

export function CorporatePlantForm({
  plants = [],
  selectedPlantId = null,
  labels = getStaticN0MasterDataUi("en"),
  showPlantSelector = true,
}: CorporatePlantFormProps) {
  const router = useRouter();
  const selectedPlant = useMemo(
    () => plants.find((plant) => plant.id === selectedPlantId) ?? plants[0] ?? null,
    [plants, selectedPlantId],
  );

  const [createForm, setCreateForm] = useState(emptyCreateState());
  const [createMessage, setCreateMessage] = useState("");
  const [generatedPasswords, setGeneratedPasswords] = useState<Array<{ role: RoleCode; email: string | null; password: string | null }>>([]);
  const [createLoading, setCreateLoading] = useState(false);

  const [editingPlantId, setEditingPlantId] = useState<string | null>(selectedPlant?.id ?? null);
  const [editCode, setEditCode] = useState(selectedPlant?.code ?? "");
  const [editName, setEditName] = useState(selectedPlant?.name ?? "");
  const [editTimezone, setEditTimezone] = useState(selectedPlant?.timezone ?? "Europe/Lisbon");
  const [editLanguage, setEditLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]>(selectedPlant?.defaultLanguage ?? "en");
  const [editIsActive, setEditIsActive] = useState(selectedPlant?.isActive ?? true);
  const [editMessage, setEditMessage] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setEditingPlantId(selectedPlant?.id ?? null);
    setEditCode(selectedPlant?.code ?? "");
    setEditName(selectedPlant?.name ?? "");
    setEditTimezone(selectedPlant?.timezone ?? "Europe/Lisbon");
    setEditLanguage(selectedPlant?.defaultLanguage ?? "en");
    setEditIsActive(selectedPlant?.isActive ?? true);
    setEditMessage("");
  }, [selectedPlant]);

  function selectPlant(plant: ManagedPlant) {
    setEditingPlantId(plant.id);
    setEditCode(plant.code);
    setEditName(plant.name);
    setEditTimezone(plant.timezone);
    setEditLanguage(plant.defaultLanguage);
    setEditIsActive(plant.isActive);
    setEditMessage("");
    router.push(`/app/settings?plant=${plant.code}`);
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateLoading(true);
    setCreateMessage("");
    setGeneratedPasswords([]);

    try {
      const response = await fetch("/api/corporate/plants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: createForm.code,
          name: createForm.name,
          timezone: createForm.timezone,
          defaultLanguage: createForm.defaultLanguage,
          n1: { email: createForm.n1Email, name: createForm.n1Name },
          n2: { email: createForm.n2Email, name: createForm.n2Name, language: createForm.defaultLanguage },
          n3: { email: createForm.n3Email, name: createForm.n3Name, language: createForm.defaultLanguage },
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? labels.failedToSavePlant);
      }

      setGeneratedPasswords(json.data.generatedPasswords ?? []);
      setCreateMessage(labels.plantSaved);
      setCreateForm(emptyCreateState());
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : labels.failedToSavePlant);
    } finally {
      setCreateLoading(false);
    }
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingPlantId) return;

    setEditLoading(true);
    setEditMessage("");
    try {
      const response = await fetch(`/api/corporate/plants/${editingPlantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantId: editingPlantId,
          code: editCode,
          name: editName,
          timezone: editTimezone,
          defaultLanguage: editLanguage,
          isActive: editIsActive,
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? labels.failedToUpdatePlant);
      }

      setEditMessage(labels.plantUpdated);
      router.push(`/app/settings?plant=${json.data.plant.code}`);
      router.refresh();
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : labels.failedToUpdatePlant);
    } finally {
      setEditLoading(false);
    }
  }

  async function deletePlant() {
    if (!editingPlantId || !selectedPlant) return;
    const confirmed = window.confirm(formatMasterDataMessage(labels.deletePlantConfirm, { plant: selectedPlant.name }));
    if (!confirmed) return;

    setDeleteLoading(true);
    setEditMessage("");
    try {
      const response = await fetch(`/api/corporate/plants/${editingPlantId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? labels.failedToDeletePlant);
      }

      const nextPlant = plants.find((plant) => plant.id !== editingPlantId);
      setEditMessage(labels.plantDeleted);
      router.push(nextPlant ? `/app/settings?plant=${nextPlant.code}` : "/app/settings");
      router.refresh();
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : labels.failedToDeletePlant);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {plants.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.managePlants}</h2>
          </header>

          {showPlantSelector ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {plants.map((plant) => (
                <button
                  key={plant.id}
                  type="button"
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    plant.id === editingPlantId
                      ? "border-teal-300 bg-teal-50 text-teal-900"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                  onClick={() => selectPlant(plant)}
                >
                  {plant.name} {!plant.isActive ? `(${labels.inactive})` : ""}
                </button>
              ))}
            </div>
          ) : selectedPlant ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.selectedPlantTitle}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedPlant.name} {!selectedPlant.isActive ? `(${labels.inactive})` : ""}
              </p>
            </div>
          ) : null}

          {editingPlantId ? (
            <form onSubmit={submitEdit} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
              <input value={editCode} onChange={(event) => setEditCode(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.plantCode} required />
              <input value={editName} onChange={(event) => setEditName(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.plantName} required />
              <input value={editTimezone} onChange={(event) => setEditTimezone(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.timeZone} required />
              <select value={editLanguage} onChange={(event) => setEditLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number])} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {LANGUAGE_OPTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.toUpperCase()}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                <input type="checkbox" checked={editIsActive} onChange={(event) => setEditIsActive(event.target.checked)} />
                {labels.activePlant}
              </label>

              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="submit" size="sm" disabled={editLoading}>
                  {editLoading ? labels.saving : labels.save}
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled={deleteLoading} onClick={deletePlant}>
                  {deleteLoading ? labels.updating : labels.deletePlant}
                </Button>
              </div>
            </form>
          ) : null}

          {editMessage ? <p className="mt-4 text-sm text-slate-700">{editMessage}</p> : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.createPlant}</h2>
          </div>
          <Link href="/app/corporate" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {labels.backToCorporate}
          </Link>
        </header>

        <form onSubmit={submitCreate} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
          <input value={createForm.code} onChange={(event) => setCreateForm((current) => ({ ...current, code: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.plantCode} required />
          <input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.plantName} required />
          <input value={createForm.timezone} onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.timeZone} required />
          <select value={createForm.defaultLanguage} onChange={(event) => setCreateForm((current) => ({ ...current, defaultLanguage: event.target.value as (typeof LANGUAGE_OPTIONS)[number] }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {LANGUAGE_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.toUpperCase()}
              </option>
            ))}
          </select>

          <input value={createForm.n1Email} onChange={(event) => setCreateForm((current) => ({ ...current, n1Email: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n1Email} required />
          <input value={createForm.n1Name} onChange={(event) => setCreateForm((current) => ({ ...current, n1Name: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n1Name} required />
          <input value={createForm.n2Email} onChange={(event) => setCreateForm((current) => ({ ...current, n2Email: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n2Email} required />
          <input value={createForm.n2Name} onChange={(event) => setCreateForm((current) => ({ ...current, n2Name: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n2Name} required />
          <input value={createForm.n3Email} onChange={(event) => setCreateForm((current) => ({ ...current, n3Email: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n3Email} required />
          <input value={createForm.n3Name} onChange={(event) => setCreateForm((current) => ({ ...current, n3Name: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={labels.n3Name} required />

          <div className="md:col-span-2">
            <Button type="submit" size="sm" disabled={createLoading}>
              {createLoading ? labels.saving : labels.createPlant}
            </Button>
          </div>
        </form>

        {createMessage ? <p className="mt-4 text-sm text-slate-700">{createMessage}</p> : null}

        {generatedPasswords.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{labels.generatedPasswords}</p>
            {generatedPasswords.map((entry) => (
              <p key={`${entry.role}-${entry.email}`}>
                {entry.role} - {entry.email}: {entry.password}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
