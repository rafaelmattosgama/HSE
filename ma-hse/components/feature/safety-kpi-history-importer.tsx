"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";

type Preview = {
  batchId: string; fileName: string; fileHash: string;
  summary: { total: number; validNew: number; duplicateFile: number; existingDb: number; invalid: number; warnings: number };
  rows: Array<{ rowNumber: number; recordKey: string | null; status: string; normalized: { plantCode: string; year: number; month: number }; calculated: { frequencyRate: string; gravityRate: string }; errors: string[]; warnings: string[] }>;
};

export function SafetyKpiHistoryImporter({ allowReplace }: { allowReplace: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [strategy, setStrategy] = useState<"SKIP" | "REPLACE">("SKIP");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runPreview() {
    if (!file) return;
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/safety-kpi-history/import/preview", { method: "POST", body });
      const result = await requireApiResponse<Preview>(response, "Não foi possível validar o ficheiro.");
      setPreview(result.data ?? null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível validar o ficheiro."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/safety-kpi-history/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ batchId: preview.batchId, conflictStrategy: strategy }) });
      const result = await requireApiResponse<{ imported: number; skipped: number; errors: number; status: string }>(response, "Não foi possível concluir a importação.");
      setMessage(`Batch ${preview.batchId}: ${result.data?.imported ?? 0} importadas, ${result.data?.skipped ?? 0} ignoradas, ${result.data?.errors ?? 0} erros.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir a importação."); }
    finally { setBusy(false); }
  }

  const cards = preview ? [
    ["NEW", preview.summary.validNew, "text-emerald-700"], ["EXISTS_DB", preview.summary.existingDb, "text-amber-700"],
    ["DUPLICATE_FILE", preview.summary.duplicateFile, "text-orange-700"], ["INVALID", preview.summary.invalid, "text-rose-700"],
    ["Warnings", preview.summary.warnings, "text-sky-700"],
  ] as const : [];
  const canCommit = Boolean(preview && (preview.summary.validNew > 0 || (allowReplace && strategy === "REPLACE" && preview.summary.existingDb > 0)));
  const statusClass: Record<string, string> = {
    NEW: "border-emerald-200 bg-emerald-50 text-emerald-700",
    EXISTS_DB: "border-amber-200 bg-amber-50 text-amber-700",
    DUPLICATE_FILE: "border-orange-200 bg-orange-50 text-orange-700",
    INVALID: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return <section className="app-panel space-y-4 rounded-2xl p-5" id="safety-kpi-history-import">
    <div><p className="app-section-eyebrow">Dashboard de Segurança</p><h2 className="mt-1 text-lg font-bold text-slate-950">Importar KPI históricos</h2><p className="mt-1 text-sm text-slate-600">Selecione um .xlsx até 10 MB com a folha KPI_Import. A validação cria uma pré-visualização auditável e não altera os KPI.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm"><span className="mb-1 block font-medium text-slate-700">Ficheiro Excel</span><input type="file" accept=".xlsx" className="app-field w-full" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(""); }} /></label>
      <Button type="button" disabled={!file || busy} onClick={() => void runPreview()}><Upload className="h-4 w-4" />{busy ? "A validar..." : "Pré-visualizar"}</Button>
    </div>
    {preview ? <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{cards.map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className={`text-xs font-semibold ${color}`}>{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div>)}</div>
      <div className="app-table-shell max-h-[34rem] overflow-auto"><table className="app-table min-w-[920px]"><thead><tr><th>Linha</th><th>Chave</th><th>Estado</th><th>Frequência</th><th>Gravidade</th><th>Mensagens</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.recordKey ?? "—"}</td><td><span className={`app-chip ${statusClass[row.status] ?? ""}`}>{row.status}</span></td><td>{row.calculated.frequencyRate}</td><td>{row.calculated.gravityRate}</td><td className="max-w-md whitespace-normal">{[...row.errors, ...row.warnings].join(" · ") || "—"}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div><p className="text-sm font-semibold">Batch ID</p><p data-no-translate className="break-all text-xs text-slate-600">{preview.batchId}</p><a className="mt-1 inline-block text-xs font-semibold text-blue-700 underline" href={`/api/safety-kpi-history/import/batches/${preview.batchId}`} target="_blank" rel="noreferrer">Abrir detalhe auditável do lote</a></div>
        <div className="flex items-center gap-2">{allowReplace ? <select className="app-field h-10" value={strategy} onChange={event => setStrategy(event.target.value as "SKIP" | "REPLACE")}><option value="SKIP">Ignorar existentes</option><option value="REPLACE">Substituir existentes</option></select> : null}<Button type="button" disabled={busy || !canCommit} onClick={() => void commit()}>{busy ? "A importar..." : "Confirmar importação"}</Button></div>
      </div>
    </> : null}
    {message ? <p role="status" className="text-sm font-medium text-slate-700">{message}</p> : null}
  </section>;
}
