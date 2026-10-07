"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AppHero, AppPanel } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { TrainingIndicators } from "@/components/feature/training-indicators";
import { formatTrainingDuration, TRAINING_CATEGORIES, TRAINING_CATEGORY_LABELS, type PlantTrainingRow, type TrainingMetricRow, type TrainingTopicOption, type TrainingWorkerOption } from "@/lib/plant-training";
import { trainingErrorMessage, type TrainingUi } from "@/lib/training-ui";

type Props = {
  plant: string; records: PlantTrainingRow[]; metricRows: TrainingMetricRow[]; workerCount: number;
  topics: TrainingTopicOption[]; workers: TrainingWorkerOption[]; canRegister: boolean; canAdmin: boolean;
  personalRecords: boolean; today: string; locale: string; ui: TrainingUi;
};

export function PlantTrainingManager(props: Props) {
  const { plant, records, topics, ui, today, locale } = props;
  const router = useRouter();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [topicId, setTopicId] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const years = [...new Set([currentYear, year, ...props.metricRows.map(row => Number(row.occurredOn.slice(0, 4)))])].sort((a, b) => b - a);
  const filtered = records.filter(row => Number(row.occurredOn.slice(0, 4)) === year && (!topicId || row.topicId === topicId) && (!category || row.category === category));
  const activeTopics = topics.filter(topic => topic.isActive);
  const dateFormat = new Intl.DateTimeFormat(locale, { timeZone: "UTC" });
  return <div className="min-w-0 space-y-5">
    <AppHero title={ui.training} actions={props.canRegister && <Button type="button" disabled={!activeTopics.length} onClick={() => setOpen(true)}>{ui.add}</Button>} />
    {!activeTopics.length && <div className="app-empty"><p>{ui.noTopics}</p>{props.canAdmin && <Link className="mt-2 inline-block font-semibold underline" href={`/app/${plant}/admin#training-topics`}>{ui.admin}</Link>}</div>}
    <AppPanel><div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-bold">{ui.indicators}</h2><p className="mt-1 text-sm text-slate-600">{ui.indicatorHelp}</p></div>
      <label className="space-y-1"><span className="block text-sm font-semibold">{ui.year}</span><select className="app-field" value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div></AppPanel>
    <TrainingIndicators rows={props.metricRows} year={year} workerCount={props.workerCount} ui={ui} locale={locale} />
    <AppPanel>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 space-y-1"><span className="text-sm font-semibold">{ui.topic}</span><select className="app-field w-full" value={topicId} onChange={e => setTopicId(e.target.value)}><option value="">{ui.allTopics}</option>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
        <label className="min-w-0 space-y-1"><span className="text-sm font-semibold">{ui.type}</span><select className="app-field w-full" value={category} onChange={e => setCategory(e.target.value)}><option value="">{ui.allTypes}</option>{TRAINING_CATEGORIES.map(type => <option key={type} value={type}>{TRAINING_CATEGORY_LABELS[type]}</option>)}</select></label>
      </div>
      {props.personalRecords && <p className="mb-3 text-sm text-slate-600">{ui.personalRecords}</p>}
      <div className="app-table-shell" role="region" aria-label={ui.training} tabIndex={0}><table className="app-table min-w-[760px]">
        <thead><tr>{[ui.date, ui.topic, ui.type, ui.duration, ui.trainee, ui.trainers].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map(row => <tr key={row.id}>
          <td className="whitespace-nowrap">{dateFormat.format(new Date(`${row.occurredOn}T00:00:00Z`))}</td><td data-no-translate>{row.topicName}</td><td data-no-translate>{TRAINING_CATEGORY_LABELS[row.category]}</td><td>{formatTrainingDuration(row.durationMinutes)}</td><td data-no-translate>{row.traineeName}</td><td data-no-translate>{row.trainers.join(", ")}</td>
        </tr>)}{!filtered.length && <tr><td colSpan={6} className="text-center">{ui.noRecords}</td></tr>}</tbody>
      </table></div>
    </AppPanel>
    {open && <TrainingRecordModal plant={plant} topics={activeTopics} workers={props.workers} ui={ui} today={today} onClose={() => setOpen(false)} onSaved={date => { setOpen(false); setYear(Number(date.slice(0, 4))); setTopicId(""); setCategory(""); router.refresh(); }} />}
  </div>;
}

