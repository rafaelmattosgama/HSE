import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";

export default function NewCorporatePlantPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">New Plant</h1>
      </div>

      <CorporatePlantForm />
    </main>
  );
}
