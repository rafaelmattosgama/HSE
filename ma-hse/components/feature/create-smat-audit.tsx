"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useState } from "react";
import { ActionPriority } from "@prisma/client";
import { Button } from "@/components/ui/button";

type ObservationRow = {
  category: "A" | "B" | "C" | "D" | "E" | "F";
  description: string;
};

type ActionPlanRow = {
  title: string;
  description: string;
  ownerUserId: string;
  priority: ActionPriority;
  dueDate: string;
};

type OwnerOption = {
  id: string;
  name: string;
};

const CATEGORY_OPTIONS: Array<{ code: ObservationRow["category"]; label: string }> = [
  { code: "A", label: "A - Local de trabalho" },
  { code: "B", label: "B - Posicao das pessoas" },
  { code: "C", label: "C - Comportamento perigoso" },
  { code: "D", label: "D - EPI" },
  { code: "E", label: "E - Ferramentas & equipamentos" },
  { code: "F", label: "F - Reacoes das pessoas" },
];

const QUESTIONS = [
  "1) Qual e a tarefa mais perigosa que voce tem que fazer e quais sao os principais riscos envolvidos?",
  "2) Onde estao as regras, procedimentos para o seu trabalho e onde voce pode encontrar as informacoes?",
  "3) Com quem fala se encontrar novos riscos no seu local de trabalho ou se tiver ideias de melhoria?",
  "4) Quando foi a ultima vez que falou sobre seguranca e que informacoes recebeu?",
  "5) Porque e que a seguranca e importante para si e para nossa empresa?",
  "6) Como e que voce envolve seus colegas para a prevencao de riscos?",
] as const;

const ANSWER_KEYS = ["answer1", "answer2", "answer3", "answer4", "answer5", "answer6"] as const;

function emptyObservation(category: ObservationRow["category"] = "A"): ObservationRow {
  return { category, description: "" };
}

