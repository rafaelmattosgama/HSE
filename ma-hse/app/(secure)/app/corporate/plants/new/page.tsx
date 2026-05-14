import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";

export default function NewCorporatePlantPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">New Plant</h1>
        <p className="mt-1 text-sm text-slate-600">Create a new plant and assign the N1, N2 and N3 roles from a dedicated page.</p>
      </div>

      <CorporatePlantForm />
    </main>
  );
}