export function TrainingRecordModal({ plant, topics, workers, ui, today, onClose, onSaved }: {
  plant: string; topics: TrainingTopicOption[]; workers: TrainingWorkerOption[]; ui: TrainingUi; today: string;
  onClose: () => void; onSaved: (date: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [traineeIds, setTraineeIds] = useState<string[]>([]);
  const [traineeNames, setTraineeNames] = useState<string[]>([]);
  const [trainerId, setTrainerId] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!trainerId) { setError(ui.trainerRequired); return; }
    if (!traineeIds.length && !traineeNames.length) { setError(ui.traineeRequired); return; }
    const data = new FormData(event.currentTarget);
    const occurredOn = String(data.get("occurredOn"));
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/plants/${plant}/competences/training-records`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        occurredOn, topicId: data.get("topicId"), category: data.get("category"), duration: data.get("duration"),
        traineeIds, traineeNames, trainerId,
      }) });
      const json = await response.json();
      if (!response.ok) throw new Error(trainingErrorMessage(json.errorCode, ui));
      onSaved(occurredOn);
    } catch (error) { setError(error instanceof Error ? error.message : ui.error); }
    finally { setSaving(false); }
  }
  const matchingWorkers = workers.filter(worker => `${worker.name} ${worker.employeeNo}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <dialog ref={dialog} aria-labelledby="training-modal-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl backdrop:bg-slate-950/50 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id="training-modal-title" className="text-xl font-bold">{ui.add}</h2><button type="button" disabled={saving} aria-label={ui.cancel} className="app-icon-button" onClick={onClose}><X className="h-5 w-5" /></button></div>
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-sm font-semibold">{ui.date}</span><input type="date" name="occurredOn" className="app-field w-full" defaultValue={today} required /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">{ui.topic}</span><select name="topicId" className="app-field w-full" required defaultValue=""><option value="" disabled>{ui.select}</option>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
        <label className="space-y-1"><span className="text-sm font-semibold">{ui.type}</span><select name="category" className="app-field w-full" defaultValue="" required><option value="" disabled>{ui.select}</option>{TRAINING_CATEGORIES.map(type => <option key={type} value={type}>{TRAINING_CATEGORY_LABELS[type]}</option>)}</select></label>
        <div className="space-y-1"><label htmlFor="training-duration" className="text-sm font-semibold">{ui.duration}</label><input id="training-duration" name="duration" className="app-field w-full" placeholder="00:00" pattern="[0-9]{2,4}:[0-5][0-9]" maxLength={7} required aria-describedby="training-duration-hint" /><p id="training-duration-hint" className="text-xs text-slate-500">{ui.durationHint}</p></div>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-semibold">{ui.trainee}</p>
          <input type="search" aria-label={ui.workerSearch} placeholder={ui.workerSearch} className="app-field w-full" value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label={ui.addTrainer} className="app-field w-full" value="" onChange={e => { const id = e.target.value; if (id) setTraineeIds(current => current.includes(id) ? current : [...current, id]); }}>
            <option value="">{ui.selectWorker}</option>{matchingWorkers.filter(worker => !traineeIds.includes(worker.id)).map(worker => <option key={worker.id} value={worker.id}>{worker.name} · {worker.employeeNo}</option>)}
          </select>
          {manual && <div className="flex gap-2"><input aria-label={ui.manual} className="app-field min-w-0 flex-1" value={manualName} onChange={e => setManualName(e.target.value)} maxLength={160} /><Button type="button" variant="secondary" disabled={!manualName.trim()} onClick={() => { const name = manualName.trim(); if (name && !traineeNames.some(value => value.toLocaleLowerCase() === name.toLocaleLowerCase())) setTraineeNames(current => [...current, name]); setManualName(""); }}>{ui.addTrainer}</Button></div>}
          <button type="button" className="text-sm font-semibold text-[var(--primary)] underline" onClick={() => { setManual(!manual); setManualName(""); }}>{manual ? ui.selectWorker : ui.manual}</button>
          <ul className="flex flex-wrap gap-2">{traineeIds.map(id => <li key={id} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm"><span className="min-w-0 break-words">{workers.find(worker => worker.id === id)?.name}</span><button type="button" aria-label={`${ui.remove} ${workers.find(worker => worker.id === id)?.name}`} onClick={() => setTraineeIds(current => current.filter(value => value !== id))}><X className="h-4 w-4" /></button></li>)}{traineeNames.map(name => <li key={name} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm"><span className="min-w-0 break-words">{name}</span><button type="button" aria-label={`${ui.remove} ${name}`} onClick={() => setTraineeNames(current => current.filter(value => value !== name))}><X className="h-4 w-4" /></button></li>)}</ul>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="block space-y-1"><span className="text-sm font-semibold">{ui.trainers}</span><input type="search" aria-label={ui.workerSearch} placeholder={ui.workerSearch} className="app-field w-full" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label={ui.trainers} className="app-field w-full" value={trainerId} onChange={e => setTrainerId(e.target.value)} required><option value="">{ui.select}</option>{matchingWorkers.map(worker => <option key={worker.id} value={worker.id}>{worker.name} · {worker.employeeNo}</option>)}</select></label>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{ui.cancel}</Button><Button type="submit" disabled={saving}>{saving ? ui.saving : ui.save}</Button></div>
    </form>
  </dialog>;
}
