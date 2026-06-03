import { NextRequest, NextResponse } from "next/server";
import type { CommunicationSource, CommunicationType } from "@prisma/client";
import type { CreateCommunicationInput } from "@/lib/validation/dtos";

const PUBLIC_REPORT_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const PUBLIC_REPORT_PHOTO_LIMITS = {
  maxFiles: 5,
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxTotalSizeBytes: 20 * 1024 * 1024,
} as const;

type PublicReportParseResult =
  | { data: CreateCommunicationInput; files: File[] }
  | { error: Response };

function isMissingDatabaseObjectError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "P2021" || error.code === "P2022");
}

function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

function fail(errorCode: string, message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      errorCode,
      message,
    },
    { status },
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const employeeNoCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareEmployees(
  left: { name: string; employeeNo?: string | null },
  right: { name: string; employeeNo?: string | null },
) {
  const leftNo = left.employeeNo?.trim();
  const rightNo = right.employeeNo?.trim();

  if (leftNo && rightNo) {
    return employeeNoCollator.compare(leftNo, rightNo) || left.name.localeCompare(right.name);
  }

  if (leftNo) return -1;
  if (rightNo) return 1;
  return left.name.localeCompare(right.name);
}

function compareByName(language: string) {
  return (left: { name: string }, right: { name: string }) =>
    left.name.localeCompare(right.name, language, { sensitivity: "base" });
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalId(value: string | null | undefined) {
  return value || null;
}

function isFormFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "size" in value && "name" in value;
}

async function parsePublicReportRequest(request: NextRequest): Promise<PublicReportParseResult> {
  const [{ parseBody }, { createPublicReportCommunicationInput }] = await Promise.all([
    import("@/lib/http"),
    import("@/lib/validation/dtos"),
  ]);
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const parsed = await parseBody(request, createPublicReportCommunicationInput);
    if ("error" in parsed && parsed.error) {
      return { error: parsed.error };
    }
    return { data: parsed.data, files: [] };
  }

  try {
    const formData = await request.formData();
    const payloadRaw = formData.get("payload");
    if (typeof payloadRaw !== "string") {
      return {
        error: fail("INVALID_INPUT", "Invalid report payload", 422),
      };
    }

    const payload = JSON.parse(payloadRaw);
    const parsed = createPublicReportCommunicationInput.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue?.path?.join(".");
      const detail = firstIssue?.message ?? "Invalid payload";
      return {
        error: fail("INVALID_INPUT", field ? `${field}: ${detail}` : detail, 422),
      };
    }

    return {
      data: parsed.data,
      files: formData.getAll("photos").filter((value): value is File => isFormFile(value) && value.size > 0),
    };
  } catch {
    return {
      error: fail("INVALID_INPUT", "Invalid report payload", 422),
    };
  }
}

