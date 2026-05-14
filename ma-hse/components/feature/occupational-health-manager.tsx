"use client";

import { Pencil, Plus, UserX, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type WorkstationOption = {
  id: string;
  name: string;
};

type WorkerRow = {
  id: string;
  employeeNo: string;
  name: string;
  age: number;
  birthDate: string;
  workstationId: string | null;
  workstationName: string | null;
  gender: "MALE" | "FEMALE";
  hireDate: string;
  roleStartDate: string;
  roleName: string | null;
  nationality: string | null;
  examDate: string;
  validUntil: string | null;
  status: string;
  observation: string | null;
  isActive: boolean;
};

type FormState = {
  id?: string;
  employeeNo: string;
  name: string;
  birthDate: string;
  workstationId: string;
  gender: "MALE" | "FEMALE";
  hireDate: string;
  roleStartDate: string;
  roleName: string;
  nationality: string;
  examDate: string;
  validUntil: string;
  status: "VALID" | "EXPIRED" | "DUE_SOON" | "PENDING";
  observation: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  employeeNo: "",
  name: "",
  birthDate: "",
  workstationId: "",
  gender: "MALE",
  hireDate: "",
  roleStartDate: "",
  roleName: "",
  nationality: "",
  examDate: "",
  validUntil: "",
  status: "VALID",
  observation: "",
  isActive: true,
};

function calculateAge(birthDate: string) {
  if (!birthDate) return 0;
  const date = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
  return age;
}

function statusClasses(status: string) {
  if (status === "VALID") return "bg-emerald-100 text-emerald-700";
  if (status === "DUE_SOON" || status === "PENDING") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export function OccupationalHealthManager({
  plant,
  initialWorkers,
  workstations,
}: {
  plant: string;
  initialWorkers: WorkerRow[];
  workstations: WorkstationOption[];
}) {
  const [workers, setWorkers] = useState(initialWorkers);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = selectedIds.length;
  const age = useMemo(() => calculateAge(form.birthDate), [form.birthDate]);

  function openCreateModal() {
    setEditing(false);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(worker: WorkerRow) {
    setEditing(true);
    setForm({
      id: worker.id,
      employeeNo: worker.employeeNo,
      name: worker.name,
      birthDate: worker.birthDate.slice(0, 10),
      workstationId: worker.workstationId ?? "",
      gender: worker.gender,
      hireDate: worker.hireDate.slice(0, 10),
      roleStartDate: worker.roleStartDate.slice(0, 10),
      roleName: worker.roleName ?? "",
      nationality: worker.nationality ?? "",
      examDate: worker.examDate.slice(0, 10),
      validUntil: worker.validUntil?.slice(0, 10) ?? "",
      status: (worker.status as FormState["status"]) ?? "VALID",
      observation: worker.observation ?? "",
      isActive: worker.isActive,
    });
    setModalOpen(true);
  }

  async function saveWorker(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const endpoint = form.id
        ? `/api/plants/${plant}/occupational-health/workers/${form.id}`
        : `/api/plants/${plant}/occupational-health/workers`;
      const response = await fetch(endpoint, {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeNo: form.employeeNo,
          name: form.name,
          birthDate: form.birthDate,
          workstationId: form.workstationId || undefined,
          gender: form.gender,
          hireDate: form.hireDate,
          roleStartDate: form.roleStartDate,
          roleName: form.roleName || undefined,
          nationality: form.nationality || undefined,
          examDate: form.examDate,
          validUntil: form.validUntil || undefined,
          status: form.status,
          observation: form.observation || undefined,
          isActive: form.isActive,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.message ?? "Failed to save worker");

      const worker = json.data.worker as WorkerRow;
      setWorkers((current) => [...current.filter((item) => item.id !== worker.id), worker].sort((a, b) => a.name.localeCompare(b.name)));
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setMessage(form.id ? "Worker updated." : "Worker created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save worker");
    } finally {
      setSaving(false);
    }
  }

  async function inactivateSelected() {
    if (!selectedIds.length) {
      setMessage("Select at least one worker.");
      return;
    }

    setMessage("");
    for (const workerId of selectedIds) {
      const response = await fetch(`/api/plants/${plant}/occupational-health/workers/${workerId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        setMessage(json.message ?? "Failed to inactivate selected workers");
        return;
      }
    }

    setWorkers((current) => current.map((worker) => (selectedIds.includes(worker.id) ? { ...worker, isActive: false } : worker)));
    setSelectedIds([]);
    setMessage("Selected workers inactivated.");
  }

  function toggleSelection(workerId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, workerId] : current.filter((id) => id !== workerId)));
  }

  async function importExcel(file: File) {
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/plants/${plant}/occupational-health/import`, {
      method: "POST",
      body: formData,
    });
    const json = await response.json();
    if (!response.ok || !json.ok) {
      setMessage(json.message ?? "Failed to import Excel");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Medicina do Trabalho</h1>
            <p className="mt-1 text-sm text-slate-600">Follow-up of occupational medical exams and worker validity by plant.</p>
          </div>
          <div className="flex gap-2">
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
            <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Import Excel
            </Button>
            <Link href={`/api/plants/${plant}/occupational-health/export?format=xlsx`} className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Export Excel
            </Link>
            <Link href={`/api/plants/${plant}/occupational-health/export?format=pdf`} className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Export PDF
            </Link>
            <Button type="button" size="sm" variant="secondary" onClick={inactivateSelected}>
              <UserX className="mr-2 h-4 w-4" />
              Inactivate worker
            </Button>
            <Button type="button" size="sm" onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Add worker
            </Button>
          </div>
        </div>
      </header>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Select</th>
              <th className="px-4 py-3">Worker no.</th>
              <th className="px-4 py-3">Worker name</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Exam date</th>
              <th className="px-4 py-3">Valid until</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Edit</th>
              <th className="px-4 py-3">Observation</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.id} className={`border-t border-slate-200 ${worker.isActive ? "" : "opacity-60"}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selectedIds.includes(worker.id)} onChange={(event) => toggleSelection(worker.id, event.target.checked)} />
                </td>
                <td className="px-4 py-3">{worker.employeeNo}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => openEditModal(worker)} className="font-semibold text-slate-900 hover:text-teal-700 hover:underline">
                    {worker.name}
                  </button>
                </td>
                <td className="px-4 py-3">{worker.age}</td>
                <td className="px-4 py-3">{worker.examDate.slice(0, 10)}</td>
                <td className="px-4 py-3">{worker.validUntil?.slice(0, 10) ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(worker.status)}`}>
                    {worker.isActive ? worker.status : "INACTIVE"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => openEditModal(worker)} className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
                <td className="px-4 py-3">{worker.observation ?? "-"}</td>
              </tr>
            ))}
            {workers.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">No workers registered in occupational health.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <p className="text-sm text-slate-600">{selectedCount} worker(s) selected.</p>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 px-4 py-10 backdrop-blur-[2px]">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{editing ? "Worker data" : "Create worker"}</h2>
                <p className="mt-1 text-sm text-slate-600">This floating window keeps the table in the background and the data can always be edited.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveWorker} className="space-y-4 px-6 py-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Age is calculated automatically from birth date.</p>
                {editing ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Editable</span>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Worker name</span>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Worker number</span>
                  <input value={form.employeeNo} onChange={(event) => setForm((current) => ({ ...current, employeeNo: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Birth date</span>
                  <input type="date" value={form.birthDate} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Age</span>
                  <input value={age || ""} className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2" readOnly />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Gender</span>
                  <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as FormState["gender"] }))} className="w-full rounded-md border border-slate-300 px-3 py-2">
                    <option value="MALE">Masculino</option>
                    <option value="FEMALE">Feminino</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Nationality</span>
                  <input value={form.nationality} onChange={(event) => setForm((current) => ({ ...current, nationality: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Hire date</span>
                  <input type="date" value={form.hireDate} onChange={(event) => setForm((current) => ({ ...current, hireDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Role start date</span>
                  <input type="date" value={form.roleStartDate} onChange={(event) => setForm((current) => ({ ...current, roleStartDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Role</span>
                  <input value={form.roleName} onChange={(event) => setForm((current) => ({ ...current, roleName: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Workstation</span>
                  <select value={form.workstationId} onChange={(event) => setForm((current) => ({ ...current, workstationId: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2">
                    <option value="">Select workstation</option>
                    {workstations.map((workstation) => (
                      <option key={workstation.id} value={workstation.id}>{workstation.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Exam date</span>
                  <input type="date" value={form.examDate} onChange={(event) => setForm((current) => ({ ...current, examDate: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" required />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Valid until</span>
                  <input type="date" value={form.validUntil} onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))} className="w-full rounded-md border border-slate-300 px-3 py-2">
                    <option value="VALID">VALID</option>
                    <option value="DUE_SOON">DUE_SOON</option>
                    <option value="EXPIRED">EXPIRED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Observation</span>
                <textarea value={form.observation} onChange={(event) => setForm((current) => ({ ...current, observation: event.target.value }))} rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Create worker"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
