"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Save, Search, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calculateTonKmMonths } from "@/lib/services/monthly-input-calculations";
import {
  createMonthlyCustomRow,
  createMonthlyIndicatorConfig,
  getMonthlyInputSectionOrder,
  isMaterialsMonthlySection,
  isTransportMonthlySection,
  usesFixedMonthlyIndicatorOptions,
} from "@/lib/services/monthly-input-layout";
import type { CustomMonthlyRow, MonthlyIndicatorConfig } from "@/lib/services/monthly-input-layout";
import type { MonthlyInputRow } from "@/lib/services/monthly-inputs";

type MonthlyEntry = MonthlyInputRow;
type LegacyMetricKey = keyof Omit<MonthlyEntry, "month">;
type ViewMode = "month" | "year";

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
  return isTransportMonthlySection(row.section) || row.subsection === "Hazard waste" || row.subsection === "Non Hazardous waste";
}

function supportsTonKm(row: MonthlyIndicatorConfig) {
  return isTransportMonthlySection(row.section);
}

function getPrimaryFieldLabel(row: MonthlyIndicatorConfig) {
  if (isTransportMonthlySection(row.section)) return "Supplier name";
  if (isMaterialsMonthlySection(row.section)) return "Material name";
  return "Indicator name";
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
  const grouped = new Map<string, Map<string, MonthlyIndicatorConfig[]>>(
    getMonthlyInputSectionOrder().map((section) => [section, new Map<string, MonthlyIndicatorConfig[]>()]),
  );

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

function rowSearchText(row: MonthlyIndicatorConfig) {
  return [
    row.section,
    row.subsection,
    row.label,
    row.col2Label,
    row.col2Value,
    row.col3Unit,
    row.distanceKm,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function completionPercent(filled: number, total: number) {
  return total > 0 ? Math.round((filled / total) * 100) : 100;
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
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [activeMonthIndex, setActiveMonthIndex] = useState(() => new Date().getUTCMonth());
  const [activeSectionName, setActiveSectionName] = useState(initialIndicatorConfig[0]?.section ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const standardHours = useMemo(() => computeStandardHours(indicatorConfig, customRows), [indicatorConfig, customRows]);
  const sections = useMemo(() => sortRows(indicatorConfig), [indicatorConfig]);
  const supportedSections = useMemo(() => new Set<string>(getMonthlyInputSectionOrder()), []);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          groups: section.groups
            .map((group) => ({
              ...group,
              rows: group.rows.filter((row) => {
                if (!showInactive && !row.enabled) return false;
                if (!normalizedSearch) return true;
                return rowSearchText(row).includes(normalizedSearch);
              }),
            }))
            .filter((group) => group.rows.length > 0),
        }))
        .filter((section) => section.groups.length > 0 || (!normalizedSearch && supportedSections.has(section.section))),
    [normalizedSearch, sections, showInactive, supportedSections],
  );

  useEffect(() => {
    if (!visibleSections.length) return;
    if (!visibleSections.some((section) => section.section === activeSectionName)) {
      setActiveSectionName(visibleSections[0].section);
    }
  }, [activeSectionName, visibleSections]);

  const activeSection = visibleSections.find((section) => section.section === activeSectionName) ?? visibleSections[0] ?? null;

  function getRowValues(row: MonthlyIndicatorConfig) {
    if (row.id === "standard-hours") return standardHours;
    if (row.legacyKey) return getLegacyValues(months, row.legacyKey);
    return getCustomRow(customRows, row.id)?.months ?? emptyMonths();
  }

  function getTonKmValues(row: MonthlyIndicatorConfig) {
    if (!supportsTonKm(row)) return emptyMonths();
    return calculateTonKmMonths(getRowValues(row), row.col3Unit, row.distanceKm);
  }

  const editableRows = indicatorConfig.filter((row) => row.enabled && row.valueMode !== "computed");
  const annualTotalCells = editableRows.length * 12;
  const annualFilledCells = editableRows.reduce(
    (sum, row) => sum + getRowValues(row).filter((value) => value !== null).length,
    0,
  );
  const activeMonthEditableRows = editableRows.filter((row) => {
    if (!activeSection) return true;
    return row.section === activeSection.section;
  });
  const activeMonthFilledRows = activeMonthEditableRows.filter((row) => getRowValues(row)[activeMonthIndex] !== null).length;
  const activeMonthCompletion = completionPercent(activeMonthFilledRows, activeMonthEditableRows.length);
  const annualCompletion = completionPercent(annualFilledCells, annualTotalCells);
  const enabledCount = indicatorConfig.filter((row) => row.enabled).length;
  const currentStandardHours = standardHours[activeMonthIndex];

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
    const parsedValue = Number(rawValue);
    const value = rawValue.trim() === "" || !Number.isFinite(parsedValue) ? null : parsedValue;

    if (row.legacyKey) {
      setMonths((current) => setLegacyValue(current, monthIndex, row.legacyKey!, value));
      return;
    }

    setCustomRows((current) => updateCustomRowValue(current, row.id, monthIndex, value));
  }

  function addIndicator(section: string, subsection: string | null) {
    const id = `custom-${slugify(section)}-${slugify(subsection ?? "row")}-${crypto.randomUUID()}`;
    const newConfig = createMonthlyIndicatorConfig(section, subsection, id);
    const newRow = createMonthlyCustomRow(section, subsection, id);

    setIndicatorConfig((current) => [...current, newConfig]);
    setCustomRows((current) => [...current, newRow]);
    setEditingRowId(id);
    setActiveSectionName(section);
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
      setMessage(`Loaded ${json.data.year}.`);
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

  function changeYear(delta: number) {
    const nextYear = year + delta;
    setYear(nextYear);
    void loadYear(nextYear);
  }

  function renderRowEditor(row: MonthlyIndicatorConfig) {
    const hasDistance = showsDistance(row);
    const isMaterialRow = isMaterialsMonthlySection(row.section);
    const hasFixedOptions = usesFixedMonthlyIndicatorOptions(row.section);

    return (
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{getPrimaryFieldLabel(row)}</span>
          <input
            value={row.label}
            onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>

        {!isMaterialRow ? (
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.col2Label ?? "Column 2"}</span>
            {row.col2Options.length > 0 ? (
              <select
                value={row.col2Value ?? ""}
                onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col2Value: event.target.value || null }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder={row.col2Label ?? "Column 2"}
              />
            )}
          </label>
        ) : null}

        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</span>
          {row.col3Options.length > 0 ? (
            <select
              value={row.col3Unit ?? ""}
              onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, col3Unit: event.target.value || null }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Unit"
            />
          )}
        </label>

        {hasDistance ? (
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance KM</span>
            <input
              value={row.distanceKm ?? ""}
              onChange={(event) => applyRowMetaUpdate(row.id, (current) => ({ ...current, distanceKm: event.target.value || null }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="KM"
            />
          </label>
        ) : null}

        {!hasFixedOptions ? (
          <>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Column 2 options</span>
              <textarea
                value={row.col2Options.join("\n")}
                onChange={(event) =>
                  applyRowMetaUpdate(row.id, (current) => ({
                    ...current,
                    col2Options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                  }))
                }
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="One option per line"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unit options</span>
              <textarea
                value={row.col3Options.join("\n")}
                onChange={(event) =>
                  applyRowMetaUpdate(row.id, (current) => ({
                    ...current,
                    col3Options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                  }))
                }
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="One option per line"
              />
            </label>
          </>
        ) : null}
      </div>
    );
  }

  function renderMonthFocus() {
    if (!activeSection) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No indicators found for the selected filters.
        </div>
      );
    }

    if (activeSection.groups.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-900">No indicators configured in {activeSection.section}.</p>
          <p className="mt-1 text-sm text-slate-500">Create the first indicator to start entering monthly values.</p>
          <Button type="button" className="mt-4" onClick={() => addIndicator(activeSection.section, null)}>
            Add indicator
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Focused entry</p>
              <h3 className="text-xl font-bold text-slate-900">
                {MONTH_LABELS[activeMonthIndex]} {year} - {activeSection.section}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setActiveMonthIndex((current) => (current + 11) % 12)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous month
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setActiveMonthIndex((current) => (current + 1) % 12)}
              >
                Next month
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {activeSection.groups.map((group) => (
          <section key={`${activeSection.section}-${group.subsection ?? "root"}`} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group.subsection ?? activeSection.section}
              </h4>
              <Button type="button" size="sm" variant="secondary" onClick={() => addIndicator(activeSection.section, group.subsection)}>
                Add indicator
              </Button>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {group.rows.map((row) => {
                const values = getRowValues(row);
                const tonKmValues = getTonKmValues(row);
                const integer = isIntegerLegacyKey(row.legacyKey);
                const isEditing = editingRowId === row.id;
                const isCustom = row.legacyKey === null;
                const isDisabled = !row.enabled;
                const filledMonths = values.filter((value) => value !== null).length;
                const currentValue = values[activeMonthIndex];
                const currentTonKm = tonKmValues[activeMonthIndex];

                return (
                  <article
                    key={row.id}
                    className={cn(
                      "rounded-2xl border bg-white p-4 shadow-sm transition",
                      isDisabled ? "border-slate-200 opacity-70" : "border-slate-200 hover:border-teal-200",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-base font-semibold text-slate-900">{row.label}</h5>
                          {row.valueMode === "computed" ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                              Auto
                            </span>
                          ) : null}
                          {!row.enabled ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                          {row.col2Value ? <span className="rounded-full bg-slate-100 px-2 py-1">{row.col2Value}</span> : null}
                          {row.col3Unit ? <span className="rounded-full bg-slate-100 px-2 py-1">{row.col3Unit}</span> : null}
                          {row.distanceKm ? <span className="rounded-full bg-slate-100 px-2 py-1">{row.distanceKm} KM</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
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
                    </div>

                    <div
                      className={cn(
                        "mt-4 grid gap-3 sm:items-end",
                        supportsTonKm(row)
                          ? "sm:grid-cols-[minmax(0,1fr)_160px_180px]"
                          : "sm:grid-cols-[minmax(0,1fr)_160px]",
                      )}
                    >
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {MONTH_LABELS[activeMonthIndex]} value
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={integer ? "1" : "0.01"}
                          min="0"
                          disabled={isDisabled || row.valueMode === "computed"}
                          value={currentValue ?? ""}
                          onChange={(event) => updateMonthValue(row, activeMonthIndex, event.target.value)}
                          className={cn(
                            "h-12 w-full rounded-xl border px-3 py-2 text-right text-lg font-semibold",
                            isDisabled || row.valueMode === "computed"
                              ? "border-slate-200 bg-slate-100 text-slate-500"
                              : "border-slate-300 bg-white text-slate-900 focus:border-teal-400",
                          )}
                        />
                      </label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Year total</p>
                        <p className="text-lg font-bold text-slate-900">{formatTotal(values, integer)}</p>
                      </div>
                      {supportsTonKm(row) ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Ton/km</p>
                          <p className="text-lg font-bold text-amber-950">{currentTonKm?.toFixed(2) ?? "-"}</p>
                          <p className="text-[11px] text-amber-700">Auto calculated for {MONTH_LABELS[activeMonthIndex]}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span>Filled months</span>
                        <span>{filledMonths}/12</span>
                      </div>
                      <div className="mt-1 grid grid-cols-12 gap-1">
                        {values.map((value, index) => (
                          <button
                            key={`${row.id}-month-jump-${index}`}
                            type="button"
                            title={MONTH_LABELS[index]}
                            className={cn(
                              "h-2 rounded-full",
                              index === activeMonthIndex ? "bg-teal-600" : value === null ? "bg-slate-200" : "bg-emerald-400",
                            )}
                            onClick={() => setActiveMonthIndex(index)}
                          />
                        ))}
                      </div>
                    </div>

                    {isEditing ? <div className="mt-4">{renderRowEditor(row)}</div> : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function renderAnnualTable() {
    return (
      <div className="space-y-6">
        {visibleSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            No indicators found for the selected filters.
          </div>
        ) : null}

        {visibleSections.map((section) => (
          <section key={section.section} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{section.section}</h3>
              </div>
              {section.groups.length <= 1 && (!section.groups[0] || !section.groups[0].subsection) ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => addIndicator(section.section, null)}>
                  Add indicator
                </Button>
              ) : null}
            </div>

            {section.groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No indicators configured in this section yet.
              </div>
            ) : null}

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
                    const tonKmValues = getTonKmValues(row);
                    const integer = isIntegerLegacyKey(row.legacyKey);
                    const isEditing = editingRowId === row.id;
                    const isCustom = row.legacyKey === null;
                    const isDisabled = !row.enabled;
                    const hasDistance = showsDistance(row);
                    const showTonKm = supportsTonKm(row);
                    const showSecondaryField = !isMaterialsMonthlySection(row.section);

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
                            <div key={`${row.id}-${monthIndex}`} className="space-y-1">
                              <input
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
                              {showTonKm ? (
                                <div className="rounded-md bg-amber-50 px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                  TKM {tonKmValues[monthIndex]?.toFixed(2) ?? "-"}
                                </div>
                              ) : null}
                            </div>
                          ))}

                          <div className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                            <div>{formatTotal(values, integer)}</div>
                            {showTonKm ? <div className="mt-1 text-[10px] text-amber-700">TKM {formatTotal(tonKmValues)}</div> : null}
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
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{getPrimaryFieldLabel(row)}</p>
                              <p className="text-sm text-slate-900">{row.label}</p>
                            </div>
                            {showSecondaryField ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.col2Label ?? "Column 2"}</p>
                                <p className="text-sm text-slate-700">{row.col2Value ?? "-"}</p>
                              </div>
                            ) : null}
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
                                {showTonKm ? (
                                  <span className="block text-right text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                    TKM {tonKmValues[monthIndex]?.toFixed(2) ?? "-"}
                                  </span>
                                ) : null}
                              </label>
                            ))}
                          </div>
                        </div>

                        {isEditing ? <div className="mt-3">{renderRowEditor(row)}</div> : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#0f766e_0%,#0f172a_58%,#f59e0b_100%)] p-5 text-white">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                <CalendarDays className="h-4 w-4" />
                Monthly Plant Inputs
              </div>
              <h2 className="mt-3 text-2xl font-black">Fill one month at a time, review the full year when needed.</h2>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="secondary" onClick={() => changeYear(-1)} disabled={loading}>
                <ChevronLeft className="h-4 w-4" />
                {year - 1}
              </Button>
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-white/75">Year</span>
                <input
                  type="number"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="h-10 w-28 rounded-xl border border-white/30 bg-white px-3 py-2 text-sm text-slate-900"
                  min={2000}
                  max={2100}
                />
              </label>
              <Button type="button" variant="secondary" onClick={() => loadYear(year)} disabled={loading}>
                {loading ? "Loading..." : "Load"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => changeYear(1)} disabled={loading}>
                {year + 1}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Month completion</p>
            <p className="mt-1 text-3xl font-black text-emerald-950">{activeMonthCompletion}%</p>
            <p className="text-xs text-emerald-700">
              {activeMonthFilledRows}/{activeMonthEditableRows.length} fields in {MONTH_LABELS[activeMonthIndex]}
            </p>
          </article>
          <article className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Year completion</p>
            <p className="mt-1 text-3xl font-black text-sky-950">{annualCompletion}%</p>
            <p className="text-xs text-sky-700">{annualFilledCells}/{annualTotalCells} annual fields</p>
          </article>
          <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Active indicators</p>
            <p className="mt-1 text-3xl font-black text-amber-950">{enabledCount}</p>
            <p className="text-xs text-amber-700">of {indicatorConfig.length} configured</p>
          </article>
          <article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Standard hours</p>
            <p className="mt-1 text-3xl font-black text-indigo-950">{currentStandardHours?.toFixed(2) ?? "-"}</p>
            <p className="text-xs text-indigo-700">{MONTH_LABELS[activeMonthIndex]} calculated value</p>
          </article>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MONTH_LABELS.map((month, index) => {
                const filled = editableRows.filter((row) => getRowValues(row)[index] !== null).length;
                const percent = completionPercent(filled, editableRows.length);
                return (
                  <button
                    key={month}
                    type="button"
                    className={cn(
                      "min-w-16 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      activeMonthIndex === index
                        ? "border-teal-400 bg-teal-100 text-teal-950"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-200",
                    )}
                    onClick={() => setActiveMonthIndex(index)}
                  >
                    <span className="block">{month}</span>
                    <span className="text-[11px] font-medium text-slate-500">{percent}%</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleSections.map((section) => (
                <button
                  key={section.section}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    activeSection?.section === section.section
                      ? "border-teal-300 bg-teal-100 text-teal-900"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100",
                  )}
                  onClick={() => setActiveSectionName(section.section)}
                >
                  {section.section}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto] xl:min-w-[520px]">
            <label className="relative">
              <span className="sr-only">Search indicators</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search indicator, code, unit..."
                className="h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
              />
            </label>
            <label className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Show inactive
            </label>
            <div className="inline-flex rounded-xl border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium",
                  viewMode === "month" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
                )}
                onClick={() => setViewMode("month")}
              >
                <LayoutGrid className="h-4 w-4" />
                Month
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium",
                  viewMode === "year" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
                )}
                onClick={() => setViewMode("year")}
              >
                <TableProperties className="h-4 w-4" />
                Year
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === "month" ? renderMonthFocus() : renderAnnualTable()}

      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(15,23,42,0.16)] backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-700">
          {message ? <span>{message}</span> : <span>{annualCompletion}% complete for {year}.</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setViewMode(viewMode === "month" ? "year" : "month")}>
            {viewMode === "month" ? "Review full year" : "Return to month focus"}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save monthly inputs"}
          </Button>
        </div>
      </div>
    </section>
  );
}
