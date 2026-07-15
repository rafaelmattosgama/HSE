"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type AuditResult = "success" | "blocked" | "error";

type AgentAuditLog = {
  id: string;
  createdAt: string;
  userId: string | null;
  plantCode: string | null;
  role: string | null;
  eventType: string | null;
  toolName: string | null;
  confirmationId: string | null;
  requestId: string | null;
  result: AuditResult | string | null;
  messageLength: number | null;
  mode: string | null;
  errorCode: string | null;
  status: string | null;
  summary: string | null;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
};

type AgentAuditResponse = {
  access: {
    scope: "global" | "plant";
    role: string;
    plantCode: string;
    canFilterUser: boolean;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  logs: AgentAuditLog[];
};

const RESULT_OPTIONS = ["", "success", "blocked", "error"] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function buildSummary(log: AgentAuditLog) {
  const parts = [
    log.mode ? `mode=${log.mode}` : null,
    log.errorCode ? `error=${log.errorCode}` : null,
    log.status ? `status=${log.status}` : null,
    typeof log.messageLength === "number" ? `messageLength=${log.messageLength}` : null,
    log.summary ? `summary=${log.summary}` : null,
  ].filter(Boolean);

  const output = log.outputSummary ? Object.entries(log.outputSummary).map(([key, value]) => `${key}=${String(value)}`) : [];
  return [...parts, ...output].join(" | ") || "-";
}

export function AgentAuditLogViewer({ plantCode }: { plantCode: string }) {
  const [data, setData] = useState<AgentAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    eventType: "",
    toolName: "",
    result: "",
    requestId: "",
    userId: "",
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "25");
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) params.set(key, value.trim());
    }
    return params.toString();
  }, [filters, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/plants/${plantCode}/agent-audit?${query}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.ok) {
          throw new Error(json.message ?? "Nao foi possivel carregar os logs do agente.");
        }
        return json.data as AgentAuditResponse;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Nao foi possivel carregar os logs do agente.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [plantCode, query]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Data inicial
            <input type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Data final
            <input type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Event type
            <input value={filters.eventType} onChange={(event) => updateFilter("eventType", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Tool
            <input value={filters.toolName} onChange={(event) => updateFilter("toolName", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Resultado
            <select value={filters.result} onChange={(event) => updateFilter("result", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {RESULT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option || "Todos"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            Request ID
            <input value={filters.requestId} onChange={(event) => updateFilter("requestId", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {data?.access.canFilterUser ? (
            <label className="space-y-1 text-xs font-medium text-slate-600">
              User ID
              <input value={filters.userId} onChange={(event) => updateFilter("userId", event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
          ) : null}
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilters({ dateFrom: "", dateTo: "", eventType: "", toolName: "", result: "", requestId: "", userId: "" });
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
          <span>{loading ? "A carregar..." : `${data?.pagination.total ?? 0} eventos`}</span>
          {data ? <span>Pagina {data.pagination.page} de {data.pagination.totalPages}</span> : null}
        </div>

        {error ? <div className="p-5 text-sm text-red-700">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plant</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Confirmation</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(log.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{log.userId ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{log.plantCode ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{log.role ?? "-"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{log.eventType ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{log.result ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{log.toolName ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{log.confirmationId ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{log.requestId ?? "-"}</td>
                  <td className="max-w-md px-4 py-3 text-xs text-slate-600">{buildSummary(log)}</td>
                </tr>
              ))}
              {!loading && data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                    Sem eventos para os filtros selecionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button type="button" variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !data || page >= data.pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Seguinte
          </Button>
        </div>
      </div>
    </section>
  );
}
