import { POST as saveCatalog, DELETE as deleteCatalog } from "@/app/api/admin/master-data/route";
import { fail } from "@/lib/api";

async function forward(request: Request, handler: typeof saveCatalog) {
  let body: unknown;
  try { body = await request.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 422); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_BODY", "Invalid input", 422);
  return handler(new Request(request.url, { method: request.method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, type: "riskTheme" }) }));
}
export const POST = (request: Request) => forward(request, saveCatalog);
export const DELETE = (request: Request) => forward(request, deleteCatalog);
