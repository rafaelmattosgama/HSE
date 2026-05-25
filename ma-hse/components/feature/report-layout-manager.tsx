"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

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
  labels = getStaticN0MasterDataUi("en"),
}: {
  plantCode: string;
  initialLayouts: ReportLayout[];
  labels?: N0MasterDataUi;
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
        throw new Error(json.message ?? labels.reportLayout.error);
      }

      setLayouts(json.data.layouts ?? layouts);
      setMessage(labels.reportLayout.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.reportLayout.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{labels.reportLayout.title}</h2>
              <HelpPopover title={labels.reportLayout.title} body={labels.reportLayout.help} buttonLabel={labels.helpButton} />
            </div>
          </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setLayouts((current) => [...current, createEmptyLayout()])}>
          {labels.reportLayout.addLayout}
        </Button>
      </header>

      <div className="mt-4 space-y-3">
        {layouts.map((layout, index) => (
          <div key={layout.id} className="grid gap-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{formatMasterDataMessage(labels.reportLayout.layoutTitle, { index: index + 1 })}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLayouts((current) => (current.length === 1 ? current : current.filter((item) => item.id !== layout.id)))}
              >
                {labels.reportLayout.remove}
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
              placeholder={labels.reportLayout.titlePlaceholder}
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
              placeholder={labels.reportLayout.descriptionPlaceholder}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" onClick={saveLayouts} disabled={saving}>
          {saving ? labels.saving : labels.reportLayout.saveLayouts}
        </Button>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </div>
    </section>
  );
}
