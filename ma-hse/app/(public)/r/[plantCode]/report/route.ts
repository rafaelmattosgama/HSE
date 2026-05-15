import { PlantAccessTokenType, CommunicationSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { buildRateLimitKey } from "@/lib/helpers";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyPlantToken } from "@/lib/auth/plant-token";
import {
  dedupeCatalogRows,
  getLocalizedBodyPartName,
  getLocalizedInjuryTypeName,
  getLocalizedShiftName,
  getPublicReportText,
} from "@/lib/public-report";
import { createPublicReportCommunicationInput } from "@/lib/validation/dtos";
import { CommunicationService, CommunicationValidationError } from "@/lib/services/communication-service";
import { ensureDefaultShifts } from "@/lib/services/shift-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optionMarkup(rows: Array<{ id: string; name: string; employeeNo?: string | null }>) {
  return rows
    .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(`${row.employeeNo ? `${row.employeeNo} - ` : ""}${row.name}`)}</option>`)
    .join("");
}

function groupedOptionMarkup(rows: Array<{ id: string; code: string; category: string; name: string }>) {
  const groups = new Map<string, Array<{ id: string; code: string; name: string }>>();

  for (const row of rows) {
    const entries = groups.get(row.category) ?? [];
    entries.push(row);
    groups.set(row.category, entries);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, entries]) => {
      const options = entries
        .sort((left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code))
        .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(`${row.code} - ${row.name}`)}</option>`)
        .join("");
      return `<optgroup label="${escapeHtml(category)}">${options}</optgroup>`;
    })
    .join("");
}

