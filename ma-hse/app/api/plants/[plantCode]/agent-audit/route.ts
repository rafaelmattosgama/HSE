import { fail, ok } from "@/lib/api";
import { listAgentAuditLogs } from "@/lib/agent/audit-log-view";

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  try {
    const result = await listAgentAuditLogs({
      plantCode,
      searchParams: new URL(request.url).searchParams,
    });
    if ("error" in result) return result.error;
    return ok(result.data);
  } catch {
    return fail("AGENT_AUDIT_UNAVAILABLE", "Nao foi possivel carregar os logs do agente.", 500);
  }
}
