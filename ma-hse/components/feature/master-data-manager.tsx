"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

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

export function MasterDataManager({
  initialAreas,
  initialWorkstations,
  initialWorkers,
}: {
  initialAreas: Item[];
  initialWorkstations: Item[];
  initialWorkers: Worker[];
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];

  const [areas, setAreas] = useState(initialAreas);
  const [workstations, setWorkstations] = useState(initialWorkstations);
  const [workers, setWorkers] = useState(initialWorkers);
  const [areaCode, setAreaCode] = useState("");
  const [areaName, setAreaName] = useState("");
  const [workstationCode, setWorkstationCode] = useState("");
  const [workstationName, setWorkstationName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerDept, setWorkerDept] = useState("");
  const [message, setMessage] = useState("");

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
      setAreas((current) => [...current.filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)));
      setAreaCode("");
      setAreaName("");
      setMessage("Area saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save area");
    }
  }

  async function submitWorkstation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = await createMasterData("workstation", workstationCode, workstationName);
      setWorkstations((current) => [...current.filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)));
      setWorkstationCode("");
      setWorkstationName("");
      setMessage("Workstation saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save workstation");
    }
  }

  async function submitWorker(event: React.FormEvent) {
    event.preventDefault();
    try {
      const worker = await createWorker();
      setWorkers((current) => [...current.filter((entry) => entry.id !== worker.id), worker].sort((a, b) => a.name.localeCompare(b.name)));
      setEmployeeNo("");
      setWorkerName("");
      setWorkerDept("");
      setMessage("Worker saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save worker");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Plant Master Data</h2>
        <p className="mt-1 text-xs text-slate-600">Create areas, workstations and workers for this plant.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={submitArea} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Area</h3>
          <input value={areaCode} onChange={(event) => setAreaCode(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Code" required />
          <input value={areaName} onChange={(event) => setAreaName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Name" required />
          <Button type="submit" size="sm">Save area</Button>
          <div className="space-y-1 text-xs text-slate-600">
            {areas.map((item) => <p key={item.id}>{item.code} - {item.name}</p>)}
          </div>
        </form>

        <form onSubmit={submitWorkstation} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstation</h3>
          <input value={workstationCode} onChange={(event) => setWorkstationCode(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Code" required />
          <input value={workstationName} onChange={(event) => setWorkstationName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Name" required />
          <Button type="submit" size="sm">Save workstation</Button>
          <div className="space-y-1 text-xs text-slate-600">
            {workstations.map((item) => <p key={item.id}>{item.code} - {item.name}</p>)}
          </div>
        </form>

        <form onSubmit={submitWorker} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Worker</h3>
          <input value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Employee number" required />
          <input value={workerName} onChange={(event) => setWorkerName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Name" required />
          <input value={workerDept} onChange={(event) => setWorkerDept(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Department (optional)" />
          <Button type="submit" size="sm">Save worker</Button>
          <div className="space-y-1 text-xs text-slate-600">
            {workers.map((item) => <p key={item.id}>{item.employeeNo} - {item.name}</p>)}
          </div>
        </form>
      </div>

      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </section>
  );
}
