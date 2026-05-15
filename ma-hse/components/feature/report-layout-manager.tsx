"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ReportLayout = {
  id: string;
  title: string;
  description: string;
};

function createEmptyLayout(): ReportLayout {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
  };
}

export function ReportLayoutManager({
  plantCode,
  initialLayouts,
}: {
  plantCode: string;
  initialLayouts: ReportLayout[];
}) {
  const [layouts, setLayouts] = useState<ReportLayout[]>(initialLayouts.length ? initialLayouts : [createEmptyLayout()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveLayouts() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/admin/report-layout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          layouts: layouts.filter((layout) => layout.title.trim().length > 0),
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.message ?? "Failed to save report layouts");
      }

      setLayouts(json.data.layouts ?? layouts);
      setMessage("Report layouts saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save report layouts");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Report Layout</h2>
          </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setLayouts((current) => [...current, createEmptyLayout()])}>
          Add layout
        </Button>
      </header>

      <div className="mt-4 space-y-3">
        {layouts.map((layout, index) => (
          <div key={layout.id} className="grid gap-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Layout {index + 1}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLayouts((current) => (current.length === 1 ? current : current.filter((item) => item.id !== layout.id)))}
              >
                Remove
              </Button>
            </div>
            <input
              value={layout.title}
              onChange={(event) =>
                setLayouts((current) =>
                  current.map((item) => (item.id === layout.id ? { ...item, title: event.target.value } : item)),
                )
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Layout title"
            />
            <textarea
              value={layout.description}
              onChange={(event) =>
                setLayouts((current) =>
                  current.map((item) => (item.id === layout.id ? { ...item, description: event.target.value } : item)),
                )
              }
              rows={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Layout description / sections"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" onClick={saveLayouts} disabled={saving}>
          {saving ? "Saving..." : "Save layouts"}
        </Button>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </div>
    </section>
  );
}
