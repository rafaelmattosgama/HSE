"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { parseApiResponse, requireApiResponse } from "@/lib/client-api";
import { isPl01Code } from "@/lib/defaults/pl01-master-data";
import { formatMasterDataMessage, type N0MasterDataUi } from "@/lib/master-data-ui";

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  category?: string | null;
};

type Worker = {
  id: string;
  employeeNo: string;
  name: string;
  dept: string | null;
};

type MasterDataType =
  | "area"
  | "workstation"
  | "equipment"
  | "nearMissType"
  | "unsafeActType"
  | "unsafeConditionType"
  | "injuryType";

type CatalogForm = {
  id: string | null;
  code: string;
  name: string;
  category: string;
};

type WorkerForm = {
  id: string | null;
  employeeNo: string;
  name: string;
  dept: string;
};

type CatalogsState = Record<MasterDataType, CatalogItem[]>;
type FormsState = Record<MasterDataType, CatalogForm>;
type CatalogMessagesState = Record<MasterDataType, string>;
type ErrorEnvelope = {
  errorCode?: string;
  message?: string;
} | null;

const EMPTY_FORM: CatalogForm = {
  id: null,
  code: "",
  name: "",
  category: "",
};

const EMPTY_WORKER_FORM: WorkerForm = {
  id: null,
  employeeNo: "",
  name: "",
  dept: "",
};

const EMPTY_CATALOG_MESSAGES: CatalogMessagesState = {
  area: "",
  workstation: "",
  equipment: "",
  nearMissType: "",
  unsafeActType: "",
  unsafeConditionType: "",
  injuryType: "",
};

function supportsCategory(type: MasterDataType) {
  return type === "unsafeActType" || type === "unsafeConditionType";
}

function sortCatalogItems(items: CatalogItem[]) {
  return [...items].sort(
    (left, right) =>
      (left.category ?? "").localeCompare(right.category ?? "")
      || left.code.localeCompare(right.code)
      || left.name.localeCompare(right.name),
  );
}

function sortWorkers(items: Worker[]) {
  return [...items].sort(
    (left, right) => left.employeeNo.localeCompare(right.employeeNo) || left.name.localeCompare(right.name),
  );
}

function buildInitialCatalogs(input: {
  initialAreas: CatalogItem[];
  initialWorkstations: CatalogItem[];
  initialEquipments: CatalogItem[];
  initialNearMissTypes: CatalogItem[];
  initialUnsafeActTypes: CatalogItem[];
  initialUnsafeConditionTypes: CatalogItem[];
  initialInjuryTypes: CatalogItem[];
}): CatalogsState {
  return {
    area: sortCatalogItems(input.initialAreas),
    workstation: sortCatalogItems(input.initialWorkstations),
    equipment: sortCatalogItems(input.initialEquipments),
    nearMissType: sortCatalogItems(input.initialNearMissTypes),
    unsafeActType: sortCatalogItems(input.initialUnsafeActTypes),
    unsafeConditionType: sortCatalogItems(input.initialUnsafeConditionTypes),
    injuryType: sortCatalogItems(input.initialInjuryTypes),
  };
}

function buildInitialForms(): FormsState {
  return {
    area: { ...EMPTY_FORM },
    workstation: { ...EMPTY_FORM },
    equipment: { ...EMPTY_FORM },
    nearMissType: { ...EMPTY_FORM },
    unsafeActType: { ...EMPTY_FORM },
    unsafeConditionType: { ...EMPTY_FORM },
    injuryType: { ...EMPTY_FORM },
  };
}

function getSection(labels: N0MasterDataUi, type: MasterDataType) {
  return labels.sections[type];
}

