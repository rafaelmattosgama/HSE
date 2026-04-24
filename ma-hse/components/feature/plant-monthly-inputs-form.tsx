"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CustomMonthlyRow, MonthlyIndicatorConfig } from "@/lib/services/monthly-input-layout";
import type { MonthlyInputRow } from "@/lib/services/monthly-inputs";

type MonthlyEntry = MonthlyInputRow;
type LegacyMetricKey = keyof Omit<MonthlyEntry, "month">;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function emptyMonths() {
  return Array.from({ length: 12 }, () => null as number | null);
}

function slugify(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function formatTotal(values: Array<number | null>, integer = false) {
  const total = values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
  return integer ? String(Math.round(total)) : total.toFixed(2);
}

function isIntegerLegacyKey(key: LegacyMetricKey | null) {
  return key === "workerCount" || key === "spillsNumber";
}

function showsDistance(row: MonthlyIndicatorConfig) {
  return row.subsection === "Hazard waste" || row.subsection === "Non Hazardous waste";
}

function getLegacyValues(months: MonthlyEntry[], key: LegacyMetricKey) {
  return months.map((month) => month[key]);
}

function setLegacyValue(months: MonthlyEntry[], monthIndex: number, key: LegacyMetricKey, value: number | null) {
  return months.map((entry, index) => (index === monthIndex ? { ...entry, [key]: value } : entry));
}

function updateCustomRowValue(rows: CustomMonthlyRow[], rowId: string, monthIndex: number, value: number | null) {
  return rows.map((row) =>
    row.id === rowId
      ? {
          ...row,
          months: row.months.map((entry, index) => (index === monthIndex ? value : entry)),
        }
      : row,
  );
}

function updateCustomRowMeta(rows: CustomMonthlyRow[], rowId: string, updater: (row: CustomMonthlyRow) => CustomMonthlyRow) {
  return rows.map((row) => (row.id === rowId ? updater(row) : row));
}

function getCustomRow(rows: CustomMonthlyRow[], rowId: string) {
  return rows.find((row) => row.id === rowId) ?? null;
}

function computeStandardHours(config: MonthlyIndicatorConfig[], customRows: CustomMonthlyRow[]) {
  const totalMinCarRow = customRows.find((row) => row.id === "total-min-car");
  const volumesRow = customRows.find((row) => row.id === "volumes");
  const standardHoursRow = config.find((row) => row.id === "standard-hours");

  return Array.from({ length: 12 }, (_, index) => {
    if (!standardHoursRow?.enabled) return null;

    const totalMinCar = totalMinCarRow?.enabled ? totalMinCarRow.months[index] : null;
    const volumes = volumesRow?.enabled ? volumesRow.months[index] : null;
    if (typeof totalMinCar !== "number" || typeof volumes !== "number") return null;

    return Number(((totalMinCar * volumes) / 60).toFixed(2));
  });
}

function sortRows(config: MonthlyIndicatorConfig[]) {
  const grouped = new Map<string, Map<string, MonthlyIndicatorConfig[]>>();

  config.forEach((row) => {
    const section = row.section;
    const subsection = row.subsection ?? "__root__";
    if (!grouped.has(section)) grouped.set(section, new Map());
    const sectionMap = grouped.get(section)!;
    if (!sectionMap.has(subsection)) sectionMap.set(subsection, []);
    sectionMap.get(subsection)!.push(row);
  });

  return Array.from(grouped.entries()).map(([section, subsectionMap]) => ({
    section,
    groups: Array.from(subsectionMap.entries()).map(([subsection, rows]) => ({
      subsection: subsection === "__root__" ? null : subsection,
      rows,
    })),
  }));
}

export function PlantMonthlyInputsForm({
  plantCode,
  initialYear,
  initialMonths,
  initialIndicatorConfig,
  initialCustomRows,
}: {
  plantCode: string;
  initialYear: number;
  initialMonths: MonthlyEntry[];
  initialIndicatorConfig: MonthlyIndicatorConfig[];
  initialCustomRows: CustomMonthlyRow[];
}) {
  const [year, setYear] = useState(initialYear);
  const [months, setMonths] = useState<MonthlyEntry[]>(initialMonths);
  const [indicatorConfig, setIndicatorConfig] = useState<MonthlyIndicatorConfig[]>(initialIndicatorConfig);
  const [customRows, setCustomRows] = useState<CustomMonthlyRow[]>(initialCustomRows);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const standardHours = useMemo(() => computeStandardHours(indicatorConfig, customRows), [indicatorConfig, customRows]);
  const sections = useMemo(() => sortRows(indicatorConfig), [indicatorConfig]);

  function getRowValues(row: MonthlyIndicatorConfig) {
    if (row.id === "standard-hours") return standardHours;
    if (row.legacyKey) return getLegacyValues(months, row.legacyKey);
    return getCustomRow(customRows, row.id)?.months ?? emptyMonths();
  }

  function applyRowMetaUpdate(rowId: string, updater: (row: MonthlyIndicatorConfig) => MonthlyIndicatorConfig) {
    setIndicatorConfig((current) => current.map((row) => (row.id === rowId ? updater(row) : row)));
    setCustomRows((current) =>
      updateCustomRowMeta(current, rowId, (row) => {
        const updated = updater({
          id: row.id,
          section: row.section,
          subsection: row.subsection,
          label: row.label,
          legacyKey: null,
          enabled: row.enabled,
          col2Label: row.col2Label,
          col2Value: row.col2Value,
          col2Options: row.col2Options,
          col3Unit: row.col3Unit,
          col3Options: row.col3Options,
          distanceKm: row.distanceKm,
          valueMode: row.valueMode,
        });

        return {
          ...row,
          section: updated.section,
          subsection: updated.subsection,
          label: updated.label,
          enabled: updated.enabled,
          col2Label: updated.col2Label,
          col2Value: updated.col2Value,
          col2Options: updated.col2Options,
          col3Unit: updated.col3Unit,
          col3Options: updated.col3Options,
          distanceKm: updated.distanceKm,
          valueMode: updated.valueMode,
        };
      }),
    );
  }

  function updateMonthValue(row: MonthlyIndicatorConfig, monthIndex: number, rawValue: string) {
    if (row.valueMode === "computed") return;
    const value = rawValue.trim() === "" ? null : Number(rawValue);

    if (row.legacyKey) {
      setMonths((current) => setLegacyValue(current, monthIndex, row.legacyKey!, value));
      return;
    }

    setCustomRows((current) => updateCustomRowValue(current, row.id, monthIndex, value));
  }

  function addIndicator(section: string, subsection: string | null) {
    const id = `custom-${slugify(section)}-${slugify(subsection ?? "row")}-${crypto.randomUUID()}`;
    const newConfig: MonthlyIndicatorConfig = {
      id,
      section,
      subsection,
      label: "New indicator",
      legacyKey: null,
      enabled: true,
      col2Label: "Parameter",
      col2Value: null,
      col2Options: [],
      col3Unit: null,
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
    };

    const newRow: CustomMonthlyRow = {
      id,
      section,
      subsection,
      label: "New indicator",
      enabled: true,
      col2Label: "Parameter",
      col2Value: null,
      col2Options: [],
      col3Unit: null,
      col3Options: [],
      distanceKm: null,
      valueMode: "manual",
      months: emptyMonths(),
    };

    setIndicatorConfig((current) => [...current, newConfig]);
    setCustomRows((current) => [...current, newRow]);
    setEditingRowId(id);
  }

  function removeCustomIndicator(rowId: string) {
    setIndicatorConfig((current) => current.filter((row) => row.id !== rowId));
    setCustomRows((current) => current.filter((row) => row.id !== rowId));
    if (editingRowId === rowId) setEditingRowId(null);
  }

  async function loadYear(nextYear: number) {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plantCode}/monthly-inputs?year=${nextYear}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.message ?? "Failed to load monthly inputs");

      setYear(json.data.year as number);
      setMonths(json.data.months as MonthlyEntry[]);
      setIndicatorConfig(json.data.indicatorConfig as MonthlyIndicatorConfig[]);
      setCustomRows(json.data.customRows as CustomMonthlyRow[]);
      setEditingRowId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load monthly inputs");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const monthsPayload = months.map((entry, index) => ({
        ...entry,
        standardHours: standardHours[index],
      }));

      const response = await fetch(`/api/plants/${plantCode}/monthly-inputs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          year,
          months: monthsPayload,
          indicatorConfig,
          customRows,
        }),
      });

      const json = await response.json();
      if (!json.ok) throw new Error(json.message ?? "Failed to save monthly inputs");

      setMonths(monthsPayload);
      setMessage("Monthly data saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save monthly inputs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Monthly Plant Inputs</h2>
          <p className="mt-2 text-sm text-slate-600">
            Each indicator stays on a single compact row. Waste sections also include the transport distance in KM.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            min={2000}
            max={2100}
          />
          <Button type="button" variant="secondary" onClick={() => loadYear(year)} disabled={loading}>
            {loading ? "Loading..." : "Load year"}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {sections.map((section) => (
          <section key={section.section} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{section.section}</h3>
                <p className="text-sm text-slate-600">Compact layout with one line per indicator.</p>
              </div>
              {section.groups.length === 1 && !section.groups[0].subsection ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => addIndicator(section.section, null)}>
                  Add indicator
                </Button>
              ) : null}
            </div>

            {section.groups.map((group) => (
              <div key={`${section.section}-${group.subsection ?? "root"}`} className="mb-5 last:mb-0">
                {group.subsection ? (
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.subsection}</h4>
                    <Button type="button" size="sm" variant="secondary" onClick={() => addIndicator(section.section, group.subsection)}>
                      Add indicator
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {group.rows.map((row) => {
                    const values = getRowValues(row);
                    const integer = isIntegerLegacyKey(row.legacyKey);
                    const isEditing = editingRowId === row.id;
                    const isCustom = row.legacyKey === null;
                    const isDisabled = !row.enabled;
                    const hasDistance = showsDistance(row);

                    return (
                      <article
                        key={row.id}
                        className={cn(
                          "rounded-xl border p-3",
                          isDisabled ? "border-slate-200 bg-slate-100/90 text-slate-400" : "border-slate-200 bg-white",
                        )}
                      >
                        <div className="hidden xl:grid xl:grid-cols-[84px_88px_minmax(220px,1.4fr)_minmax(160px,0.95fr)_minmax(120px,0.75fr)_minmax(110px,0.7fr)_repeat(12,minmax(54px,1fr))_88px] xl:items-center xl:gap-2">
                          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(event) =>
                                applyRowMetaUpdate(row.id, (current) => ({ ...current, enabled: event.target.checked }))
                              }
                            />
                            Active
                          </label>

                          <div className="flex gap-1">
                            <Button type="button" size="sm" variant={isEditing ? "default" : "secondary"} onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}>
                              {isEditing ? "Done" : "Edit"}
                            </Button>
                            {isCustom ? (
                              <Button type="button" size="sm" variant="ghost" onClick={() => removeCustomIndicator(row.id)}>
                                Remove
                              </Button>
                            ) : null}
                          </div>

                          {isEditing ? (
                            <input
                              value={row.label}
                              onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, label: event.target.value }))}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            />
                          ) : (
                            <div>
                              <p className="font-medium text-slate-900">{row.label}</p>
                              {row.valueMode === "computed" ? <p className="text-[11px] text-slate-500">Auto</p> : null}
                            </div>
                          )}

                          {isEditing ? (
                            row.col2Options.length > 0 ? (
                              <select
                                value={row.col2Value ?? ""}
                                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col2Value: event.target.value || null }))}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                              >
                                <option value="">{row.col2Label ?? "Select"}</option>
                                {row.col2Options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={row.col2Value ?? ""}
                                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col2Value: event.target.value || null }))}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                                placeholder={row.col2Label ?? "Column 2"}
                              />
                            )
                          ) : (
                            <div className="text-sm text-slate-700">{row.col2Value ?? "-"}</div>
                          )}

                          {isEditing ? (
                            row.col3Options.length > 0 ? (
                              <select
                                value={row.col3Unit ?? ""}
                                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col3Unit: event.target.value || null }))}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                              >
                                <option value="">Unit</option>
                                {row.col3Options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={row.col3Unit ?? ""}
                                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col3Unit: event.target.value || null }))}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                                placeholder="Unit"
                              />
                            )
                          ) : (
                            <div className="text-sm text-slate-700">{row.col3Unit ?? "-"}</div>
                          )}

                          {hasDistance ? (
                            isEditing ? (
                              <input
                                value={row.distanceKm ?? ""}
                                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, distanceKm: event.target.value || null }))}
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
                                placeholder="KM"
                              />
                            ) : (
                              <div className="text-sm text-slate-700">{row.distanceKm ? `${row.distanceKm} KM` : "-"}</div>
                            )
                          ) : (
                            <div className="text-center text-xs text-slate-400">-</div>
                          )}

                          {values.map((value, monthIndex) => (
                            <input
                              key={`${row.id}-${monthIndex}`}
                              type="number"
                              inputMode="decimal"
                              step={integer ? "1" : "0.01"}
                              min="0"
                              disabled={isDisabled || row.valueMode === "computed"}
                              value={value ?? ""}
                              onChange={(event) => updateMonthValue(row, monthIndex, event.target.value)}
                              className={cn(
                                "w-full rounded-lg border px-2 py-2 text-right text-xs",
                                isDisabled || row.valueMode === "computed"
                                  ? "border-slate-200 bg-slate-100 text-slate-500"
                                  : "border-slate-300 bg-white text-slate-900",
                              )}
                              aria-label={`${row.label} ${MONTH_LABELS[monthIndex]}`}
                            />
                          ))}

                          <div className="rounded-full bg-slate-100 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {formatTotal(values, integer)}
                          </div>
                        </div>

                        <div className="space-y-3 xl:hidden">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(event) =>
                                  applyRowMetaUpdate(row.id, (current) => ({ ...current, enabled: event.target.checked }))
                                }
                              />
                              Active
                            </label>
                            <Button type="button" size="sm" variant={isEditing ? "default" : "secondary"} onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}>
                              {isEditing ? "Done" : "Edit"}
                            </Button>
                            {isCustom ? (
                              <Button type="button" size="sm" variant="ghost" onClick={() => removeCustomIndicator(row.id)}>
                                Remove
                              </Button>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Indicator</p>
                              <p className="text-sm text-slate-900">{row.label}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.col2Label ?? "Column 2"}</p>
                              <p className="text-sm text-slate-700">{row.col2Value ?? "-"}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</p>
                              <p className="text-sm text-slate-700">{row.col3Unit ?? "-"}</p>
                            </div>
                            {hasDistance ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance</p>
                                <p className="text-sm text-slate-700">{row.distanceKm ? `${row.distanceKm} KM` : "-"}</p>
                              </div>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                            {values.map((value, monthIndex) => (
                              <label key={`${row.id}-mobile-${monthIndex}`} className="space-y-1">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{MONTH_LABELS[monthIndex]}</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step={integer ? "1" : "0.01"}
                                  min="0"
                                  disabled={isDisabled || row.valueMode === "computed"}
                                  value={value ?? ""}
                                  onChange={(event) => updateMonthValue(row, monthIndex, event.target.value)}
                                  className={cn(
                                    "w-full rounded-lg border px-2 py-2 text-right text-sm",
                                    isDisabled || row.valueMode === "computed"
                                      ? "border-slate-200 bg-slate-100 text-slate-500"
                                      : "border-slate-300 bg-white text-slate-900",
                                  )}
                                />
                              </label>
                            ))}
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-3 grid gap-2 xl:grid-cols-2">
                            <textarea
                              value={row.col2Options.join("\n")}
                              onChange={(event) =>
                                applyRowMetaUpdate(row.id, (current) => ({
                                  ...current,
                                  col2Options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                                }))
                              }
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                              placeholder="Column 2 options, one per line"
                            />
                            <textarea
                              value={row.col3Options.join("\n")}
                              onChange={(event) =>
                                applyRowMetaUpdate(row.id, (current) => ({
                                  ...current,
                                  col3Options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                                }))
                              }
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                              placeholder="Column 3 options, one per line"
                            />
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}

