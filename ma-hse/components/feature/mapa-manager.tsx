"use client";

import { MapFeatureType, MapSourceFileType } from "@prisma/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SourceDocument = {
  id: string;
  title: string;
  fileName: string;
  fileType: MapSourceFileType;
  selectedLayerNames: string[];
  downloadUrl: string;
};

type LayerRow = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sourceType: string;
  isVisibleDefault: boolean;
};

type FeatureRow = {
  id: string;
  layerId: string | null;
  featureType: MapFeatureType;
  label: string;
  icon: string | null;
  color: string | null;
  positionX: number;
  positionY: number;
  locked?: boolean;
};

type AutoIncidentFeature = {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  color: string;
};

type Option = {
  id: string;
  name: string;
};

const AUTO_INCIDENT_LAYER_ID = "auto-incidents";

export function MapaManager({
  plant,
  sourceDocuments,
  layers,
  features,
  autoIncidentFeatures,
  areas,
  workstations,
}: {
  plant: string;
  sourceDocuments: SourceDocument[];
  layers: LayerRow[];
  features: FeatureRow[];
  autoIncidentFeatures: AutoIncidentFeature[];
  areas: Option[];
  workstations: Option[];
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [dwgLayerText, setDwgLayerText] = useState("");
  const [selectedDwgLayers, setSelectedDwgLayers] = useState<string[]>([]);
  const [layerName, setLayerName] = useState("");
  const [layerColor, setLayerColor] = useState("#dc2626");
  const [layerIcon, setLayerIcon] = useState("●");
  const [placementLayerId, setPlacementLayerId] = useState(layers[0]?.id ?? "");
  const [featureType, setFeatureType] = useState<MapFeatureType>(MapFeatureType.ICON);
  const [featureLabel, setFeatureLabel] = useState("");
  const [featureIcon, setFeatureIcon] = useState("●");
  const [featureColor, setFeatureColor] = useState("#0f766e");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedWorkstationId, setSelectedWorkstationId] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);
  const [featureRows, setFeatureRows] = useState(features);
  const [visibleLayerIds, setVisibleLayerIds] = useState<string[]>(
    [
      ...layers.filter((layer) => layer.isVisibleDefault).map((layer) => layer.id),
      ...(autoIncidentFeatures.length ? [AUTO_INCIDENT_LAYER_ID] : []),
    ],
  );
  const [draggingFeatureId, setDraggingFeatureId] = useState<string | null>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!draggingFeatureId || !boardRef.current) return;
      const rect = boardRef.current.getBoundingClientRect();
      const positionX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
      const positionY = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
      setFeatureRows((current) =>
        current.map((feature) =>
          feature.id === draggingFeatureId ? { ...feature, positionX, positionY } : feature,
        ),
      );
    }

    async function handleMouseUp() {
      if (!draggingFeatureId) return;
      const moved = featureRows.find((feature) => feature.id === draggingFeatureId);
      setDraggingFeatureId(null);
      if (!moved) return;
      await fetch(`/api/plants/${plant}/mapa/features/${moved.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ positionX: moved.positionX, positionY: moved.positionY }),
      });
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingFeatureId, featureRows, plant]);

  const activeDocument = sourceDocuments[0] ?? null;
  const parsedDwgLayers = dwgLayerText
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const layerLookup = useMemo(
    () =>
      Object.fromEntries(
        layers.map((layer) => [layer.id, layer]),
      ),
    [layers],
  );

  const renderedFeatures = featureRows.filter(
    (feature) => feature.layerId && visibleLayerIds.includes(feature.layerId),
  );

  async function uploadPlantFile(event: React.FormEvent) {
    event.preventDefault();
    if (!documentFile) {
      setMessage("Choose a file before uploading.");
      return;
    }

    const extension = documentFile.name.includes(".") ? documentFile.name.split(".").pop()?.toLowerCase() : "";
    const fileType =
      extension === "pdf"
        ? MapSourceFileType.PDF
        : extension === "dwg"
          ? MapSourceFileType.DWG
          : ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension ?? "")
            ? MapSourceFileType.IMAGE
            : MapSourceFileType.OTHER;

    const presignResponse = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plantCode: plant,
        fileName: documentFile.name,
        contentType: documentFile.type || "application/octet-stream",
        folder: "maps",
      }),
    });
    const presignJson = await presignResponse.json();
    if (!presignResponse.ok || !presignJson.ok) {
      setMessage(presignJson.message ?? "Failed to prepare upload.");
      return;
    }

    const putResponse = await fetch(presignJson.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": documentFile.type || "application/octet-stream" },
      body: documentFile,
    });
    if (!putResponse.ok) {
      setMessage("Failed to upload source file.");
      return;
    }

    const response = await fetch(`/api/plants/${plant}/mapa/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: documentTitle || documentFile.name,
        fileKey: presignJson.data.key,
        fileName: documentFile.name,
        contentType: documentFile.type || "application/octet-stream",
        fileType,
        importedLayerNames: parsedDwgLayers,
        selectedLayerNames: fileType === MapSourceFileType.DWG ? selectedDwgLayers : [],
      }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Plant source uploaded." : json.message ?? "Failed to save file metadata.");
    if (json.ok) {
      window.location.reload();
    }
  }

  async function createLayer(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/plants/${plant}/mapa/layers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: layerName,
        color: layerColor,
        icon: layerIcon || undefined,
        sourceType: "MANUAL",
        isVisibleDefault: true,
        sortOrder: layers.length + 1,
      }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Layer created." : json.message ?? "Failed to create layer.");
    if (json.ok) {
      window.location.reload();
    }
  }

  function toggleLayer(layerId: string) {
    setVisibleLayerIds((current) =>
      current.includes(layerId) ? current.filter((entry) => entry !== layerId) : [...current, layerId],
    );
  }

  async function placeFeatureAt(positionX: number, positionY: number) {
    const areaName = areas.find((area) => area.id === selectedAreaId)?.name ?? "";
    const workstationName = workstations.find((workstation) => workstation.id === selectedWorkstationId)?.name ?? "";
    const computedLabel =
      featureLabel ||
      (featureType === MapFeatureType.AREA ? areaName : featureType === MapFeatureType.WORKSTATION ? workstationName : "");

    const response = await fetch(`/api/plants/${plant}/mapa/features`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        layerId: placementLayerId || null,
        featureType,
        label: computedLabel || "Map marker",
        icon: featureType === MapFeatureType.ICON ? featureIcon : undefined,
        color: featureColor,
        positionX,
        positionY,
        areaId: featureType === MapFeatureType.AREA ? selectedAreaId || null : null,
        workstationId: featureType === MapFeatureType.WORKSTATION ? selectedWorkstationId || null : null,
      }),
    });
    const json = await response.json();
    setMessage(json.ok ? "Marker placed on the map." : json.message ?? "Failed to create marker.");
    if (json.ok) {
      window.location.reload();
    }
  }

  async function deleteFeature(featureId: string) {
    const response = await fetch(`/api/plants/${plant}/mapa/features/${featureId}`, {
      method: "DELETE",
    });
    const json = await response.json();
    setMessage(json.ok ? "Marker removed." : json.message ?? "Failed to remove marker.");
    if (json.ok) {
      setFeatureRows((current) => current.filter((feature) => feature.id !== featureId));
    }
  }

  function handleBoardClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isPlacing || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const positionX = ((event.clientX - rect.left) / rect.width) * 100;
    const positionY = ((event.clientY - rect.top) / rect.height) * 100;
    setIsPlacing(false);
    void placeFeatureAt(positionX, positionY);
  }

  function applyLayerPreset(preset: string) {
    if (preset === "fire") {
      setLayerName("Segurança contra incêndio");
      setLayerColor("#dc2626");
      setLayerIcon("🔥");
      return;
    }
    if (preset === "emergency") {
      setLayerName("Iluminação emergência");
      setLayerColor("#f59e0b");
      setLayerIcon("💡");
      return;
    }
    if (preset === "risks") {
      setLayerName("Riscos postos de trabalho");
      setLayerColor("#7c3aed");
      setLayerIcon("⚠");
      return;
    }
    if (preset === "incidents") {
      setLayerName("Incidentes");
      setLayerColor("#0f766e");
      setLayerIcon("!");
      return;
    }
    setLayerName("");
    setLayerColor("#0f766e");
    setLayerIcon("●");
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <form onSubmit={uploadPlantFile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Source file</h2>
            <div className="mt-4 space-y-3">
              <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Factory plan title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input
                type="file"
                accept=".pdf,.dwg,.png,.jpg,.jpeg,.webp,.svg"
                onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              {documentFile?.name.toLowerCase().endsWith(".dwg") ? (
                <>
                  <textarea
                    value={dwgLayerText}
                    onChange={(event) => {
                      const nextText = event.target.value;
                      setDwgLayerText(nextText);
                      const nextLayers = nextText.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
                      setSelectedDwgLayers(nextLayers);
                    }}
                    rows={5}
                    placeholder="One DWG layer name per line"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Imported layers</p>
                    <div className="mt-2 space-y-2">
                      {parsedDwgLayers.map((layer) => (
                        <label key={layer} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedDwgLayers.includes(layer)}
                            onChange={(event) =>
                              setSelectedDwgLayers((current) =>
                                event.target.checked ? [...current, layer] : current.filter((entry) => entry !== layer),
                              )
                            }
                          />
                          {layer}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
              <Button type="submit" size="sm">Upload plant</Button>
            </div>
          </form>

          <form onSubmit={createLayer} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Create layer</h2>
            <div className="mt-4 space-y-3">
              <select onChange={(event) => applyLayerPreset(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Custom</option>
                <option value="fire">Segurança contra incêndio</option>
                <option value="emergency">Iluminação emergência</option>
                <option value="risks">Riscos postos de trabalho</option>
                <option value="incidents">Incidentes</option>
              </select>
              <input value={layerName} onChange={(event) => setLayerName(event.target.value)} placeholder="Layer name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
              <div className="grid gap-3 md:grid-cols-[1fr_90px_90px]">
                <input value={layerColor} onChange={(event) => setLayerColor(event.target.value)} type="color" className="h-10 w-full rounded-md border border-slate-300 p-1" />
                <input value={layerIcon} onChange={(event) => setLayerIcon(event.target.value)} maxLength={4} placeholder="Icon" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <Button type="submit" size="sm">Save</Button>
              </div>
            </div>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Visible layers</h2>
            <div className="mt-4 space-y-2">
              {layers.map((layer) => (
                <label key={layer.id} className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={visibleLayerIds.includes(layer.id)} onChange={() => toggleLayer(layer.id)} />
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: layer.color }} />
                  <span>{layer.name}</span>
                  <span className="text-xs uppercase text-slate-400">{layer.sourceType}</span>
                </label>
              ))}
              {autoIncidentFeatures.length ? (
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" checked={visibleLayerIds.includes(AUTO_INCIDENT_LAYER_ID)} onChange={() => toggleLayer(AUTO_INCIDENT_LAYER_ID)} />
                  <span className="inline-block h-3 w-3 rounded-full bg-rose-500" />
                  <span>Incidentes por local e tipo</span>
                  <span className="text-xs uppercase text-slate-400">AUTO</span>
                </label>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Factory preview</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {activeDocument ? `${activeDocument.title} (${activeDocument.fileName})` : "No source file uploaded yet."}
                </p>
              </div>
              {activeDocument ? (
                <a href={activeDocument.downloadUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-700 hover:underline">
                  Open source file
                </a>
              ) : null}
            </div>
            {activeDocument?.fileType === MapSourceFileType.PDF ? (
              <iframe src={activeDocument.downloadUrl} title={activeDocument.title} className="mt-4 h-[420px] w-full rounded-xl border border-slate-200" />
            ) : null}
            {activeDocument?.fileType === MapSourceFileType.IMAGE ? (
              <div
                className="mt-4 h-[420px] w-full rounded-xl border border-slate-200 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${activeDocument.downloadUrl}")` }}
                aria-label={activeDocument.title}
                role="img"
              />
            ) : null}
            {activeDocument?.fileType === MapSourceFileType.DWG ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="text-sm text-slate-700">DWG source uploaded. Imported layers:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeDocument.selectedLayerNames.map((layer) => (
                    <span key={layer} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{layer}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_300px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Interactive map board</h2>
                  </div>
                <Button size="sm" type="button" onClick={() => setIsPlacing(true)}>
                  {isPlacing ? "Click on the board..." : "Place marker"}
                </Button>
              </div>

              <div
                ref={boardRef}
                onClick={handleBoardClick}
                className={`relative mt-4 h-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:40px_40px] ${isPlacing ? "cursor-crosshair" : ""}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.08),transparent_35%)]" />

                {renderedFeatures.map((feature) => {
                  const layer = feature.layerId ? layerLookup[feature.layerId] : null;
                  const markerColor = feature.color ?? layer?.color ?? "#0f766e";
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        setDraggingFeatureId(feature.id);
                      }}
                      title={feature.label}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2 py-1 text-xs font-semibold text-white shadow-lg"
                      style={{
                        left: `${feature.positionX}%`,
                        top: `${feature.positionY}%`,
                        backgroundColor: markerColor,
                      }}
                    >
                      {feature.icon ?? layer?.icon ?? (feature.featureType === MapFeatureType.AREA ? "A" : feature.featureType === MapFeatureType.WORKSTATION ? "W" : "●")} {feature.label}
                    </button>
                  );
                })}

                {visibleLayerIds.includes(AUTO_INCIDENT_LAYER_ID)
                  ? autoIncidentFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-2 py-1 text-xs font-semibold text-white shadow-lg"
                        style={{
                          left: `${feature.positionX}%`,
                          top: `${feature.positionY}%`,
                          backgroundColor: feature.color,
                        }}
                        title={feature.label}
                      >
                        ! {feature.label}
                      </div>
                    ))
                  : null}
              </div>
            </div>

            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New marker</h2>
                <div className="mt-4 space-y-3">
                  <select value={placementLayerId} onChange={(event) => setPlacementLayerId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Without layer</option>
                    {layers.map((layer) => (
                      <option key={layer.id} value={layer.id}>{layer.name}</option>
                    ))}
                  </select>
                  <select value={featureType} onChange={(event) => setFeatureType(event.target.value as MapFeatureType)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value={MapFeatureType.ICON}>Icon</option>
                    <option value={MapFeatureType.AREA}>Area</option>
                    <option value={MapFeatureType.WORKSTATION}>Workstation</option>
                  </select>
                  {featureType === MapFeatureType.AREA ? (
                    <select value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Choose area</option>
                      {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                  ) : null}
                  {featureType === MapFeatureType.WORKSTATION ? (
                    <select value={selectedWorkstationId} onChange={(event) => setSelectedWorkstationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Choose workstation</option>
                      {workstations.map((workstation) => <option key={workstation.id} value={workstation.id}>{workstation.name}</option>)}
                    </select>
                  ) : null}
                  <input value={featureLabel} onChange={(event) => setFeatureLabel(event.target.value)} placeholder="Marker label" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={featureColor} onChange={(event) => setFeatureColor(event.target.value)} type="color" className="h-10 w-full rounded-md border border-slate-300 p-1" />
                    <input value={featureIcon} onChange={(event) => setFeatureIcon(event.target.value)} maxLength={4} placeholder="Icon" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <p className="text-xs text-slate-500">Use “Place marker” and then click on the board. Existing markers can be dragged.</p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Markers</h2>
                <div className="mt-4 space-y-2">
                  {featureRows.map((feature) => (
                    <div key={feature.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                        <p className="text-xs text-slate-500">{feature.featureType} | {feature.positionX.toFixed(1)}%, {feature.positionY.toFixed(1)}%</p>
                      </div>
                      <Button size="sm" variant="ghost" type="button" onClick={() => deleteFeature(feature.id)}>
                        Delete
                      </Button>
                    </div>
                  ))}
                  {!featureRows.length ? <p className="text-sm text-slate-500">No markers created yet.</p> : null}
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
