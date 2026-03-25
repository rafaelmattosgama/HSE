import { PlantAccessTokenType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { buildRateLimitKey } from "@/lib/helpers";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyPlantToken } from "@/lib/auth/plant-token";

function renderKioskHtml(plantCode: string, token: string, plantName: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Safety Kiosk</title>
    <style>
      body { font-family: sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
      .banner { background: linear-gradient(120deg, #f97316, #f59e0b); border-radius: 14px; padding: 18px; color: #1f2937; }
      .panel { margin-top: 14px; border: 1px solid #cbd5e1; border-radius: 12px; background: white; padding: 16px; }
      a { display: inline-block; margin-top: 8px; background: #0f172a; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="banner">
        <h1 style="margin:0">${plantName} - Safety Kiosk</h1>
        <p style="margin:6px 0 0">N6 access without email using fixed plant token.</p>
      </section>

      <section class="panel">
        <p>Use quick report flow:</p>
        <a href="/r/${plantCode}/report?t=${token}">Open report</a>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const token = request.nextUrl.searchParams.get("t");

  if (!token) {
    return fail("TOKEN_REQUIRED", "Query token is required", 401);
  }

  const plant = await getPlantByCode(plantCode);

  const limit = await consumeRateLimit(buildRateLimitKey(request, ["kiosk", plant.code]));
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many attempts", 429);
  }

  const tokenRecord = await verifyPlantToken({
    plantId: plant.id,
    type: PlantAccessTokenType.KIOSK,
    token,
  });

  if (!tokenRecord) {
    logger.warn({ plantCode, route: "kiosk", reason: "invalid_token" }, "public kiosk access denied");
    return fail("INVALID_TOKEN", "Token invalid or revoked", 401);
  }

  logger.info({ plantCode, route: "kiosk", access: "granted" }, "public kiosk access");

  return new NextResponse(renderKioskHtml(plantCode, token, plant.name), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}