export function N0MasterDataManager({
  initialAreas,
  initialWorkstations,
  initialEquipments,
  initialWorkers,
  initialNearMissTypes,
  initialUnsafeActTypes,
  initialUnsafeConditionTypes,
  initialInjuryTypes,
  plantCode,
  labels,
}: {
  initialAreas: CatalogItem[];
  initialWorkstations: CatalogItem[];
  initialEquipments: CatalogItem[];
  initialWorkers: Worker[];
  initialNearMissTypes: CatalogItem[];
  initialUnsafeActTypes: CatalogItem[];
  initialUnsafeConditionTypes: CatalogItem[];
  initialInjuryTypes: CatalogItem[];
  plantCode?: string;
  labels: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plant = plantCode ?? pathname.split("/")[2];

  const [catalogs, setCatalogs] = useState<CatalogsState>(() =>
    buildInitialCatalogs({
      initialAreas,
      initialWorkstations,
      initialEquipments,
      initialNearMissTypes,
      initialUnsafeActTypes,
      initialUnsafeConditionTypes,
      initialInjuryTypes,
    }),
  );
  const [forms, setForms] = useState<FormsState>(() => buildInitialForms());
  const [catalogMessages, setCatalogMessages] = useState<CatalogMessagesState>(() => ({ ...EMPTY_CATALOG_MESSAGES }));
  const [workers, setWorkers] = useState(() => sortWorkers(initialWorkers));
  const [workerForm, setWorkerForm] = useState<WorkerForm>({ ...EMPTY_WORKER_FORM });
  const [workerMessage, setWorkerMessage] = useState("");
  const [globalMessage, setGlobalMessage] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [injuryTypesLoading, setInjuryTypesLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    setCatalogs(
      buildInitialCatalogs({
        initialAreas,
        initialWorkstations,
        initialEquipments,
        initialNearMissTypes,
        initialUnsafeActTypes,
        initialUnsafeConditionTypes,
        initialInjuryTypes,
      }),
    );
    setForms(buildInitialForms());
    setCatalogMessages({ ...EMPTY_CATALOG_MESSAGES });
    setWorkers(sortWorkers(initialWorkers));
    setWorkerForm({ ...EMPTY_WORKER_FORM });
    setWorkerMessage("");
    setGlobalMessage("");
    setSavingKey(null);
    setDeletingKey(null);
  }, [
    initialAreas,
    initialWorkstations,
    initialEquipments,
    initialWorkers,
    initialNearMissTypes,
    initialUnsafeActTypes,
    initialUnsafeConditionTypes,
    initialInjuryTypes,
    plant,
  ]);

  function setCatalog(type: MasterDataType, nextItems: CatalogItem[]) {
    setCatalogs((current) => ({
      ...current,
      [type]: sortCatalogItems(nextItems),
    }));
  }

  function updateForm(type: MasterDataType, patch: Partial<CatalogForm>) {
    setForms((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...patch,
      },
    }));
    setCatalogMessages((current) => (current[type] ? { ...current, [type]: "" } : current));
  }

  function clearForm(type: MasterDataType) {
    updateForm(type, { ...EMPTY_FORM });
  }

  function setCatalogMessage(type: MasterDataType, value: string) {
    setCatalogMessages((current) => ({
      ...current,
      [type]: value,
    }));
  }

  function updateWorkerForm(patch: Partial<WorkerForm>) {
    setWorkerForm((current) => ({
      ...current,
      ...patch,
    }));
    setWorkerMessage("");
  }

  function startEdit(type: MasterDataType, item: CatalogItem) {
    const section = getSection(labels, type);
    updateForm(type, {
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category ?? "",
    });
    setCatalogMessage(
      type,
      formatMasterDataMessage(labels.itemEditMessage, { section: section.title.toLowerCase(), code: item.code }),
    );
  }

  function startWorkerEdit(worker: Worker) {
    setWorkerForm({
      id: worker.id,
      employeeNo: worker.employeeNo,
      name: worker.name,
      dept: worker.dept ?? "",
    });
    setWorkerMessage(formatMasterDataMessage(labels.workerEditMessage, { code: worker.employeeNo }));
  }

  function hasDuplicateCatalogCode(type: MasterDataType, code: string, currentId?: string | null) {
    const normalizedCode = code.trim().toLowerCase();

    return catalogs[type].some(
      (entry) => entry.id !== currentId && entry.code.trim().toLowerCase() === normalizedCode,
    );
  }

  function hasDuplicateWorkerEmployeeNo(employeeNo: string, currentId?: string | null) {
    const normalizedEmployeeNo = employeeNo.trim().toLowerCase();

    return workers.some(
      (entry) => entry.id !== currentId && entry.employeeNo.trim().toLowerCase() === normalizedEmployeeNo,
    );
  }

  function getCatalogErrorMessage(type: MasterDataType, response: Response, json: ErrorEnvelope) {
    if (json?.errorCode === "DUPLICATE_CODE") {
      return getSection(labels, type).duplicateMessage;
    }
    if (response.status === 403) {
      return labels.permissionDenied;
    }

    return json?.message ?? formatMasterDataMessage(labels.failedToSaveItem, { section: getSection(labels, type).title.toLowerCase() });
  }

  function getWorkerErrorMessage(response: Response, json: ErrorEnvelope) {
    if (json?.errorCode === "DUPLICATE_EMPLOYEE_NO") {
      return labels.duplicateWorker;
    }
    if (response.status === 403) {
      return labels.permissionDenied;
    }

    return json?.message ?? labels.failedToSaveWorker;
  }

  async function submitCatalog(type: MasterDataType, event: React.FormEvent) {
    event.preventDefault();
    const form = forms[type];
    const code = form.code.trim();
    const name = form.name.trim();
    const category = form.category.trim();

    if (hasDuplicateCatalogCode(type, code, form.id)) {
      setCatalogMessage(type, getSection(labels, type).duplicateMessage);
      return;
    }
    setSavingKey(`catalog:${type}`);
    setCatalogMessage(type, "");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id ?? undefined,
          type,
          code,
          name,
          category: supportsCategory(type) ? category : undefined,
        }),
      });
      const json = await parseApiResponse<{ item: CatalogItem }>(response);

      if (!response.ok || !json?.ok) {
        throw new Error(getCatalogErrorMessage(type, response, json));
      }

      const saved = json.data?.item;
      if (!saved) {
        throw new Error(formatMasterDataMessage(labels.failedToSaveItem, { section: getSection(labels, type).title.toLowerCase() }));
      }
      setCatalog(type, [...catalogs[type].filter((entry) => entry.id !== saved.id), saved]);
      clearForm(type);
      setCatalogMessage(
        type,
        formatMasterDataMessage(form.id ? labels.itemUpdated : labels.itemCreated, {
          section: getSection(labels, type).title,
        }),
      );
    } catch (error) {
      setCatalogMessage(
        type,
        error instanceof Error
          ? error.message
          : formatMasterDataMessage(labels.failedToSaveItem, { section: getSection(labels, type).title.toLowerCase() }),
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function deactivateCatalog(type: MasterDataType, item: CatalogItem) {
    if (!window.confirm(getSection(labels, type).deleteConfirm)) {
      return;
    }

    setDeletingKey(`catalog:${type}:${item.id}`);
    setCatalogMessage(type, "");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id: item.id }),
      });
      const json = await parseApiResponse(response);

      if (!response.ok || !json?.ok) {
        throw new Error(getCatalogErrorMessage(type, response, json));
      }

      setCatalog(type, catalogs[type].filter((entry) => entry.id !== item.id));
      if (forms[type].id === item.id) {
        clearForm(type);
      }
      setCatalogMessage(type, getSection(labels, type).deleteSuccess);
    } catch (error) {
      setCatalogMessage(
        type,
        error instanceof Error
          ? error.message
          : formatMasterDataMessage(labels.failedToUpdateItem, { section: getSection(labels, type).title.toLowerCase() }),
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function deactivateAllCatalog(type: MasterDataType) {
    if (!window.confirm(getSection(labels, type).deleteAllConfirm)) {
      return;
    }

    setDeletingKey(`catalog:${type}:all`);
    setCatalogMessage(type, "");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, deleteAll: true }),
      });
      const json = await parseApiResponse(response);

      if (!response.ok || !json?.ok) {
        throw new Error(getCatalogErrorMessage(type, response, json));
      }

      setCatalog(type, []);
      clearForm(type);
      setCatalogMessage(type, getSection(labels, type).deleteAllSuccess);
    } catch (error) {
      setCatalogMessage(
        type,
        error instanceof Error
          ? error.message
          : formatMasterDataMessage(labels.failedToUpdateItem, { section: getSection(labels, type).title.toLowerCase() }),
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function submitWorker(event: React.FormEvent) {
    event.preventDefault();
    const employeeNo = workerForm.employeeNo.trim();
    const name = workerForm.name.trim();
    const dept = workerForm.dept.trim();

    if (hasDuplicateWorkerEmployeeNo(employeeNo, workerForm.id)) {
      setWorkerMessage(labels.duplicateWorker);
      return;
    }
    setSavingKey("worker");
    setWorkerMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/workers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: workerForm.id ?? undefined,
          employeeNo,
          name,
          dept: dept || undefined,
        }),
      });
      const json = await parseApiResponse<{ worker: Worker }>(response);

      if (!response.ok || !json?.ok) {
        throw new Error(getWorkerErrorMessage(response, json));
      }

      const saved = json.data?.worker;
      if (!saved) {
        throw new Error(labels.failedToSaveWorker);
      }
      setWorkers((current) => sortWorkers([...current.filter((entry) => entry.id !== saved.id), saved]));
      setWorkerForm({ ...EMPTY_WORKER_FORM });
      setWorkerMessage(workerForm.id ? labels.workerUpdated : labels.workerCreated);
    } catch (error) {
      setWorkerMessage(error instanceof Error ? error.message : labels.failedToSaveWorker);
    } finally {
      setSavingKey(null);
    }
  }

  async function deactivateWorker(worker: Worker) {
    if (!window.confirm(labels.workerDeleteConfirm)) {
      return;
    }

    setDeletingKey(`worker:${worker.id}`);
    setWorkerMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/workers`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: worker.id }),
      });
      const json = await parseApiResponse(response);

      if (!response.ok || !json?.ok) {
        throw new Error(response.status === 403 ? labels.permissionDenied : json?.message ?? labels.failedToUpdateWorker);
      }

      setWorkers((current) => current.filter((entry) => entry.id !== worker.id));
      if (workerForm.id === worker.id) {
        setWorkerForm({ ...EMPTY_WORKER_FORM });
      }
      setWorkerMessage(labels.workerDeleteSuccess);
    } catch (error) {
      setWorkerMessage(error instanceof Error ? error.message : labels.failedToUpdateWorker);
    } finally {
      setDeletingKey(null);
    }
  }

  async function deactivateAllWorkers() {
    if (!window.confirm(labels.workerDeleteAllConfirm)) {
      return;
    }

    setDeletingKey("worker:all");
    setWorkerMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/workers`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      const json = await parseApiResponse(response);

      if (!response.ok || !json?.ok) {
        throw new Error(response.status === 403 ? labels.permissionDenied : json?.message ?? labels.failedToUpdateWorker);
      }

      setWorkers([]);
      setWorkerForm({ ...EMPTY_WORKER_FORM });
      setWorkerMessage(labels.workerDeleteAllSuccess);
    } catch (error) {
      setWorkerMessage(error instanceof Error ? error.message : labels.failedToUpdateWorker);
    } finally {
      setDeletingKey(null);
    }
  }

  async function importExcel(file: File) {
    setImportLoading(true);
    setGlobalMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/plants/${plant}/admin/master-data/import`, {
        method: "POST",
        body: formData,
      });
      const json = await requireApiResponse<{ summary: { departments: number; workstations: number; equipments: number; workers: number } }>(
        response,
        labels.importError,
      );
      const data = json.data;

      if (!data) {
        throw new Error(labels.importError);
      }

      setGlobalMessage(
        formatMasterDataMessage(labels.importSuccess, {
          departments: data.summary.departments,
          workstations: data.summary.workstations,
          equipments: data.summary.equipments,
          workers: data.summary.workers,
        }),
      );
      window.location.reload();
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : labels.importError);
    } finally {
      setImportLoading(false);
    }
  }

  async function bootstrapPl01Defaults() {
    setBootstrapLoading(true);
    setGlobalMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/bootstrap-pl01`, {
        method: "POST",
      });
      const json = await requireApiResponse<{
        workstations: CatalogItem[];
        workers: Worker[];
        injuryTypes: CatalogItem[];
        summary: { workstations: number; workers: number; injuryTypes: number };
      }>(response, labels.pl01Error);
      const data = json.data;

      if (!data) {
        throw new Error(labels.pl01Error);
      }

      setCatalog("workstation", data.workstations);
      setWorkers(sortWorkers(data.workers));
      setCatalog("injuryType", data.injuryTypes);
      setGlobalMessage(
        formatMasterDataMessage(labels.pl01Success, {
          workstations: data.summary.workstations,
          workers: data.summary.workers,
          injuryTypes: data.summary.injuryTypes,
        }),
      );
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : labels.pl01Error);
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function syncDefaultInjuryTypes() {
    setInjuryTypesLoading(true);
    setGlobalMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/injury-types`, {
        method: "POST",
      });
      const json = await requireApiResponse<{
        injuryTypes: CatalogItem[];
        summary: { injuryTypes: number };
      }>(response, labels.injurySyncError);
      const data = json.data;

      if (!data) {
        throw new Error(labels.injurySyncError);
      }

      setCatalog("injuryType", data.injuryTypes);
      setGlobalMessage(formatMasterDataMessage(labels.injurySyncSuccess, { injuryTypes: data.summary.injuryTypes }));
    } catch (error) {
      setGlobalMessage(error instanceof Error ? error.message : labels.injurySyncError);
    } finally {
      setInjuryTypesLoading(false);
    }
  }

  function renderCatalogCard(type: MasterDataType) {
    const section = getSection(labels, type);
    const form = forms[type];

    return (
      <form key={type} onSubmit={(event) => void submitCatalog(type, event)} className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
            <HelpPopover title={section.title} body={labels.help[type]} buttonLabel={labels.helpButton} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
              onClick={() => void deactivateAllCatalog(type)}
              disabled={catalogs[type].length === 0 || Boolean(deletingKey)}
            >
              {deletingKey === `catalog:${type}:all` ? labels.deactivatingAll : labels.deactivateAll}
            </button>
            {form.id ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={() => clearForm(type)}>
                {labels.cancel}
              </button>
            ) : null}
          </div>
        </div>

        <input
          value={form.code}
          onChange={(event) => updateForm(type, { code: event.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={section.codePlaceholder}
          required
        />

        {supportsCategory(type) ? (
          <input
            value={form.category}
            onChange={(event) => updateForm(type, { category: event.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.category}
            required
          />
        ) : null}

        <input
          value={form.name}
          onChange={(event) => updateForm(type, { name: event.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={section.namePlaceholder}
          required
        />

        <Button type="submit" size="sm" disabled={savingKey === `catalog:${type}`}>
          {savingKey === `catalog:${type}` ? labels.saving : form.id ? labels.saveChanges : section.createLabel}
        </Button>
        {catalogMessages[type] ? <p className="text-xs text-slate-600" aria-live="polite">{catalogMessages[type]}</p> : null}

        <div className="max-h-56 space-y-2 overflow-y-auto text-xs text-slate-600">
          {catalogs[type].length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-slate-500">{section.emptyLabel}</p>
          ) : (
            catalogs[type].map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p className="min-w-0 truncate">
                  {supportsCategory(type) && item.category ? <span>{item.category} | </span> : null}
                  <span data-no-translate>{item.code}</span>
                  <span> - {item.name}</span>
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => startEdit(type, item)} disabled={Boolean(deletingKey)}>
                    {labels.edit}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                    onClick={() => void deactivateCatalog(type, item)}
                    disabled={Boolean(deletingKey)}
                  >
                    {deletingKey === `catalog:${type}:${item.id}` ? labels.updating : labels.deactivate}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </form>
    );
  }

  return (
    <section className="app-panel space-y-4 rounded-xl p-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.title}</h2>
          <HelpPopover title={labels.title} body={labels.help.module} buttonLabel={labels.helpButton} />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importExcel(file);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
            {importLoading ? labels.importingExcel : labels.importExcel}
          </Button>
          <Link href={`/api/plants/${plant}/admin/master-data/template`} className="app-toolbar">
            {labels.downloadTemplate}
          </Link>
          <HelpPopover title={labels.importExcel} body={labels.excelHelp} buttonLabel={labels.helpButton} />
          <Button type="button" size="sm" variant="secondary" onClick={() => void syncDefaultInjuryTypes()} disabled={injuryTypesLoading}>
            {injuryTypesLoading ? labels.syncingInjuryTypes : labels.syncInjuryTypes}
          </Button>
          {isPl01Code(plant) ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void bootstrapPl01Defaults()} disabled={bootstrapLoading}>
              {bootstrapLoading ? labels.loadingPl01Defaults : labels.loadPl01Defaults}
            </Button>
          ) : null}
        </div>
      </header>
      {globalMessage ? <p className="text-xs text-slate-600" aria-live="polite">{globalMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {renderCatalogCard("area")}
        {renderCatalogCard("workstation")}
        {renderCatalogCard("equipment")}
        <form onSubmit={(event) => void submitWorker(event)} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{labels.workerSectionTitle}</h3>
              <HelpPopover title={labels.workerSectionTitle} body={labels.help.workers} buttonLabel={labels.helpButton} />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                onClick={() => void deactivateAllWorkers()}
                disabled={workers.length === 0 || Boolean(deletingKey)}
              >
                {deletingKey === "worker:all" ? labels.deactivatingAll : labels.deactivateAll}
              </button>
              {workerForm.id ? (
                <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={() => setWorkerForm({ ...EMPTY_WORKER_FORM })}>
                  {labels.cancel}
                </button>
              ) : null}
            </div>
          </div>

          <input
            value={workerForm.employeeNo}
            onChange={(event) => updateWorkerForm({ employeeNo: event.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.employeeNumber}
            required
          />
          <input
            value={workerForm.name}
            onChange={(event) => updateWorkerForm({ name: event.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.workerName}
            required
          />
          <input
            value={workerForm.dept}
            onChange={(event) => updateWorkerForm({ dept: event.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.department}
          />

          <Button type="submit" size="sm" disabled={savingKey === "worker"}>
            {savingKey === "worker" ? labels.saving : workerForm.id ? labels.saveChanges : labels.saveWorker}
          </Button>
          {workerMessage ? <p className="text-xs text-slate-600" aria-live="polite">{workerMessage}</p> : null}

          <div className="max-h-56 space-y-2 overflow-y-auto text-xs text-slate-600">
            {workers.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-slate-500">{labels.noWorkers}</p>
            ) : (
              workers.map((worker) => (
                <div key={worker.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                  <p className="min-w-0 truncate">
                    <span data-no-translate>{worker.employeeNo}</span>
                    <span> - {worker.name}{worker.dept ? ` (${worker.dept})` : ""}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => startWorkerEdit(worker)} disabled={Boolean(deletingKey)}>
                      {labels.edit}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                      onClick={() => void deactivateWorker(worker)}
                      disabled={Boolean(deletingKey)}
                    >
                      {deletingKey === `worker:${worker.id}` ? labels.updating : labels.deactivate}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {renderCatalogCard("unsafeActType")}
        {renderCatalogCard("unsafeConditionType")}
        {renderCatalogCard("nearMissType")}
        {renderCatalogCard("injuryType")}
      </div>
    </section>
  );
}
