"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers3, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { DEFAULT_PROFESSIONAL_RISK_CATEGORIES } from "@/lib/defaults/professional-risks";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";
import { cn } from "@/lib/utils";

type ProfessionalRisk = {
  id: string;
  code: string;
  category: string;
  name: string;
  isActive: boolean;
};

function sortRisks(risks: ProfessionalRisk[]) {
  return [...risks].sort(
    (left, right) =>
      Number(right.isActive) - Number(left.isActive) ||
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name) ||
      left.code.localeCompare(right.code),
  );
}

function groupRisks(risks: ProfessionalRisk[]) {
  const groups = new Map<string, ProfessionalRisk[]>();

  for (const risk of sortRisks(risks)) {
    const entries = groups.get(risk.category) ?? [];
    entries.push(risk);
    groups.set(risk.category, entries);
  }

  return [...groups.entries()].map(([category, entries]) => ({ category, risks: entries }));
}

export function ProfessionalRisksManager({
  plantCode,
  initialRisks,
  labels = getStaticN0MasterDataUi("en"),
}: {
  plantCode: string;
  initialRisks: ProfessionalRisk[];
  labels?: N0MasterDataUi;
}) {
  const [risks, setRisks] = useState(sortRisks(initialRisks));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const groupedRisks = useMemo(() => groupRisks(risks), [risks]);
  const categories = useMemo(
    () => [...new Set([...DEFAULT_PROFESSIONAL_RISK_CATEGORIES, ...risks.map((risk) => risk.category)])].sort((left, right) => left.localeCompare(right)),
    [risks],
  );

  useEffect(() => {
    setRisks(sortRisks(initialRisks));
  }, [initialRisks]);

  function clearForm() {
    setEditingId(null);
    setCode("");
    setCategory("");
    setName("");
  }

  function startEdit(risk: ProfessionalRisk) {
    setEditingId(risk.id);
    setCode(risk.code);
    setCategory(risk.category);
    setName(risk.name);
    setMessage(formatMasterDataMessage(labels.professionalRisks.editing, { code: risk.code }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/professional-risks`, {
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
        throw new Error(json.message ?? labels.professionalRisks.saveError);
      }

      const risk = json.data.risk as ProfessionalRisk;
      setRisks((current) => sortRisks([...current.filter((entry) => entry.id !== risk.id && entry.code !== risk.code), risk]));
      clearForm();
      setMessage(editingId ? labels.professionalRisks.savedUpdated : labels.professionalRisks.savedCreated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.professionalRisks.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function syncDefaults() {
    setSyncing(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/professional-risks/defaults`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.professionalRisks.syncError);
      }

      setRisks(sortRisks((json.data.risks as ProfessionalRisk[]).map((risk) => ({
        id: risk.id,
        code: risk.code,
        category: risk.category,
        name: risk.name,
        isActive: risk.isActive,
      }))));
      clearForm();
      setMessage(formatMasterDataMessage(labels.professionalRisks.syncSuccess, { count: json.data.summary.professionalRisks }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.professionalRisks.syncError);
    } finally {
      setSyncing(false);
    }
  }

  async function activateRisk(risk: ProfessionalRisk) {
    setTogglingId(risk.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/professional-risks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: risk.id,
          code: risk.code,
          category: risk.category,
          name: risk.name,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.professionalRisks.activateError);
      }

      const updatedRisk = json.data.risk as ProfessionalRisk;
      setRisks((current) => sortRisks(current.map((entry) => (entry.id === updatedRisk.id ? updatedRisk : entry))));
      setMessage(labels.professionalRisks.activateSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.professionalRisks.activateError);
    } finally {
      setTogglingId(null);
    }
  }

  async function deactivateRisk(risk: ProfessionalRisk) {
    if (!window.confirm(formatMasterDataMessage(labels.professionalRisks.disableConfirm, { code: risk.code }))) {
      return;
    }

    setTogglingId(risk.id);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/professional-risks`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: risk.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.professionalRisks.disableError);
      }

      setRisks((current) => sortRisks(current.map((entry) => (entry.id === risk.id ? { ...entry, isActive: false } : entry))));
      if (editingId === risk.id) clearForm();
      setMessage(labels.professionalRisks.disableSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.professionalRisks.disableError);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="app-panel space-y-5 rounded-xl p-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            <Layers3 className="h-4 w-4" />
            {labels.professionalRisks.eyebrow}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-950">{labels.professionalRisks.title}</h2>
            <HelpPopover
              title={labels.professionalRisks.title}
              body={labels.professionalRisks.help}
              buttonLabel={labels.helpButton}
            />
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={syncDefaults} disabled={syncing}>
          <RefreshCw className={cn("h-4 w-4", syncing ? "animate-spin" : "")} />
          {syncing ? labels.professionalRisks.syncing : labels.professionalRisks.syncDefaultList}
        </Button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">{editingId ? labels.professionalRisks.editRisk : labels.professionalRisks.createRisk}</h3>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={clearForm}>
                {labels.users.cancelEdit}
              </button>
            ) : null}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.professionalRisks.code}</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 px-3 text-sm"
              placeholder="PR-MEC-001"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.professionalRisks.category}</span>
            <input
              list="professional-risk-categories"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 px-3 text-sm"
              placeholder="Mechanical"
              required
            />
            <datalist id="professional-risk-categories">
              {categories.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.professionalRisks.riskSubcategory}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-slate-300 px-3 text-sm"
              placeholder="Esmagamento"
              required
            />
          </label>
          <Button type="submit" size="sm" disabled={saving}>
            {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? labels.saving : editingId ? labels.professionalRisks.saveRisk : labels.professionalRisks.addRisk}
          </Button>
        </form>

        <div className="space-y-4">
          {risks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {labels.professionalRisks.noRisksTitle}
              </div>
              <p className="mt-1">{labels.professionalRisks.noRisksHelp}</p>
            </div>
          ) : null}

          {groupedRisks.map((group) => (
            <article key={group.category} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-950">{group.category}</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {formatMasterDataMessage(labels.professionalRisks.activeCount, { active: group.risks.filter((risk) => risk.isActive).length, total: group.risks.length })}
                </span>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {group.risks.map((risk) => (
                  <div key={risk.id} className="flex flex-col gap-2 py-2 md:flex-row md:items-center md:justify-between">
                    <p className="min-w-0 text-sm text-slate-700">
                      <span className="font-bold text-slate-950">{risk.code}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      {risk.name}
                      {!risk.isActive ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{labels.professionalRisks.inactive}</span>
                      ) : null}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" className="text-xs font-semibold text-slate-600 hover:text-slate-950" onClick={() => startEdit(risk)}>
                        {labels.edit}
                      </button>
                      {risk.isActive ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                          onClick={() => void deactivateRisk(risk)}
                          disabled={Boolean(togglingId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {togglingId === risk.id ? labels.professionalRisks.disabling : labels.professionalRisks.disable}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                          onClick={() => void activateRisk(risk)}
                          disabled={Boolean(togglingId)}
                        >
                          {togglingId === risk.id ? labels.professionalRisks.activating : labels.professionalRisks.activate}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      {message ? <p className="text-sm font-medium text-slate-600">{message}</p> : null}
    </section>
  );
}
