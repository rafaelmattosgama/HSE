// Local demo mode (npm run demo). Pure module: no server-only imports, so it is
// safe in client components too. It must never import "@/lib/env" (env imports it).

export type DemoScriptId = "demo-presentation" | "demo-training-n3" | "demo-training-n1" | "demo-training-n0";

export const DEMO_PASSWORD = "Demo2026!";

export const DEMO_PLANTS = [
  { code: "demo-lis", name: "Demo Lisboa", timezone: "Europe/Lisbon", defaultLanguage: "pt" },
  { code: "demo-opo", name: "Demo Porto", timezone: "Europe/Lisbon", defaultLanguage: "pt" },
] as const;

export const DEMO_ACCOUNTS = [
  { email: "demo.apresentacao@maxsafety.demo", name: "Apresentação Demo", role: "N1_CORPORATE", plantCode: null, script: "demo-presentation" },
  { email: "demo.admin@maxsafety.demo", name: "Admin Demo", role: "N0_ADMIN", plantCode: null, script: "demo-training-n0" },
  { email: "demo.corporate@maxsafety.demo", name: "Corporate Demo", role: "N1_CORPORATE", plantCode: null, script: "demo-training-n1" },
  { email: "demo.seguranca@maxsafety.demo", name: "Segurança Demo", role: "N3_SAFETY", plantCode: "demo-lis", script: "demo-training-n3" },
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  role: "N0_ADMIN" | "N1_CORPORATE" | "N3_SAFETY";
  plantCode: string | null;
  script: DemoScriptId;
}>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Refuses to run demo mode anywhere but a local ehs_demo database, so the demo
 * reset (which truncates every table) can never touch real data.
 */
export function assertDemoModeSafe(input: { DEMO_MODE: boolean; APP_ENV: string; DATABASE_URL: string }) {
  if (!input.DEMO_MODE) return;
  if (input.APP_ENV === "production") {
    throw new Error("DEMO_MODE não pode ser usado em produção (APP_ENV=production).");
  }

  let url: URL;
  try {
    url = new URL(input.DATABASE_URL);
  } catch {
    throw new Error("DEMO_MODE: DATABASE_URL inválido.");
  }

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`DEMO_MODE: a base de dados tem de ser local (recebido host "${url.hostname}").`);
  }
  if (url.pathname.replace(/^\//, "") !== "ehs_demo") {
    throw new Error("DEMO_MODE: a base de dados tem de se chamar ehs_demo.");
  }
}

export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

export function getDemoScriptForEmail(email: string | null | undefined): DemoScriptId | null {
  const normalized = email?.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email === normalized)?.script ?? null;
}
