import { redirect } from "next/navigation";
import { AgentAuditLogViewer } from "@/components/feature/agent-audit-log-viewer";
import { resolveAgentAuditAccess } from "@/lib/agent/audit-log-view";
import { ALL_PLANTS_SCOPE } from "@/lib/plant-scope";

export default async function AgentAuditPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const access = await resolveAgentAuditAccess(plant);
  if ("error" in access) {
    redirect(plant === ALL_PLANTS_SCOPE ? "/app/corporate" : `/app/${plant}/admin`);
  }

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Agente interno</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Audit logs do agente</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Eventos operacionais do agente com dados resumidos e seguros. Prompts, respostas completas, payloads sensiveis e segredos nao sao apresentados.
        </p>
      </header>

      <AgentAuditLogViewer plantCode={plant} />
    </>
  );
}
