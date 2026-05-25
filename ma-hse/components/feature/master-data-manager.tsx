"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { isPl01Code } from "@/lib/defaults/pl01-master-data";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

type Item = {
  id: string;
  code: string;
  name: string;
};

type Worker = {
  id: string;
  employeeNo: string;
  name: string;
  dept: string | null;
};

type EditingState = {
  areaId: string | null;
  workstationId: string | null;
  employeeNo: string | null;
};

type DeletingState = {
  type: "area" | "workstation" | "worker";
  id: string;
};

function sortItems(items: Item[]) {
  return [...items].sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
}

function sortWorkers(items: Worker[]) {
  return [...items].sort((a, b) => a.employeeNo.localeCompare(b.employeeNo) || a.name.localeCompare(b.name));
}

export function MasterDataManager({
  initialAreas,
  initialWorkstations,
  initialWorkers,
  plantCode,
  labels = getStaticN0MasterDataUi("en"),
}: {
  initialAreas: Item[];
  initialWorkstations: Item[];
  initialWorkers: Worker[];
  plantCode?: string;
  labels?: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plant = plantCode ?? pathname.split("/")[2];

  const [areas, setAreas] = useState(sortItems(initialAreas));
  const [workstations, setWorkstations] = useState(sortItems(initialWorkstations));
  const [workers, setWorkers] = useState(sortWorkers(initialWorkers));
  const [areaCode, setAreaCode] = useState("");
  const [areaName, setAreaName] = useState("");
  const [workstationCode, setWorkstationCode] = useState("");
  const [workstationName, setWorkstationName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerDept, setWorkerDept] = useState("");
  const [editing, setEditing] = useState<EditingState>({
    areaId: null,
    workstationId: null,
    employeeNo: null,
  });
  const [deleting, setDeleting] = useState<DeletingState | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [injuryTypesLoading, setInjuryTypesLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setAreas(sortItems(initialAreas));
    setWorkstations(sortItems(initialWorkstations));
    setWorkers(sortWorkers(initialWorkers));
    setAreaCode("");
    setAreaName("");
    setWorkstationCode("");
    setWorkstationName("");
    setEmployeeNo("");
    setWorkerName("");
    setWorkerDept("");
    setEditing({
      areaId: null,
      workstationId: null,
      employeeNo: null,
    });
    setDeleting(null);
    setMessage("");
  }, [initialAreas, initialWorkstations, initialWorkers, plant]);

  async function createMasterData(type: "area" | "workstation", code: string, name: string, id?: string | null) {
    const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id ?? undefined, type, code, name }),
    });
    const json = await response.json();
    if (!json.ok) throw new Error(json.message ?? formatMasterDataMessage(labels.failedToSaveItem, { section: labels.sections[type].title }));
    return json.data.item as Item;
  }

  async function createWorker() {
    const response = await fetch(`/api/plants/${plant}/admin/workers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeNo,
        name: workerName,
        dept: workerDept || undefined,
      }),
    });
    const json = await response.json();
    if (!json.ok) throw new Error(json.message ?? labels.failedToSaveWorker);
    return json.data.worker as Worker;
  }

  function isDeleting(type: DeletingState["type"], id: string) {
    return deleting?.type === type && deleting.id === id;
  }

  async function deleteMasterData(type: "area" | "workstation", item: Item) {
    if (!window.confirm(labels.sections[type].deleteConfirm)) {
      return;
    }

    setDeleting({ type, id: item.id });
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id: item.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.sections[type].deleteSuccess);
      }

      if (type === "area") {
        setAreas((current) => current.filter((entry) => entry.id !== item.id));
        if (editing.areaId === item.id) cancelAreaEdit();
        setMessage(labels.sections.area.deleteSuccess);
      } else {
        setWorkstations((current) => current.filter((entry) => entry.id !== item.id));
        if (editing.workstationId === item.id) cancelWorkstationEdit();
        setMessage(labels.sections.workstation.deleteSuccess);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.sections[type].deleteSuccess);
    } finally {
      setDeleting(null);
    }
  }

  async function deleteWorker(item: Worker) {
    if (!window.confirm(labels.workerDeleteConfirm)) {
      return;
    }

    setDeleting({ type: "worker", id: item.id });
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/workers`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.failedToSaveWorker);
      }

      setWorkers((current) => current.filter((entry) => entry.id !== item.id));
      if (editing.employeeNo === item.employeeNo) cancelWorkerEdit();
      setMessage(labels.workerDeleteSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.failedToSaveWorker);
    } finally {
      setDeleting(null);
    }
  }

  async function submitArea(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = await createMasterData("area", areaCode, areaName, editing.areaId);
      setAreas((current) =>
        sortItems(editing.areaId ? current.map((entry) => (entry.id === item.id ? item : entry)) : [...current, item]),
      );
      const updated = editing.areaId
        ? formatMasterDataMessage(labels.itemUpdated, { section: labels.sections.area.title })
        : formatMasterDataMessage(labels.itemCreated, { section: labels.sections.area.title });
      setAreaCode("");
      setAreaName("");
      setEditing((current) => ({ ...current, areaId: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : formatMasterDataMessage(labels.failedToSaveItem, { section: labels.sections.area.title }));
    }
  }

  async function submitWorkstation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = await createMasterData("workstation", workstationCode, workstationName, editing.workstationId);
      setWorkstations((current) =>
        sortItems(editing.workstationId ? current.map((entry) => (entry.id === item.id ? item : entry)) : [...current, item]),
      );
      const updated = editing.workstationId
        ? formatMasterDataMessage(labels.itemUpdated, { section: labels.sections.workstation.title })
        : formatMasterDataMessage(labels.itemCreated, { section: labels.sections.workstation.title });
      setWorkstationCode("");
      setWorkstationName("");
      setEditing((current) => ({ ...current, workstationId: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : formatMasterDataMessage(labels.failedToSaveItem, { section: labels.sections.workstation.title }));
    }
  }

  async function submitWorker(event: React.FormEvent) {
    event.preventDefault();
    try {
      const worker = await createWorker();
      setWorkers((current) => sortWorkers([...current.filter((entry) => entry.employeeNo !== worker.employeeNo), worker]));
      const updated = editing.employeeNo ? labels.workerUpdated : labels.workerCreated;
      setEmployeeNo("");
      setWorkerName("");
      setWorkerDept("");
      setEditing((current) => ({ ...current, employeeNo: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.failedToSaveWorker);
    }
  }

  function startAreaEdit(item: Item) {
    setAreaCode(item.code);
    setAreaName(item.name);
    setEditing((current) => ({ ...current, areaId: item.id }));
    setMessage(formatMasterDataMessage(labels.itemEditMessage, { section: labels.sections.area.title, code: item.code }));
  }

  function startWorkstationEdit(item: Item) {
    setWorkstationCode(item.code);
    setWorkstationName(item.name);
    setEditing((current) => ({ ...current, workstationId: item.id }));
    setMessage(formatMasterDataMessage(labels.itemEditMessage, { section: labels.sections.workstation.title, code: item.code }));
  }

  function startWorkerEdit(item: Worker) {
    setEmployeeNo(item.employeeNo);
    setWorkerName(item.name);
    setWorkerDept(item.dept ?? "");
    setEditing((current) => ({ ...current, employeeNo: item.employeeNo }));
    setMessage(formatMasterDataMessage(labels.workerEditMessage, { code: item.employeeNo }));
  }

  function cancelAreaEdit() {
    setAreaCode("");
    setAreaName("");
    setEditing((current) => ({ ...current, areaId: null }));
  }

  function cancelWorkstationEdit() {
    setWorkstationCode("");
    setWorkstationName("");
    setEditing((current) => ({ ...current, workstationId: null }));
  }

  function cancelWorkerEdit() {
    setEmployeeNo("");
    setWorkerName("");
    setWorkerDept("");
    setEditing((current) => ({ ...current, employeeNo: null }));
  }

  async function importExcel(file: File) {
    setImportLoading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/plants/${plant}/admin/master-data/import`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message ?? labels.importError);
      }

      setMessage(
        formatMasterDataMessage(labels.importSuccess, {
          departments: json.data.summary.departments,
          workstations: json.data.summary.workstations,
          workers: json.data.summary.workers,
        }),
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.importError);
    } finally {
      setImportLoading(false);
    }
  }

  async function bootstrapPl01Defaults() {
    setBootstrapLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/bootstrap-pl01`, {
        method: "POST",
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? labels.pl01Error);
      }

      setWorkstations(
        sortItems((json.data.workstations as Item[]).map((item) => ({ id: item.id, code: item.code, name: item.name }))),
      );
      setWorkers(
        sortWorkers(
          (json.data.workers as Worker[]).map((item) => ({
            id: item.id,
            employeeNo: item.employeeNo,
            name: item.name,
            dept: item.dept ?? null,
          })),
        ),
      );
      setMessage(
        formatMasterDataMessage(labels.pl01Success, {
          workstations: json.data.summary.workstations,
          workers: json.data.summary.workers,
          injuryTypes: json.data.summary.injuryTypes,
        }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.pl01Error);
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function syncDefaultInjuryTypes() {
    setInjuryTypesLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/injury-types`, {
        method: "POST",
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? labels.injurySyncError);
      }

      setMessage(formatMasterDataMessage(labels.injurySyncSuccess, { injuryTypes: json.data.summary.injuryTypes }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.injurySyncError);
    } finally {
      setInjuryTypesLoading(false);
    }
  }

  return (
    <section className="app-panel space-y-4 rounded-xl p-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.title}</h2>
          <HelpPopover title={labels.title} body={labels.help.module} buttonLabel={labels.helpButton} />
        </div>
        <div className="flex flex-wrap gap-2">
          <HelpPopover title={labels.importExcel} body={labels.excelHelp} buttonLabel={labels.helpButton} />
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
          <Button type="button" size="sm" variant="secondary" onClick={syncDefaultInjuryTypes} disabled={injuryTypesLoading}>
            {injuryTypesLoading ? labels.syncingInjuryTypes : labels.syncInjuryTypes}
          </Button>
          {isPl01Code(plant) ? (
            <Button type="button" size="sm" variant="secondary" onClick={bootstrapPl01Defaults} disabled={bootstrapLoading}>
              {bootstrapLoading ? labels.loadingPl01Defaults : labels.loadPl01Defaults}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={submitArea} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{labels.sections.area.title}</h3>
              <HelpPopover title={labels.sections.area.title} body={labels.help.area} buttonLabel={labels.helpButton} />
            </div>
            {editing.areaId ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelAreaEdit}>
                {labels.cancel}
              </button>
            ) : null}
          </div>
          <input
            value={areaCode}
            onChange={(event) => setAreaCode(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder={labels.sections.area.codePlaceholder}
            required
            disabled={Boolean(editing.areaId)}
          />
          <input
            value={areaName}
            onChange={(event) => setAreaName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.sections.area.namePlaceholder}
            required
          />
          <Button type="submit" size="sm">{editing.areaId ? labels.saveChanges : labels.sections.area.createLabel}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {areas.length === 0 ? <p>{labels.sections.area.emptyLabel}</p> : null}
            {areas.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p className="min-w-0 truncate">{item.code} - {item.name}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50" onClick={() => startAreaEdit(item)} disabled={Boolean(deleting)}>
                    {labels.edit}
                  </button>
                  <button type="button" className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50" onClick={() => void deleteMasterData("area", item)} disabled={Boolean(deleting)}>
                    {isDeleting("area", item.id) ? labels.updating : labels.deactivate}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>

        <form onSubmit={submitWorkstation} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{labels.sections.workstation.title}</h3>
              <HelpPopover title={labels.sections.workstation.title} body={labels.help.workstation} buttonLabel={labels.helpButton} />
            </div>
            {editing.workstationId ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelWorkstationEdit}>
                {labels.cancel}
              </button>
            ) : null}
          </div>
          <input
            value={workstationCode}
            onChange={(event) => setWorkstationCode(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder={labels.sections.workstation.codePlaceholder}
            required
            disabled={Boolean(editing.workstationId)}
          />
          <input
            value={workstationName}
            onChange={(event) => setWorkstationName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.sections.workstation.namePlaceholder}
            required
          />
          <Button type="submit" size="sm">{editing.workstationId ? labels.saveChanges : labels.sections.workstation.createLabel}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {workstations.length === 0 ? <p>{labels.sections.workstation.emptyLabel}</p> : null}
            {workstations.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p className="min-w-0 truncate">{item.code} - {item.name}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50" onClick={() => startWorkstationEdit(item)} disabled={Boolean(deleting)}>
                    {labels.edit}
                  </button>
                  <button type="button" className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50" onClick={() => void deleteMasterData("workstation", item)} disabled={Boolean(deleting)}>
                    {isDeleting("workstation", item.id) ? labels.updating : labels.deactivate}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>

        <form onSubmit={submitWorker} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{labels.workerSectionTitle}</h3>
              <HelpPopover title={labels.workerSectionTitle} body={labels.help.workers} buttonLabel={labels.helpButton} />
            </div>
            {editing.employeeNo ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelWorkerEdit}>
                {labels.cancel}
              </button>
            ) : null}
          </div>
          <input
            value={employeeNo}
            onChange={(event) => setEmployeeNo(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder={labels.employeeNumber}
            required
            disabled={Boolean(editing.employeeNo)}
          />
          <input
            value={workerName}
            onChange={(event) => setWorkerName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.workerName}
            required
          />
          <input
            value={workerDept}
            onChange={(event) => setWorkerDept(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.department}
          />
          <Button type="submit" size="sm">{editing.employeeNo ? labels.saveChanges : labels.saveWorker}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {workers.length === 0 ? <p>{labels.noWorkers}</p> : null}
            {workers.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p className="min-w-0 truncate">{item.employeeNo} - {item.name}{item.dept ? ` (${item.dept})` : ""}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50" onClick={() => startWorkerEdit(item)} disabled={Boolean(deleting)}>
                    {labels.edit}
                  </button>
                  <button type="button" className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50" onClick={() => void deleteWorker(item)} disabled={Boolean(deleting)}>
                    {isDeleting("worker", item.id) ? labels.updating : labels.deactivate}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>
      </div>

      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </section>
  );
}