function emptyActionPlan(): ActionPlanRow {
  return {
    title: "",
    description: "",
    ownerUserId: "",
    priority: ActionPriority.MEDIUM,
    dueDate: "",
  };
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function CreateSmatAudit({
  plantCode,
  auditorName,
  owners,
}: {
  plantCode: string;
  auditorName: string;
  owners: OwnerOption[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);

  const [form, setForm] = useState({
    auditorName,
    auditDate: new Date().toISOString().slice(0, 10),
    startTimeText: "",
    endTimeText: "",
    areaExamined: "",
    locationExamined: "",
    peopleObservedCount: "0",
    peopleInvolvedCount: "0",
    peopleSafeCount: "0",
    peopleUnsafeCount: "0",
    workConditionsSafeCount: "0",
    workConditionsUnsafeCount: "0",
    reactionsPositiveCount: "0",
    reactionsNegativeCount: "0",
    answer1: "",
    answer2: "",
    answer3: "",
    answer4: "",
    answer5: "",
    answer6: "",
    notes: "",
  });

  const [safeActs, setSafeActs] = useState<ObservationRow[]>([emptyObservation("A")]);
  const [safeConditions, setSafeConditions] = useState<ObservationRow[]>([emptyObservation("A")]);
  const [unsafeActs, setUnsafeActs] = useState<ObservationRow[]>([emptyObservation("C")]);
  const [unsafeConditions, setUnsafeConditions] = useState<ObservationRow[]>([emptyObservation("A")]);
  const [actionPlans, setActionPlans] = useState<ActionPlanRow[]>([]);

  function updateObservation(
    setter: Dispatch<SetStateAction<ObservationRow[]>>,
    index: number,
    patch: Partial<ObservationRow>,
  ) {
    setter((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addObservation(setter: Dispatch<SetStateAction<ObservationRow[]>>, category: ObservationRow["category"]) {
    setter((current) => [...current, emptyObservation(category)]);
  }

  function removeObservation(setter: Dispatch<SetStateAction<ObservationRow[]>>, index: number) {
    setter((current) => (current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)));
  }

  function updateActionPlan(index: number, patch: Partial<ActionPlanRow>) {
    setActionPlans((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function uploadPhotos() {
    const uploaded: Array<{ fileKey: string; fileName: string; contentType: string }> = [];

    for (const photo of photos) {
      const presignResponse = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantCode,
          fileName: photo.name,
          contentType: photo.type || "image/jpeg",
          folder: "smat",
        }),
      });

      const presignJson = await presignResponse.json();
      if (!presignResponse.ok || !presignJson.ok) {
        throw new Error(presignJson.message ?? "Failed to prepare SMAT image upload");
      }

      const putResponse = await fetch(presignJson.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": photo.type || "image/jpeg" },
        body: photo,
      });

      if (!putResponse.ok) {
        throw new Error(`Failed to upload ${photo.name}`);
      }

      uploaded.push({
        fileKey: presignJson.data.key,
        fileName: photo.name,
        contentType: photo.type || "image/jpeg",
      });
    }

    return uploaded;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const attachments = photos.length ? await uploadPhotos() : [];

      const response = await fetch(`/api/plants/${plantCode}/smat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          peopleObservedCount: parseNumber(form.peopleObservedCount),
          peopleInvolvedCount: parseNumber(form.peopleInvolvedCount),
          peopleSafeCount: parseNumber(form.peopleSafeCount),
          peopleUnsafeCount: parseNumber(form.peopleUnsafeCount),
          workConditionsSafeCount: parseNumber(form.workConditionsSafeCount),
          workConditionsUnsafeCount: parseNumber(form.workConditionsUnsafeCount),
          reactionsPositiveCount: parseNumber(form.reactionsPositiveCount),
          reactionsNegativeCount: parseNumber(form.reactionsNegativeCount),
          safeActs: safeActs.filter((entry) => entry.description.trim().length > 0),
          safeConditions: safeConditions.filter((entry) => entry.description.trim().length > 0),
          unsafeActs: unsafeActs.filter((entry) => entry.description.trim().length > 0),
          unsafeConditions: unsafeConditions.filter((entry) => entry.description.trim().length > 0),
          attachments,
          actionPlans: actionPlans.filter(
            (entry) =>
              entry.title.trim().length > 0 &&
              entry.description.trim().length > 0 &&
              entry.ownerUserId,
          ),
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? "Nao foi possivel gravar a auditoria SMAT.");
      }

      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel gravar a auditoria SMAT.");
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Nova auditoria SMAT</h2>
          <p className="mt-1 text-sm text-slate-600">Checklist operacional com anexos, exportacao e criacao direta de acoes para o modulo Actions.</p>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "A gravar..." : "Gravar auditoria"}</Button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-slate-700 md:col-span-2">
          <span className="mb-1 block font-medium">Auditor</span>
          <input value={form.auditorName} onChange={(event) => setForm((current) => ({ ...current, auditorName: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Data</span>
          <input type="date" value={form.auditDate} onChange={(event) => setForm((current) => ({ ...current, auditDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Hora inicio</span>
          <input type="time" value={form.startTimeText} onChange={(event) => setForm((current) => ({ ...current, startTimeText: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Hora fim</span>
          <input type="time" value={form.endTimeText} onChange={(event) => setForm((current) => ({ ...current, endTimeText: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Fotos / imagens</span>
          <input type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          <span className="mb-1 block font-medium">Area examinada</span>
          <input value={form.areaExamined} onChange={(event) => setForm((current) => ({ ...current, areaExamined: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          <span className="mb-1 block font-medium">Local examinado</span>
          <input value={form.locationExamined} onChange={(event) => setForm((current) => ({ ...current, locationExamined: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Contagens observadas</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CountInput label="Pessoas observadas" value={form.peopleObservedCount} onChange={(value) => setForm((current) => ({ ...current, peopleObservedCount: value }))} />
          <CountInput label="Pessoas envolvidas" value={form.peopleInvolvedCount} onChange={(value) => setForm((current) => ({ ...current, peopleInvolvedCount: value }))} />
          <CountInput label="Pessoas seguras" value={form.peopleSafeCount} onChange={(value) => setForm((current) => ({ ...current, peopleSafeCount: value }))} />
          <CountInput label="Pessoas nao seguras" value={form.peopleUnsafeCount} onChange={(value) => setForm((current) => ({ ...current, peopleUnsafeCount: value }))} />
          <CountInput label="Condicoes seguras" value={form.workConditionsSafeCount} onChange={(value) => setForm((current) => ({ ...current, workConditionsSafeCount: value }))} />
          <CountInput label="Condicoes nao seguras" value={form.workConditionsUnsafeCount} onChange={(value) => setForm((current) => ({ ...current, workConditionsUnsafeCount: value }))} />
          <CountInput label="Reacoes positivas" value={form.reactionsPositiveCount} onChange={(value) => setForm((current) => ({ ...current, reactionsPositiveCount: value }))} />
          <CountInput label="Reacoes negativas" value={form.reactionsNegativeCount} onChange={(value) => setForm((current) => ({ ...current, reactionsNegativeCount: value }))} />
        </div>
      </section>

      <ObservationSection title='AS "ATOS SEGUROS" (acao positiva observada)' rows={safeActs} onAdd={() => addObservation(setSafeActs, "A")} onChange={(index, patch) => updateObservation(setSafeActs, index, patch)} onRemove={(index) => removeObservation(setSafeActs, index)} />
      <ObservationSection title='CS "CONDICAO SEGURA" (condicoes positivas observadas)' rows={safeConditions} onAdd={() => addObservation(setSafeConditions, "A")} onChange={(index, patch) => updateObservation(setSafeConditions, index, patch)} onRemove={(index) => removeObservation(setSafeConditions, index)} />
      <ObservationSection title='AI "ATO INSEGURO" (acao negativa observada)' rows={unsafeActs} onAdd={() => addObservation(setUnsafeActs, "C")} onChange={(index, patch) => updateObservation(setUnsafeActs, index, patch)} onRemove={(index) => removeObservation(setUnsafeActs, index)} />
      <ObservationSection title='CI "CONDICAO INSEGURA" (condicoes negativas observadas)' rows={unsafeConditions} onAdd={() => addObservation(setUnsafeConditions, "A")} onChange={(index, patch) => updateObservation(setUnsafeConditions, index, patch)} onRemove={(index) => removeObservation(setUnsafeConditions, index)} />

      <section className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Acoes</h3>
            <p className="mt-1 text-sm text-slate-500">As acoes criadas aqui entram automaticamente no modulo Actions e ficam rastreadas no SMAT.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setActionPlans((current) => [...current, emptyActionPlan()])}>Adicionar acao</Button>
        </div>

        <div className="space-y-3">
          {actionPlans.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
              <input value={row.title} onChange={(event) => updateActionPlan(index, { title: event.target.value })} placeholder="Titulo da acao" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={row.ownerUserId} onChange={(event) => updateActionPlan(index, { ownerUserId: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Responsavel</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
              <textarea value={row.description} onChange={(event) => updateActionPlan(index, { description: event.target.value })} rows={3} placeholder="Descricao da acao" className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={row.priority} onChange={(event) => updateActionPlan(index, { priority: event.target.value as ActionPriority })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value={ActionPriority.LOW}>Low</option>
                <option value={ActionPriority.MEDIUM}>Medium</option>
                <option value={ActionPriority.HIGH}>High</option>
              </select>
              <div className="flex gap-2">
                <input type="date" value={row.dueDate} onChange={(event) => updateActionPlan(index, { dueDate: event.target.value })} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setActionPlans((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remover</Button>
              </div>
            </div>
          ))}
          {actionPlans.length === 0 ? <p className="text-sm text-slate-500">Sem acoes a criar.</p> : null}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Guia de perguntas</h3>
        {QUESTIONS.map((question, index) => (
          <label key={question} className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">{question}</span>
            <textarea
              rows={3}
              value={form[ANSWER_KEYS[index]]}
              onChange={(event) => setForm((current) => ({ ...current, [ANSWER_KEYS[index]]: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        ))}
      </section>

      <label className="block text-sm text-slate-700">
        <span className="mb-1 block font-medium">Notas</span>
        <textarea rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>

      {photos.length > 0 ? <p className="text-sm text-slate-500">{photos.length} ficheiro(s) pronto(s) para upload.</p> : null}
      {message ? <p className="text-sm text-rose-700">{message}</p> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Lembre-se de agradecer aos operadores pelo tempo que dedicaram e certifique-se de que as suas sugestoes sao avaliadas.
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "A gravar..." : "Gravar auditoria"}</Button>
      </div>
    </form>
  );
}

function CountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" />
    </label>
  );
}

function ObservationSection({
  title,
  rows,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  rows: ObservationRow[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<ObservationRow>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>Adicionar linha</Button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={`${title}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[220px_1fr_auto]">
            <select value={row.category} onChange={(event) => onChange(index, { category: event.target.value as ObservationRow["category"] })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
            <textarea rows={2} value={row.description} onChange={(event) => onChange(index, { description: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Descreva a observacao" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>Remover</Button>
          </div>
        ))}
      </div>
    </section>
  );
}