function renderHtml(
  plantCode: string,
  token: string,
  language: string,
  options: {
    areas: Array<{ id: string; name: string }>;
    workstations: Array<{ id: string; name: string }>;
    shifts: Array<{ id: string; name: string }>;
    employees: Array<{ id: string; name: string; employeeNo?: string | null }>;
    bodyParts: Array<{ id: string; name: string }>;
    injuryTypes: Array<{ id: string; name: string }>;
    unsafeActTypes: Array<{ id: string; code: string; category: string; name: string }>;
  },
) {
  const { locale, text } = getPublicReportText(language);
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(text.title)}</title>
    <style>
      body { font-family: sans-serif; margin: 0; background: #f6faf9; color: #0f172a; }
      .wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
      .panel { background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06); }
      h1 { margin: 0 0 16px 0; }
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
        <h1>${escapeHtml(text.title)}</h1>
        <form id="report-form">
          <label>${escapeHtml(text.type)}</label>
          <select name="type" id="type" required>
            <option value="UNSAFE_ACT">${escapeHtml(text.typeUnsafeAct)}</option>
            <option value="UNSAFE_CONDITION" selected>${escapeHtml(text.typeUnsafeCondition)}</option>
            <option value="NEAR_MISS">${escapeHtml(text.typeNearMiss)}</option>
            <option value="FIRST_AID">${escapeHtml(text.typeFirstAid)}</option>
          </select>

          <label>${escapeHtml(text.dateTime)}</label>
          <input name="eventDatetime" type="datetime-local" required />

          <label>${escapeHtml(text.reporterName)}</label>
          <input name="reporterName" required pattern="[^0-9]+" title="${escapeHtml(text.reporterNameNoNumbers)}" />

          <label>${escapeHtml(text.reporterNumber)}</label>
          <input name="reporterEmployeeNo" required />

          <label>${escapeHtml(text.department)}</label>
          <select name="areaId" required>
            <option value="">${escapeHtml(text.selectDepartment)}</option>
            ${optionMarkup(options.areas)}
          </select>

          <label>${escapeHtml(text.location)}</label>
          <select name="workstationId" required>
            <option value="">${escapeHtml(text.selectLocation)}</option>
            ${optionMarkup(options.workstations)}
          </select>

          <div id="unsafe-act-type-wrap" style="display:none">
            <label>${escapeHtml(text.unsafeActType)}</label>
            <select name="unsafeActTypeId">
              <option value="">${escapeHtml(text.selectUnsafeActType)}</option>
              ${groupedOptionMarkup(options.unsafeActTypes)}
            </select>
          </div>

          <div id="shift-wrap"${options.shifts.length ? "" : ' style="display:none"'}>
            <label>${escapeHtml(text.shift)}</label>
            <select name="shiftId"${options.shifts.length ? " required" : ""}>
              <option value="">${escapeHtml(text.selectShift)}</option>
              ${optionMarkup(options.shifts)}
            </select>
          </div>

          <div id="worker-wrap">
            <label>${escapeHtml(text.involvedWorker)}</label>
            <select name="targetEmployeeId">
              <option value="">${escapeHtml(text.selectInvolvedWorker)}</option>
              ${optionMarkup(options.employees)}
            </select>
          </div>

          <div id="clinical-wrap" style="display:none">
            <label>${escapeHtml(text.natureOfInjury)}</label>
            <select name="injuryTypeId">
              <option value="">${escapeHtml(text.selectNature)}</option>
              ${optionMarkup(options.injuryTypes)}
            </select>

            <label>${escapeHtml(text.bodyPartAffected)}</label>
            <select name="bodyPartId">
              <option value="">${escapeHtml(text.selectBodyPart)}</option>
              ${optionMarkup(options.bodyParts)}
            </select>
          </div>

          <label>${escapeHtml(text.description)}</label>
          <textarea name="description" rows="4" required></textarea>

          <label>${escapeHtml(text.suggestedAction)}</label>
          <textarea name="suggestedAction" rows="3"></textarea>

          <button type="submit">${escapeHtml(text.submit)}</button>
          <p id="msg"></p>
        </form>
      </div>
    </main>

    <script>
      const form = document.getElementById('report-form');
      const msg = document.getElementById('msg');
      const typeSelect = document.getElementById('type');
      const unsafeActTypeWrap = document.getElementById('unsafe-act-type-wrap');
      const unsafeActTypeSelect = form.elements.unsafeActTypeId;
      const workerWrap = document.getElementById('worker-wrap');
      const clinicalWrap = document.getElementById('clinical-wrap');

      function syncWorkerVisibility() {
        const visible = typeSelect.value === 'UNSAFE_ACT' || typeSelect.value === 'NEAR_MISS' || typeSelect.value === 'FIRST_AID';
        const clinicalVisible = typeSelect.value === 'FIRST_AID';
        const unsafeActVisible = typeSelect.value === 'UNSAFE_ACT';
        unsafeActTypeWrap.style.display = unsafeActVisible ? 'block' : 'none';
        unsafeActTypeSelect.required = unsafeActVisible;
        if (!unsafeActVisible) unsafeActTypeSelect.value = '';
        workerWrap.style.display = visible ? 'block' : 'none';
        clinicalWrap.style.display = clinicalVisible ? 'block' : 'none';
      }

      syncWorkerVisibility();
      typeSelect.addEventListener('change', syncWorkerVisibility);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const payload = {
          type: formData.get('type'),
          eventDatetime: formData.get('eventDatetime'),
          reporterName: formData.get('reporterName'),
          reporterEmployeeNo: formData.get('reporterEmployeeNo'),
          shiftId: formData.get('shiftId') || undefined,
          areaId: formData.get('areaId'),
          workstationId: formData.get('workstationId'),
          riskThemeId: undefined,
          unsafeActTypeId: formData.get('type') === 'UNSAFE_ACT' ? formData.get('unsafeActTypeId') || undefined : undefined,
          nearMissTypeId: undefined,
          targetEmployeeId: formData.get('targetEmployeeId') || undefined,
          injuryTypeId: formData.get('injuryTypeId') || undefined,
          bodyPartId: formData.get('bodyPartId') || undefined,
          description: formData.get('description'),
          suggestedAction: formData.get('suggestedAction') || undefined,
        };

        const response = await fetch('/r/${plantCode}/report?t=${token}', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await response.json();
        if (json.ok) {
          msg.className = 'ok';
          msg.textContent = ${JSON.stringify(text.submitSuccess)};
          form.reset();
          syncWorkerVisibility();
          return;
        }

        msg.className = 'err';
        msg.textContent = json.message || ${JSON.stringify(text.submitFailed)};
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

  await ensureDefaultShifts(plant.id);
  await ensureDefaultUnsafeActTypes(plant.id);

  const [areas, workstations, shifts, employees, bodyPartsRaw, injuryTypesRaw, unsafeActTypes] = await prisma.$transaction([
    prisma.area.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.workstation.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.shift.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.employeeDirectory.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, employeeNo: true } }),
    prisma.bodyPart.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.injuryType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
    prisma.unsafeActType.findMany({
      where: { plantId: plant.id, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
      select: { id: true, code: true, category: true, name: true },
    }),
  ]);

  const shiftsLocalized = shifts.map((shift) => ({ id: shift.id, name: getLocalizedShiftName(shift, plant.defaultLanguage) }));
  const bodyParts = dedupeCatalogRows(bodyPartsRaw, (row) => getLocalizedBodyPartName(row, plant.defaultLanguage)).map((row) => ({
    id: row.id,
    name: getLocalizedBodyPartName(row, plant.defaultLanguage),
  }));
  const injuryTypes = dedupeCatalogRows(injuryTypesRaw, (row) => getLocalizedInjuryTypeName(row, plant.defaultLanguage)).map((row) => ({
    id: row.id,
    name: getLocalizedInjuryTypeName(row, plant.defaultLanguage),
  }));

  return new NextResponse(renderHtml(plantCode, token, plant.defaultLanguage, { areas, workstations, shifts: shiftsLocalized, employees, bodyParts, injuryTypes, unsafeActTypes }), {
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

  const parsed = await parseBody(request, createPublicReportCommunicationInput);
  if ("error" in parsed) return parsed.error;

  if (!CommunicationService.isN6AllowedType(parsed.data.type)) {
    return fail("TYPE_NOT_ALLOWED", "N6 can only submit Unsafe Act, Unsafe Condition, Near Miss or First Aid", 403);
  }

  const communication = await (async () => {
    try {
      return await CommunicationService.create({
        plantId: plant.id,
        payload: {
          ...parsed.data,
          riskThemeId: undefined,
          unsafeActTypeId: parsed.data.type === "UNSAFE_ACT" ? parsed.data.unsafeActTypeId : undefined,
          unsafeConditionTypeId: undefined,
          nearMissTypeId: undefined,
        },
        source: CommunicationSource.TOKEN_REPORT,
      });
    } catch (error) {
      if (error instanceof CommunicationValidationError) {
        return fail(error.code, error.message, error.status);
      }
      throw error;
    }
  })();
  if (communication instanceof Response) return communication;

  logger.info({ plantCode, route: "report-submit", communicationId: communication.id }, "public report created");

  return ok(communication, { status: 201 });
}
