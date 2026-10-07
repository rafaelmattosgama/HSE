"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppPanel } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import type { TrainingTopicOption } from "@/lib/plant-training";
import { trainingErrorMessage, type TrainingUi } from "@/lib/training-ui";

export function TrainingTopicManager({ plant, topics, ui, readOnly }: { plant: string; topics: TrainingTopicOption[]; ui: TrainingUi; readOnly: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TrainingTopicOption | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(input: { id?: string; name: string; isActive: boolean }) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/plants/${plant}/admin/training-topics`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const json = await response.json();
      if (!response.ok) throw new Error(trainingErrorMessage(json.errorCode, ui));
      setEditing(null); setName(""); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : ui.error); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void save({ id: editing?.id, name, isActive: editing?.isActive ?? true }); }
  return <AppPanel>
    <div id="training-topics" className="space-y-4">
      <h2 className="text-lg font-bold">{ui.catalog}</h2>
      <p className="text-sm text-slate-600">{ui.catalogHelp}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!readOnly && <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 space-y-1"><span className="text-sm font-semibold">{ui.topic}</span><input className="app-field w-full" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={160} required disabled={busy} /></label>
        <Button type="submit" disabled={busy}>{busy ? ui.saving : editing ? ui.save : ui.newTopic}</Button>
        {editing && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(null); setName(""); }}>{ui.cancel}</Button>}
      </form>}
      <div className="app-table-shell"><table className="app-table"><thead><tr><th>{ui.topic}</th><th>{ui.status}</th>{!readOnly && <th>{ui.actions}</th>}</tr></thead><tbody>
        {topics.map(topic => <tr key={topic.id}><td>{topic.name}</td><td>{topic.isActive ? ui.active : ui.inactive}</td>{!readOnly && <td><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(topic); setName(topic.name); }}>{ui.edit}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void save({ ...topic, isActive: !topic.isActive })}>{topic.isActive ? ui.deactivate : ui.activate}</Button></div></td>}</tr>)}
      </tbody></table></div>
    </div>
  </AppPanel>;
}