async function findRecentDuplicatePublicReport(
  plantId: string,
  payload: CreateCommunicationInput,
  sourceType: CommunicationSource,
  firstAidType: CommunicationType,
) {
  const { prisma } = await import("@/lib/prisma");

  return prisma.communication.findFirst({
    where: {
      plantId,
      source: sourceType,
      type: payload.type,
      eventDatetime: payload.eventDatetime,
      reporterEmployeeNo: optionalText(payload.reporterEmployeeNo),
      shiftId: optionalId(payload.shiftId),
      areaId: optionalId(payload.areaId),
      workstationId: optionalId(payload.workstationId),
      targetEmployeeId: optionalId(payload.targetEmployeeId),
      bodyPartId: payload.type === firstAidType ? optionalId(payload.bodyPartId) : null,
      injuryTypeId: payload.type === firstAidType ? optionalId(payload.injuryTypeId) : null,
      description: payload.description,
      suggestedAction: optionalText(payload.suggestedAction),
      createdAt: {
        gte: new Date(Date.now() - PUBLIC_REPORT_DUPLICATE_WINDOW_MS),
      },
    },
    include: {
      attachments: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

function optionMarkup(rows: Array<{ id: string; name: string; employeeNo?: string | null }>) {
  return rows
    .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(`${row.employeeNo ? `${row.employeeNo} - ` : ""}${row.name}`)}</option>`)
    .join("");
}

function renderHtml(
  plantCode: string,
  token: string,
  options: {
    areas: Array<{ id: string; name: string }>;
    workstations: Array<{ id: string; name: string }>;
    shifts: Array<{ id: string; name: string }>;
    employees: Array<{ id: string; name: string; employeeNo?: string | null }>;
    bodyParts: Array<{ id: string; name: string }>;
    injuryTypes: Array<{ id: string; name: string }>;
  },
  reportCopy: { locale: string; text: Record<string, string> },
) {
  const { locale, text } = reportCopy;
  const photoText =
    locale === "pt"
      ? {
          attach: "Anexar fotografias",
          help: "Pode anexar fotografias para documentar a situacao.",
          remove: "Remover",
          invalidType: "Apenas imagens JPG, PNG ou WEBP sao aceites.",
          tooLarge: "Cada fotografia pode ter no maximo 5 MB.",
          tooMany: "Pode anexar no maximo 5 fotografias.",
          totalTooLarge: "O total das fotografias nao pode exceder 20 MB.",
        }
      : {
          attach: "Attach photos",
          help: "You can attach photos to document the situation.",
          remove: "Remove",
          invalidType: "Only JPG, PNG or WEBP images are accepted.",
          tooLarge: "Each photo can be at most 5 MB.",
          tooMany: "You can attach at most 5 photos.",
          totalTooLarge: "Photos cannot exceed 20 MB in total.",
        };
  const employeesJson = safeJson(
    options.employees.map((employee) => ({
      id: employee.id,
      label: `${employee.employeeNo ? `${employee.employeeNo} - ` : ""}${employee.name}`,
      employeeNo: employee.employeeNo ?? "",
      name: employee.name,
    })),
  );
  const injuryTypesJson = safeJson(
    options.injuryTypes.map((injuryType) => ({
      id: injuryType.id,
      label: injuryType.name,
      name: injuryType.name,
    })),
  );
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
      button:disabled { opacity: 0.65; cursor: not-allowed; }
      .photo-help { margin: 4px 0 8px; color: #475569; font-size: 13px; }
      .photo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 10px; margin-top: 10px; }
      .photo-card { border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: #f8fafc; }
      .photo-card img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; }
      .photo-card button { width: 100%; margin: 0; border-radius: 0; background: #991b1b; padding: 8px; font-size: 12px; }
      .combo { position: relative; }
      .combo-list { position: absolute; z-index: 20; left: 0; right: 0; max-height: 240px; overflow-y: auto; margin-top: 4px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16); }
      .combo-option { width: 100%; margin: 0; border: 0; border-radius: 0; background: white; color: #0f172a; padding: 9px 10px; text-align: left; font-weight: 500; }
      .combo-option:hover, .combo-option:focus { background: #ecfdf5; outline: none; }
      .combo-empty { padding: 10px; color: #64748b; font-size: 13px; }
      .ok { color: #065f46; font-size: 13px; font-weight: 700; }
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
          <input id="eventDatetime" name="eventDatetime" type="datetime-local" required />

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

          <div id="shift-wrap"${options.shifts.length ? "" : ' style="display:none"'}>
            <label>${escapeHtml(text.shift)}</label>
            <select name="shiftId"${options.shifts.length ? " required" : ""}>
              <option value="">${escapeHtml(text.selectShift)}</option>
              ${optionMarkup(options.shifts)}
            </select>
          </div>

          <div id="worker-wrap">
            <label>${escapeHtml(text.involvedWorker)}</label>
            <div class="combo" data-combo="targetEmployee">
              <input id="targetEmployeeSearch" type="text" autocomplete="off" placeholder="${escapeHtml(text.selectInvolvedWorker)}" />
              <input name="targetEmployeeId" type="hidden" />
              <div id="targetEmployeeList" class="combo-list" hidden></div>
            </div>
          </div>

          <div id="clinical-wrap" style="display:none">
            <label>${escapeHtml(text.natureOfInjury)}</label>
            <div class="combo" data-combo="injuryType">
              <input id="injuryTypeSearch" type="text" autocomplete="off" placeholder="${escapeHtml(text.selectNature)}" />
              <input name="injuryTypeId" type="hidden" />
              <div id="injuryTypeList" class="combo-list" hidden></div>
            </div>

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

          <label for="photos">${escapeHtml(photoText.attach)}</label>
          <p class="photo-help">${escapeHtml(photoText.help)}</p>
          <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple />
          <div id="photo-preview" class="photo-grid"></div>

          <button type="submit">${escapeHtml(text.submit)}</button>
          <p id="msg"></p>
        </form>
      </div>
    </main>

    <script>
      const form = document.getElementById('report-form');
      const msg = document.getElementById('msg');
      const typeSelect = document.getElementById('type');
      const workerWrap = document.getElementById('worker-wrap');
      const clinicalWrap = document.getElementById('clinical-wrap');
      const eventDatetimeInput = document.getElementById('eventDatetime');
      const photosInput = document.getElementById('photos');
      const photoPreview = document.getElementById('photo-preview');
      const submitButton = form.querySelector('button[type="submit"]');
      const originalSubmitText = submitButton.textContent;
      const formControls = Array.from(form.elements).filter((element) => element !== submitButton);
      let submissionCompleted = false;
      let selectedPhotos = [];
      const bodyPartSelect = form.elements.bodyPartId;
      const reportData = {
        employees: ${employeesJson},
        injuryTypes: ${injuryTypesJson},
      };
      const messages = {
        success: ${safeJson(text.submitSuccess)},
        failed: ${safeJson(text.submitFailed)},
        futureDatetime: ${safeJson(text.futureDatetime)},
        selectInvolvedWorker: ${safeJson(text.selectInvolvedWorker)},
        selectNature: ${safeJson(text.selectNature)},
        selectBodyPart: ${safeJson(text.selectBodyPart)},
        photoInvalidType: ${safeJson(photoText.invalidType)},
        photoTooLarge: ${safeJson(photoText.tooLarge)},
        photoTooMany: ${safeJson(photoText.tooMany)},
        photoTotalTooLarge: ${safeJson(photoText.totalTooLarge)},
        photoRemove: ${safeJson(photoText.remove)},
      };
      const photoLimits = {
        maxFiles: ${PUBLIC_REPORT_PHOTO_LIMITS.maxFiles},
        maxFileSizeBytes: ${PUBLIC_REPORT_PHOTO_LIMITS.maxFileSizeBytes},
        maxTotalSizeBytes: ${PUBLIC_REPORT_PHOTO_LIMITS.maxTotalSizeBytes},
      };
      const allowedPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

      function setFormLocked(locked) {
        for (const control of formControls) {
          control.disabled = locked;
        }
        submitButton.disabled = locked;
      }

      function markSubmissionSuccess() {
        msg.className = 'ok';
        msg.textContent = messages.success;
        form.reset();
        selectedPhotos = [];
        renderPhotoPreview();
        workerCombo.clear();
        injuryTypeCombo.clear();
        syncWorkerVisibility();
        syncEventDatetimeMax();
      }

      function normalize(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase();
      }

      function setupSearchableSelect(config) {
        const input = document.getElementById(config.inputId);
        const list = document.getElementById(config.listId);
        const hidden = form.elements[config.hiddenName];
        const rows = config.rows.map((row) => ({
          ...row,
          searchText: normalize([row.label, row.employeeNo, row.name].filter(Boolean).join(' ')),
        }));

        function close() {
          list.hidden = true;
          list.replaceChildren();
        }

        function choose(row) {
          input.value = row.label;
          hidden.value = row.id;
          input.setCustomValidity('');
          close();
        }

        function render() {
          const query = normalize(input.value);
          const matches = query ? rows.filter((row) => row.searchText.includes(query)) : rows;
          list.replaceChildren();

          if (!matches.length) {
            const empty = document.createElement('div');
            empty.className = 'combo-empty';
            empty.textContent = config.emptyText;
            list.appendChild(empty);
            list.hidden = false;
            return;
          }

          for (const row of matches) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'combo-option';
            button.textContent = row.label;
            button.addEventListener('mousedown', (event) => event.preventDefault());
            button.addEventListener('click', () => choose(row));
            list.appendChild(button);
          }

          list.hidden = false;
        }

        function validate(required) {
          const query = normalize(input.value);
          const exact = rows.find((row) => normalize(row.label) === query);
          if (exact && !hidden.value) {
            hidden.value = exact.id;
          }

          if (required && !hidden.value) {
            input.setCustomValidity(config.requiredText);
            return false;
          }

          if (!required && input.value.trim() && !hidden.value) {
            input.setCustomValidity(config.requiredText);
            return false;
          }

          input.setCustomValidity('');
          return true;
        }

        function clear() {
          input.value = '';
          hidden.value = '';
          input.setCustomValidity('');
          close();
        }

        input.addEventListener('input', () => {
          hidden.value = '';
          input.setCustomValidity('');
          render();
        });
        input.addEventListener('focus', render);
        input.addEventListener('blur', () => {
          window.setTimeout(close, 120);
        });

        return { clear, validate };
      }

      const workerCombo = setupSearchableSelect({
        inputId: 'targetEmployeeSearch',
        listId: 'targetEmployeeList',
        hiddenName: 'targetEmployeeId',
        rows: reportData.employees,
        emptyText: messages.selectInvolvedWorker,
        requiredText: messages.selectInvolvedWorker,
      });

      const injuryTypeCombo = setupSearchableSelect({
        inputId: 'injuryTypeSearch',
        listId: 'injuryTypeList',
        hiddenName: 'injuryTypeId',
        rows: reportData.injuryTypes,
        emptyText: messages.selectNature,
        requiredText: messages.selectNature,
      });

      function toLocalDateTimeInputValue(date) {
        const pad = (value) => String(value).padStart(2, '0');
        return date.getFullYear() + '-' +
          pad(date.getMonth() + 1) + '-' +
          pad(date.getDate()) + 'T' +
          pad(date.getHours()) + ':' +
          pad(date.getMinutes());
      }

      function syncEventDatetimeMax() {
        eventDatetimeInput.max = toLocalDateTimeInputValue(new Date());
      }

      function getEventDatetime() {
        if (!eventDatetimeInput.value) return null;
        const date = new Date(eventDatetimeInput.value);
        return Number.isNaN(date.getTime()) ? null : date;
      }

      function validateEventDatetime() {
        const eventDatetime = getEventDatetime();
        eventDatetimeInput.setCustomValidity('');

        if (eventDatetime && eventDatetime.getTime() > Date.now()) {
          eventDatetimeInput.setCustomValidity(messages.futureDatetime);
          return false;
        }

        return true;
      }

      function setPhotoError(message) {
        msg.className = 'err';
        msg.textContent = message;
      }

      function renderPhotoPreview() {
        photoPreview.replaceChildren();

        for (const [index, photo] of selectedPhotos.entries()) {
          const card = document.createElement('div');
          card.className = 'photo-card';

          const img = document.createElement('img');
          img.src = URL.createObjectURL(photo);
          img.alt = photo.name;
          img.onload = () => URL.revokeObjectURL(img.src);
          card.appendChild(img);

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = messages.photoRemove;
          remove.addEventListener('click', () => {
            selectedPhotos.splice(index, 1);
            renderPhotoPreview();
          });
          card.appendChild(remove);

          photoPreview.appendChild(card);
        }
      }

      function addSelectedPhotos(files) {
        msg.textContent = '';
        msg.className = '';

        const nextPhotos = [...selectedPhotos, ...files];
        if (nextPhotos.length > photoLimits.maxFiles) {
          setPhotoError(messages.photoTooMany);
          photosInput.value = '';
          return;
        }

        const totalSize = nextPhotos.reduce((sum, photo) => sum + photo.size, 0);
        if (totalSize > photoLimits.maxTotalSizeBytes) {
          setPhotoError(messages.photoTotalTooLarge);
          photosInput.value = '';
          return;
        }

        for (const photo of files) {
          if (!allowedPhotoTypes.has(photo.type)) {
            setPhotoError(messages.photoInvalidType);
            photosInput.value = '';
            return;
          }

          if (photo.size > photoLimits.maxFileSizeBytes) {
            setPhotoError(messages.photoTooLarge);
            photosInput.value = '';
            return;
          }
        }

        selectedPhotos = nextPhotos;
        photosInput.value = '';
        renderPhotoPreview();
      }

      function syncWorkerVisibility() {
        const clinicalVisible = typeSelect.value === 'FIRST_AID';
        workerWrap.style.display = 'block';
        clinicalWrap.style.display = clinicalVisible ? 'block' : 'none';
        bodyPartSelect.required = clinicalVisible;
        if (!clinicalVisible) {
          bodyPartSelect.value = '';
          injuryTypeCombo.clear();
        }
      }

      syncEventDatetimeMax();
      syncWorkerVisibility();
      typeSelect.addEventListener('change', syncWorkerVisibility);
      eventDatetimeInput.addEventListener('focus', syncEventDatetimeMax);
      eventDatetimeInput.addEventListener('input', validateEventDatetime);
      photosInput.addEventListener('change', () => addSelectedPhotos(Array.from(photosInput.files || [])));

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submissionCompleted) return;

        msg.textContent = '';
        msg.className = '';
        syncEventDatetimeMax();
        validateEventDatetime();
        const workerRequired = typeSelect.value === 'UNSAFE_ACT' || typeSelect.value === 'NEAR_MISS' || typeSelect.value === 'FIRST_AID';
        workerCombo.validate(workerRequired);
        injuryTypeCombo.validate(false);

        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const eventDatetime = getEventDatetime();
        if (!eventDatetime) return;

        const payload = {
          type: formData.get('type'),
          eventDatetime: eventDatetime.toISOString(),
          reporterName: formData.get('reporterName'),
          reporterEmployeeNo: formData.get('reporterEmployeeNo'),
          shiftId: formData.get('shiftId') || undefined,
          areaId: formData.get('areaId'),
          workstationId: formData.get('workstationId'),
          riskThemeId: undefined,
          unsafeActTypeId: undefined,
          nearMissTypeId: undefined,
          targetEmployeeId: formData.get('targetEmployeeId') || undefined,
          injuryTypeId: formData.get('type') === 'FIRST_AID' ? formData.get('injuryTypeId') || undefined : undefined,
          bodyPartId: formData.get('type') === 'FIRST_AID' ? formData.get('bodyPartId') || undefined : undefined,
          description: formData.get('description'),
          suggestedAction: formData.get('suggestedAction') || undefined,
        };

        submitButton.disabled = true;
        submitButton.textContent = originalSubmitText;

        try {
          const requestBody = new FormData();
          requestBody.set('payload', JSON.stringify(payload));
          for (const photo of selectedPhotos) {
            requestBody.append('photos', photo, photo.name);
          }

          const response = await fetch('/r/${plantCode}/report?t=${token}', {
            method: 'POST',
            body: requestBody,
          });

          const json = await response.json().catch(() => null);
          if (response.ok && json?.ok) {
            markSubmissionSuccess();
            return;
          }

          msg.className = 'err';
          msg.textContent = json?.message || messages.failed;
        } catch (error) {
          msg.className = 'err';
          msg.textContent = error instanceof Error && error.message ? error.message : messages.failed;
        } finally {
          if (!submissionCompleted) {
            submitButton.disabled = false;
            submitButton.textContent = originalSubmitText;
          }
        }
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

  const [
    { PlantAccessTokenType },
    { buildRateLimitKey },
    { logger },
    { findPlantByCode },
    { prisma },
    { consumeRateLimit },
    { verifyPlantToken },
    {
      dedupeCatalogRows,
      getLocalizedBodyPartName,
      getLocalizedInjuryTypeName,
      getLocalizedShiftName,
      getPublicReportText,
    },
    { ensureDefaultShifts },
  ] = await Promise.all([
    import("@prisma/client"),
    import("@/lib/helpers"),
    import("@/lib/logger"),
    import("@/lib/plant"),
    import("@/lib/prisma"),
    import("@/lib/rate-limit"),
    import("@/lib/auth/plant-token"),
    import("@/lib/public-report"),
    import("@/lib/services/shift-service"),
  ]);

  const plant = await findPlantByCode(plantCode);
  if (!plant) {
    logger.warn({ plantCode, route: "report", reason: "plant_not_found" }, "public report access denied");
    return fail("PLANT_NOT_FOUND", "Plant not found", 404);
  }

  const limit = await consumeRateLimit(buildRateLimitKey(request, ["report", plant.code]));
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many attempts", 429);
  }

  const tokenRecord = await (async () => {
    try {
      return await verifyPlantToken({
        plantId: plant.id,
        type: PlantAccessTokenType.REPORT,
        token,
      });
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        logger.error({ plantCode, route: "report", reason: "database_migration_required" }, "public report token storage unavailable");
        return "migration-required" as const;
      }
      throw error;
    }
  })();
  if (tokenRecord === "migration-required") {
    return fail("DATABASE_MIGRATION_REQUIRED", "QR token storage is not available.", 503);
  }

  if (!tokenRecord) {
    logger.warn({ plantCode, route: "report", reason: "invalid_token" }, "public report access denied");
    return fail("INVALID_TOKEN", "Token invalid or revoked", 401);
  }

  await ensureDefaultShifts(plant.id);

  const [areas, workstations, shifts, employeesRaw, bodyPartsRaw, injuryTypesRaw] = await prisma.$transaction([
    prisma.area.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.workstation.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.shift.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.employeeDirectory.findMany({ where: { plantId: plant.id, isActive: true }, select: { id: true, name: true, employeeNo: true } }),
    prisma.bodyPart.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.injuryType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
  ]);

  const shiftsLocalized = shifts.map((shift) => ({ id: shift.id, name: getLocalizedShiftName(shift, plant.defaultLanguage) }));
  const employees = [...employeesRaw].sort(compareEmployees);
  const bodyParts = dedupeCatalogRows(bodyPartsRaw, (row) => getLocalizedBodyPartName(row, plant.defaultLanguage)).map((row) => ({
    id: row.id,
    name: getLocalizedBodyPartName(row, plant.defaultLanguage),
  }));
  const injuryTypes = dedupeCatalogRows(injuryTypesRaw, (row) => getLocalizedInjuryTypeName(row, plant.defaultLanguage))
    .map((row) => ({
      id: row.id,
      name: getLocalizedInjuryTypeName(row, plant.defaultLanguage),
    }))
    .sort(compareByName(getPublicReportText(plant.defaultLanguage).locale));
  const reportCopy = getPublicReportText(plant.defaultLanguage);

  return new NextResponse(renderHtml(plantCode, token, { areas, workstations, shifts: shiftsLocalized, employees, bodyParts, injuryTypes }, reportCopy), {
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

  const [
    { CommunicationSource, CommunicationType, PlantAccessTokenType },
    { buildRateLimitKey },
    { logger },
    { findPlantByCode },
    { consumeRateLimit },
    { verifyPlantToken },
  ] = await Promise.all([
    import("@prisma/client"),
    import("@/lib/helpers"),
    import("@/lib/logger"),
    import("@/lib/plant"),
    import("@/lib/rate-limit"),
    import("@/lib/auth/plant-token"),
  ]);

  const plant = await findPlantByCode(plantCode);
  if (!plant) {
    logger.warn({ plantCode, route: "report-submit", reason: "plant_not_found" }, "public report submit denied");
    return fail("PLANT_NOT_FOUND", "Plant not found", 404);
  }

  const limit = await consumeRateLimit(buildRateLimitKey(request, ["report-submit", plant.code]));
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many submissions", 429);
  }

  const tokenRecord = await (async () => {
    try {
      return await verifyPlantToken({
        plantId: plant.id,
        type: PlantAccessTokenType.REPORT,
        token,
      });
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        logger.error({ plantCode, route: "report-submit", reason: "database_migration_required" }, "public report token storage unavailable");
        return "migration-required" as const;
      }
      throw error;
    }
  })();
  if (tokenRecord === "migration-required") {
    return fail("DATABASE_MIGRATION_REQUIRED", "QR token storage is not available.", 503);
  }

  if (!tokenRecord) {
    logger.warn({ plantCode, route: "report-submit", reason: "invalid_token" }, "public report submit denied");
    return fail("INVALID_TOKEN", "Token invalid or revoked", 401);
  }

  const parsed = await parsePublicReportRequest(request);
  if ("error" in parsed) return parsed.error;

  const { CommunicationService, CommunicationValidationError } = await import("@/lib/services/communication-service");

  if (!CommunicationService.isN6AllowedType(parsed.data.type)) {
    return fail("TYPE_NOT_ALLOWED", "N6 can only submit Unsafe Act, Unsafe Condition, Near Miss or First Aid", 403);
  }

  const duplicateCommunication = await findRecentDuplicatePublicReport(
    plant.id,
    parsed.data,
    CommunicationSource.TOKEN_REPORT,
    CommunicationType.FIRST_AID,
  );
  if (duplicateCommunication) {
    logger.info(
      {
        plantCode,
        route: "report-submit",
        communicationId: duplicateCommunication.id,
      },
      "public report duplicate submission reused",
    );
    return ok(duplicateCommunication);
  }

  const {
    CommunicationAttachmentValidationError,
    deleteUploadedCommunicationAttachments,
    uploadPublicReportPhotos,
  } = await import("@/lib/services/communication-attachment-service");

  const uploadedAttachments = await (async () => {
    try {
      return await uploadPublicReportPhotos({
        plantCode: plant.code,
        files: parsed.files,
      });
    } catch (error) {
      if (error instanceof CommunicationAttachmentValidationError) {
        logger.warn(
          {
            plantCode,
            route: "report-submit",
            reason: error.code,
            fileCount: parsed.files.length,
          },
          "public report photo rejected",
        );
        return fail(error.code, error.message, error.status);
      }
      throw error;
    }
  })();
  if (uploadedAttachments instanceof Response) return uploadedAttachments;

  const communication = await (async () => {
    try {
      return await CommunicationService.create({
        plantId: plant.id,
        payload: {
          ...parsed.data,
          attachments: uploadedAttachments,
          riskThemeId: undefined,
          unsafeActTypeId: undefined,
          unsafeConditionTypeId: undefined,
          nearMissTypeId: undefined,
        },
        source: CommunicationSource.TOKEN_REPORT,
      });
    } catch (error) {
      if (error instanceof CommunicationValidationError) {
        await deleteUploadedCommunicationAttachments(uploadedAttachments);
        return fail(error.code, error.message, error.status);
      }
      await deleteUploadedCommunicationAttachments(uploadedAttachments);
      throw error;
    }
  })();
  if (communication instanceof Response) return communication;

  logger.info({ plantCode, route: "report-submit", communicationId: communication.id }, "public report created");

  return ok(communication, { status: 201 });
}
