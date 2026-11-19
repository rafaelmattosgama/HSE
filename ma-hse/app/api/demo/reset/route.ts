import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/options";
import { getDemoScriptForEmail, isDemoMode } from "@/lib/demo-mode";
import { resetDemoData } from "@/lib/demo-reset";
import { logger } from "@/lib/logger";

// Local demo only: wipes the ehs_demo database and reloads the demo data.
export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ ok: false, errorCode: "NOT_FOUND", message: "Not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, errorCode: "UNAUTHORIZED", message: "Login required" }, { status: 401 });
  }
  if (!getDemoScriptForEmail(session.user.email)) {
    return NextResponse.json(
      { ok: false, errorCode: "FORBIDDEN", message: "Only demo accounts can reset the demo" },
      { status: 403 },
    );
  }

  try {
    return NextResponse.json({ ok: true, data: await resetDemoData() });
  } catch (error) {
    logger.error({ error }, "demo_reset_failed");
    return NextResponse.json(
      {
        ok: false,
        errorCode: "DEMO_RESET_FAILED",
        message: "Não foi possível reiniciar a demo. Corra npm run demo:reset no terminal.",
      },
      { status: 500 },
    );
  }
}
