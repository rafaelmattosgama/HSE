"use client";

import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionPriority } from "@prisma/client";
import { Camera, FileUp, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { uploadAttachment } from "@/lib/client-api";
import {
  SMAT_ATTACHMENT_ACCEPT,
  SMAT_ATTACHMENT_LIMITS,
  getSmatAttachmentContentType,
  isSmatPreviewableImage,
  validateSmatAttachmentCollection,
  validateSmatAttachmentFile,
} from "@/lib/smat-attachments";

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

type AttachmentDraft = {
  id: string;
  file: File;
  caption: string;
  contentType: string;
  previewUrl: string | null;
  error: string | null;
};

const CATEGORY_OPTIONS: Array<{ code: ObservationRow["category"]; label: string }> = [
  { code: "A", label: "A - Local de trabalho" },
  { code: "B", label: "B - Posição das pessoas" },
  { code: "C", label: "C - Comportamento perigoso" },
  { code: "D", label: "D - EPI" },
  { code: "E", label: "E - Ferramentas & equipamentos" },
  { code: "F", label: "F - Reações das pessoas" },
];

const QUESTIONS = [
  "1) Qual é a tarefa mais perigosa que tem de fazer e quais são os principais riscos envolvidos?",
  "2) Onde estão as regras e procedimentos para o seu trabalho e onde pode encontrar as informações?",
  "3) Com quem fala se encontrar novos riscos no seu local de trabalho ou se tiver ideias de melhoria?",
  "4) Quando foi a última vez que falou sobre segurança e que informações recebeu?",
  "5) Porque é que a segurança é importante para si e para a nossa empresa?",
  "6) Como envolve os seus colegas na prevenção de riscos?",
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

function createAttachmentId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPreviewUrl(file: File, contentType: string) {
  if (!isSmatPreviewableImage(file.name, contentType) || typeof URL.createObjectURL !== "function") {
    return null;
  }

  return URL.createObjectURL(file);
}

function revokePreviewUrl(attachment: AttachmentDraft) {
  if (attachment.previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function createAttachmentDraft(file: File): AttachmentDraft {
  const contentType = getSmatAttachmentContentType(file.name, file.type);

  return {
    id: createAttachmentId(),
    file,
    caption: "",
    contentType,
    previewUrl: createPreviewUrl(file, contentType),
    error: validateSmatAttachmentFile({
      fileName: file.name,
      contentType,
      size: file.size,
    }),
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const attachmentsRef = useRef<AttachmentDraft[]>([]);

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
  const attachmentCollectionError = useMemo(
    () => validateSmatAttachmentCollection(attachments.map((attachment) => ({ size: attachment.file.size }))),
    [attachments],
  );
  const attachmentError = attachmentCollectionError ?? attachments.find((attachment) => attachment.error)?.error ?? "";
  const hasInvalidAttachments = Boolean(attachmentError);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(revokePreviewUrl);
    };
  }, []);

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

  function addAttachmentFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const drafts = files.map(createAttachmentDraft);
    const nextAttachments = [...attachments, ...drafts];
    const nextError =
      validateSmatAttachmentCollection(nextAttachments.map((attachment) => ({ size: attachment.file.size }))) ??
      drafts.find((attachment) => attachment.error)?.error ??
      "";

    setAttachments(nextAttachments);
    setMessage(nextError);
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    addAttachmentFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function updateAttachmentCaption(id: string, caption: string) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === id
          ? { ...attachment, caption: caption.slice(0, SMAT_ATTACHMENT_LIMITS.maxCaptionLength) }
          : attachment,
      ),
    );
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const attachment = current.find((entry) => entry.id === id);
      if (attachment) revokePreviewUrl(attachment);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function uploadAttachments() {
    const uploaded: Array<{ fileKey: string; fileName: string; contentType: string; caption?: string; size: number }> = [];

    for (const attachment of attachments) {
      const { file, contentType } = attachment;
      let uploadResult: { key: string };
      try {
        uploadResult = await uploadAttachment({
          plantCode,
          folder: "smat",
          file,
          contentType,
          fallbackErrorMessage: "Não foi possível preparar o carregamento da imagem SMAT.",
        });
      } catch {
        throw new Error(`Nao foi possivel carregar ${file.name}`);
      }

      uploaded.push({
        fileKey: uploadResult.key,
        fileName: file.name,
        contentType,
        caption: attachment.caption.trim() || undefined,
        size: file.size,
      });
    }

    return uploaded;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (hasInvalidAttachments) {
      setMessage(attachmentError);
      return;
    }

    setBusy(true);

    try {
      const uploadedAttachments = attachments.length ? await uploadAttachments() : [];

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
          attachments: uploadedAttachments,
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
        throw new Error(json.message ?? "Não foi possível gravar a auditoria SMAT.");
      }

      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gravar a auditoria SMAT.");
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
        </div>
        <Button type="submit" disabled={busy || hasInvalidAttachments}>{busy ? "A gravar..." : "Gravar auditoria"}</Button>
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
          <span className="mb-1 block font-medium">Hora de início</span>
          <input type="time" value={form.startTimeText} onChange={(event) => setForm((current) => ({ ...current, startTimeText: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Hora de fim</span>
          <input type="time" value={form.endTimeText} onChange={(event) => setForm((current) => ({ ...current, endTimeText: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700 md:col-span-2">
          <span className="mb-1 block font-medium">Área examinada</span>
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
          <CountInput label="Pessoas não seguras" value={form.peopleUnsafeCount} onChange={(value) => setForm((current) => ({ ...current, peopleUnsafeCount: value }))} />
          <CountInput label="Condições seguras" value={form.workConditionsSafeCount} onChange={(value) => setForm((current) => ({ ...current, workConditionsSafeCount: value }))} />
          <CountInput label="Condições não seguras" value={form.workConditionsUnsafeCount} onChange={(value) => setForm((current) => ({ ...current, workConditionsUnsafeCount: value }))} />
          <CountInput label="Reações positivas" value={form.reactionsPositiveCount} onChange={(value) => setForm((current) => ({ ...current, reactionsPositiveCount: value }))} />
          <CountInput label="Reações negativas" value={form.reactionsNegativeCount} onChange={(value) => setForm((current) => ({ ...current, reactionsNegativeCount: value }))} />
        </div>
      </section>

      <ObservationSection title='AS "ATOS SEGUROS" (ação positiva observada)' rows={safeActs} onAdd={() => addObservation(setSafeActs, "A")} onChange={(index, patch) => updateObservation(setSafeActs, index, patch)} onRemove={(index) => removeObservation(setSafeActs, index)} />
      <ObservationSection title='CS "CONDIÇÃO SEGURA" (condições positivas observadas)' rows={safeConditions} onAdd={() => addObservation(setSafeConditions, "A")} onChange={(index, patch) => updateObservation(setSafeConditions, index, patch)} onRemove={(index) => removeObservation(setSafeConditions, index)} />
      <ObservationSection title='AI "ATO INSEGURO" (ação negativa observada)' rows={unsafeActs} onAdd={() => addObservation(setUnsafeActs, "C")} onChange={(index, patch) => updateObservation(setUnsafeActs, index, patch)} onRemove={(index) => removeObservation(setUnsafeActs, index)} />
      <ObservationSection title='CI "CONDIÇÃO INSEGURA" (condições negativas observadas)' rows={unsafeConditions} onAdd={() => addObservation(setUnsafeConditions, "A")} onChange={(index, patch) => updateObservation(setUnsafeConditions, index, patch)} onRemove={(index) => removeObservation(setUnsafeConditions, index)} />

      <section className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Ações</h3>
            <p className="mt-1 text-sm text-slate-500">As ações criadas aqui entram automaticamente no módulo Actions e ficam rastreadas no SMAT.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setActionPlans((current) => [...current, emptyActionPlan()])}>Adicionar ação</Button>
        </div>

        <div className="space-y-3">
          {actionPlans.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
              <input value={row.title} onChange={(event) => updateActionPlan(index, { title: event.target.value })} placeholder="Título da ação" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={row.ownerUserId} onChange={(event) => updateActionPlan(index, { ownerUserId: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Responsável</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
              <textarea value={row.description} onChange={(event) => updateActionPlan(index, { description: event.target.value })} rows={3} placeholder="Descrição da ação" className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={row.priority} onChange={(event) => updateActionPlan(index, { priority: event.target.value as ActionPriority })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value={ActionPriority.LOW}>Baixa</option>
                <option value={ActionPriority.MEDIUM}>Média</option>
                <option value={ActionPriority.HIGH}>Alta</option>
              </select>
              <div className="flex gap-2">
                <input type="date" value={row.dueDate} onChange={(event) => updateActionPlan(index, { dueDate: event.target.value })} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setActionPlans((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remover</Button>
              </div>
            </div>
          ))}
          {actionPlans.length === 0 ? <p className="text-sm text-slate-500">Sem ações a criar.</p> : null}
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

      <section className="space-y-4 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Ficheiros / Fotografias</h3>
            <p className="mt-1 text-sm text-slate-500">
              Anexe fotos, PDFs ou documentos. Limite: {SMAT_ATTACHMENT_LIMITS.maxFiles} ficheiros, {SMAT_ATTACHMENT_LIMITS.maxFileSizeBytes / 1024 / 1024} MB por ficheiro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={buttonVariants({ variant: "secondary", size: "sm", className: "cursor-pointer" })}>
              <FileUp className="h-4 w-4" />
              <span>Adicionar ficheiros</span>
              <input
                type="file"
                accept={SMAT_ATTACHMENT_ACCEPT}
                multiple
                onChange={handleAttachmentInputChange}
                className="sr-only"
              />
            </label>
            <label className={buttonVariants({ variant: "secondary", size: "sm", className: "cursor-pointer" })}>
              <Camera className="h-4 w-4" />
              <span>Tirar fotografia</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAttachmentInputChange}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {attachmentError ? <p className="text-sm font-medium text-rose-700">{attachmentError}</p> : null}

        {attachments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            Sem ficheiros selecionados.
          </p>
        ) : (
          <div className="grid gap-3">
            {attachments.map((attachment) => (
              <article key={attachment.id} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[88px_minmax(0,1fr)_auto]">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.previewUrl} alt={`Previsualizacao de ${attachment.file.name}`} className="h-full w-full object-cover" />
                  ) : (
                    <FileUp className="h-7 w-7 text-slate-400" />
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="truncate text-sm font-semibold text-slate-900">{attachment.file.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(attachment.file.size)} | {attachment.contentType}</p>
                    {attachment.error ? <p className="mt-1 text-xs font-medium text-rose-700">{attachment.error}</p> : null}
                  </div>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block font-medium">Legenda</span>
                    <input
                      value={attachment.caption}
                      onChange={(event) => updateAttachmentCaption(attachment.id, event.target.value)}
                      maxLength={SMAT_ATTACHMENT_LIMITS.maxCaptionLength}
                      placeholder="Legenda opcional"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <Button type="button" variant="ghost" size="sm" onClick={() => removeAttachment(attachment.id)} className="self-start">
                  <Trash2 className="h-4 w-4" />
                  <span>Remover</span>
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      {message ? <p className="text-sm text-rose-700">{message}</p> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Lembre-se de agradecer aos operadores pelo tempo que dedicaram e certifique-se de que as suas sugestões são avaliadas.
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || hasInvalidAttachments}>{busy ? "A gravar..." : "Gravar auditoria"}</Button>
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
            <textarea rows={2} value={row.description} onChange={(event) => onChange(index, { description: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Descreva a observação" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>Remover</Button>
          </div>
        ))}
      </div>
    </section>
  );
}
