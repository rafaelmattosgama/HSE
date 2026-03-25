import { CommunicationSource, PlantAccessTokenType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { buildRateLimitKey } from "@/lib/helpers";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyPlantToken } from "@/lib/auth/plant-token";
import { createCommunicationInput } from "@/lib/validation/dtos";
import { CommunicationService } from "@/lib/services/communication-service";

function renderHtml(plantCode: string, token: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Safety Report</title>
    <style>
      body { font-family: sans-serif; margin: 0; background: #f6faf9; color: #0f172a; }
      .wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
      .panel { background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06); }
      h1 { margin: 0 0 8px 0; }
      label { font-size: 13px; font-weight: 600; display: block; margin: 12px 0 6px; }
      input, select, textarea { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
      button { margin-top: 14px; background: #0f766e; color: white; border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 700; }
      .ok { color: #065f46; font-size: 13px; }
      .err { color: #991b1b; font-size: 13px; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="panel">
        <h1>Plant Safety Report</h1>
        <p>Submit Unsafe Act / Unsafe Condition / Near Miss via QR token access.</p>
        <form id="report-form">
          <label>Type</label>
          <select name="type" required>
            <option value="UNSAFE_ACT">UNSAFE_ACT</option>
            <option value="UNSAFE_CONDITION" selected>UNSAFE_CONDITION</option>
            <option value="NEAR_MISS">NEAR_MISS</option>
          </select>

          <label>Event Datetime</label>
          <input name="eventDatetime" type="datetime-local" required />

          <label>Reporter Name</label>
          <input name="reporterName" required />

          <label>Reporter Employee No</label>
          <input name="reporterEmployeeNo" />

          <label>Target Worker (Unsafe Act)</label>
          <input name="targetText" />

          <label>Risk Theme ID (UUID)</label>
          <input name="riskThemeId" required />

          <label>Description</label>
          <textarea name="description" rows="4" required></textarea>

          <button type="submit">Submit communication</button>
          <p id="msg"></p>
        </form>
      </div>
    </main>

    <script>
      const form = document.getElementById('report-form');
      const msg = document.getElementById('msg');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const payload = {
          type: formData.get('type'),
          eventDatetime: formData.get('eventDatetime'),
          reporterName: formData.get('reporterName'),
          reporterEmployeeNo: formData.get('reporterEmployeeNo') || undefined,
          targetText: formData.get('targetText') || undefined,
          riskThemeId: formData.get('riskThemeId'),
          description: formData.get('description'),
        };

        const response = await fetch('/r/${plantCode}/report?t=${token}', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await response.json();
        if (json.ok) {
          msg.className = 'ok';
          msg.textContent = 'Communication submitted successfully.';
          form.reset();
          return;
        }

        msg.className = 'err';
        msg.textContent = json.message || 'Submission failed';
      });
    </script>
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
  const limit = await consumeRateLimit(buildRateLimitKey(request, ["report", plant.code]));
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many attempts", 429);
  }

  const tokenRecord = await verifyPlantToken({
    plantId: plant.id,
    type: PlantAccessTokenType.REPORT,
    token,
  });

  if (!tokenRecord) {
    logger.warn({ plantCode, route: "report", reason: "invalid_token" }, "public report access denied");
    return fail("INVALID_TOKEN", "Token invalid or revoked", 401);
  }

  logger.info({ plantCode, route: "report", access: "granted" }, "public report access");

  return new NextResponse(renderHtml(plantCode, token), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const token = request.nextUrl.searchParams.get("t") ?? request.headers.get("x-plant-token");

  if (!token) {
    return fail("TOKEN_REQUIRED", "Access token is required", 401);
  }

  const plant = await getPlantByCode(plantCode);
  const limit = await consumeRateLimit(buildRateLimitKey(request, ["report-submit", plant.code]));
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many submissions", 429);
  }

  const tokenRecord = await verifyPlantToken({
    plantId: plant.id,
    type: PlantAccessTokenType.REPORT,
    token,
  });

  if (!tokenRecord) {
    logger.warn({ plantCode, route: "report-submit", reason: "invalid_token" }, "public report submit denied");
    return fail("INVALID_TOKEN", "Token invalid or revoked", 401);
  }

  const parsed = await parseBody(request, createCommunicationInput);
  if ("error" in parsed) return parsed.error;

  if (!CommunicationService.isN6AllowedType(parsed.data.type)) {
    return fail("TYPE_NOT_ALLOWED", "N6 can only submit Unsafe Act/Condition/Near Miss", 403);
  }

  const communication = await CommunicationService.create({
    plantId: plant.id,
    payload: parsed.data,
    source: CommunicationSource.TOKEN_REPORT,
  });

  logger.info({ plantCode, route: "report-submit", communicationId: communication.id }, "public report created");

  return ok(communication, { status: 201 });
}