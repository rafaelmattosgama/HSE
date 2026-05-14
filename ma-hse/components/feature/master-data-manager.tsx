"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isPl01Code } from "@/lib/defaults/pl01-master-data";

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
  areaCode: string | null;
  workstationCode: string | null;
  employeeNo: string | null;
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
}: {
  initialAreas: Item[];
  initialWorkstations: Item[];
  initialWorkers: Worker[];
  plantCode?: string;
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
    areaCode: null,
    workstationCode: null,
    employeeNo: null,
  });
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
      areaCode: null,
      workstationCode: null,
      employeeNo: null,
    });
    setMessage("");
  }, [initialAreas, initialWorkstations, initialWorkers, plant]);

  async function createMasterData(type: "area" | "workstation", code: string, name: string) {
    const response = await fetch(`/api/plants/${plant}/admin/master-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, code, name }),
    });
    const json = await response.json();
    if (!json.ok) throw new Error(json.message ?? `Failed to save ${type}`);
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
    if (!json.ok) throw new Error(json.message ?? "Failed to save worker");
    return json.data.worker as Worker;
  }

  async function submitArea(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = await createMasterData("area", areaCode, areaName);
      setAreas((current) => sortItems([...current.filter((entry) => entry.code !== item.code), item]));
      const updated = editing.areaCode ? "Departamento atualizado." : "Departamento gravado.";
      setAreaCode("");
      setAreaName("");
      setEditing((current) => ({ ...current, areaCode: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save department");
    }
  }

  async function submitWorkstation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = await createMasterData("workstation", workstationCode, workstationName);
      setWorkstations((current) => sortItems([...current.filter((entry) => entry.code !== item.code), item]));
      const updated = editing.workstationCode ? "Posto de trabalho atualizado." : "Posto de trabalho gravado.";
      setWorkstationCode("");
      setWorkstationName("");
      setEditing((current) => ({ ...current, workstationCode: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save workstation");
    }
  }

  async function submitWorker(event: React.FormEvent) {
    event.preventDefault();
    try {
      const worker = await createWorker();
      setWorkers((current) => sortWorkers([...current.filter((entry) => entry.employeeNo !== worker.employeeNo), worker]));
      const updated = editing.employeeNo ? "Trabalhador atualizado." : "Trabalhador gravado.";
      setEmployeeNo("");
      setWorkerName("");
      setWorkerDept("");
      setEditing((current) => ({ ...current, employeeNo: null }));
      setMessage(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save worker");
    }
  }

  function startAreaEdit(item: Item) {
    setAreaCode(item.code);
    setAreaName(item.name);
    setEditing((current) => ({ ...current, areaCode: item.code }));
    setMessage(`A editar departamento ${item.code}.`);
  }

  function startWorkstationEdit(item: Item) {
    setWorkstationCode(item.code);
    setWorkstationName(item.name);
    setEditing((current) => ({ ...current, workstationCode: item.code }));
    setMessage(`A editar posto de trabalho ${item.code}.`);
  }

  function startWorkerEdit(item: Worker) {
    setEmployeeNo(item.employeeNo);
    setWorkerName(item.name);
    setWorkerDept(item.dept ?? "");
    setEditing((current) => ({ ...current, employeeNo: item.employeeNo }));
    setMessage(`A editar trabalhador ${item.employeeNo}.`);
  }

  function cancelAreaEdit() {
    setAreaCode("");
    setAreaName("");
    setEditing((current) => ({ ...current, areaCode: null }));
  }

  function cancelWorkstationEdit() {
    setWorkstationCode("");
    setWorkstationName("");
    setEditing((current) => ({ ...current, workstationCode: null }));
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
        throw new Error(json.message ?? "Failed to import Excel");
      }

      setMessage(
        `Importação concluída: ${json.data.summary.departments} departamentos, ${json.data.summary.workstations} postos de trabalho e ${json.data.summary.workers} trabalhadores.`,
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to import Excel");
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
        throw new Error(json.message ?? "Failed to import PL01 defaults");
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
        `PL01 defaults loaded: ${json.data.summary.workstations} workstations, ${json.data.summary.workers} workers and ${json.data.summary.injuryTypes} injury types.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to import PL01 defaults");
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
        throw new Error(json.message ?? "Failed to sync injury types");
      }

      setMessage(`Global injury type list synchronized for this plant: ${json.data.summary.injuryTypes} active nature options.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to sync injury types");
    } finally {
      setInjuryTypesLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Plant Master Data</h2>
          <p className="mt-1 text-xs text-slate-600">
            Criar, editar e importar departamentos, workstations e trabalhadores da planta {plant.toUpperCase()}.
          </p>
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
            {importLoading ? "Importing Excel..." : "Import Excel"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={syncDefaultInjuryTypes} disabled={injuryTypesLoading}>
            {injuryTypesLoading ? "Syncing injury types..." : "Sync injury types"}
          </Button>
          {isPl01Code(plant) ? (
            <Button type="button" size="sm" variant="secondary" onClick={bootstrapPl01Defaults} disabled={bootstrapLoading}>
              {bootstrapLoading ? "Loading PL01 data..." : "Load PL01 defaults"}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={submitArea} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Departamento</h3>
            {editing.areaCode ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelAreaEdit}>
                Cancelar edição
              </button>
            ) : null}
          </div>
          <input
            value={areaCode}
            onChange={(event) => setAreaCode(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder="Código"
            required
            disabled={Boolean(editing.areaCode)}
          />
          <input
            value={areaName}
            onChange={(event) => setAreaName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Nome do departamento"
            required
          />
          <Button type="submit" size="sm">{editing.areaCode ? "Guardar edição" : "Guardar departamento"}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {areas.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p>{item.code} - {item.name}</p>
                <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => startAreaEdit(item)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
        </form>

        <form onSubmit={submitWorkstation} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Workstation</h3>
            {editing.workstationCode ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelWorkstationEdit}>
                Cancelar edição
              </button>
            ) : null}
          </div>
          <input
            value={workstationCode}
            onChange={(event) => setWorkstationCode(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder="Code"
            required
            disabled={Boolean(editing.workstationCode)}
          />
          <input
            value={workstationName}
            onChange={(event) => setWorkstationName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name"
            required
          />
          <Button type="submit" size="sm">{editing.workstationCode ? "Save edit" : "Save workstation"}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {workstations.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p>{item.code} - {item.name}</p>
                <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => startWorkstationEdit(item)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
        </form>

        <form onSubmit={submitWorker} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Trabalhador</h3>
            {editing.employeeNo ? (
              <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={cancelWorkerEdit}>
                Cancelar edição
              </button>
            ) : null}
          </div>
          <input
            value={employeeNo}
            onChange={(event) => setEmployeeNo(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            placeholder="Número de trabalhador"
            required
            disabled={Boolean(editing.employeeNo)}
          />
          <input
            value={workerName}
            onChange={(event) => setWorkerName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Nome"
            required
          />
          <input
            value={workerDept}
            onChange={(event) => setWorkerDept(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Departamento"
          />
          <Button type="submit" size="sm">{editing.employeeNo ? "Guardar edição" : "Guardar trabalhador"}</Button>
          <div className="max-h-52 space-y-2 overflow-y-auto text-xs text-slate-600">
            {workers.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2 py-1.5">
                <p>{item.employeeNo} - {item.name}{item.dept ? ` (${item.dept})` : ""}</p>
                <button type="button" className="text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => startWorkerEdit(item)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
        </form>
      </div>

      <p className="text-xs text-slate-500">
        O Excel pode incluir folhas com os nomes `Departments` ou `Departamentos`, `Workstations` e `Workers` ou `Trabalhadores`. As atualizações são feitas pelo código ou número do trabalhador.
      </p>

      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </section>
  );
}
