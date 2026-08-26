"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { requireApiResponse } from "@/lib/client-api";
import { TAG_CODE_ALPHABET, TAG_CODE_LENGTH } from "@/lib/fire-equipment-tag-code";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type NdefRecord = { recordType?: string; mediaType?: string; data?: ArrayBuffer; encoding?: string };
type NdefReadingEvent = { serialNumber?: string; message: { records: NdefRecord[] } };
type NdefReaderInstance = {
  write(message: { records: Array<{ recordType: "url"; data: string }> }): Promise<void>;
  scan(): Promise<void>;
  onreading: ((event: NdefReadingEvent) => void) | null;
};
type NdefReaderConstructor = new () => NdefReaderInstance;

function getNdefReaderConstructor(): NdefReaderConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { NDEFReader?: NdefReaderConstructor }).NDEFReader ?? null;
}

// §5.1 rule 5: the client mints the code (Web Crypto, browser-safe) so it
// can be embedded in the URL BEFORE the physical write — the server never
// generates a different one than what actually got written to the chip.
function randomTagCode(): string {
  const bytes = new Uint32Array(TAG_CODE_LENGTH);
  window.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < TAG_CODE_LENGTH; i += 1) {
    code += TAG_CODE_ALPHABET[bytes[i] % TAG_CODE_ALPHABET.length];
  }
  return code;
}

export type FireEquipmentTagWire = {
  id: string;
  tagUid: string | null;
  tagCode: string | null;
  tagType: "NFC_AND_QR" | "QR_ONLY";
  chipType: string | null;
  bindingMode: "FULL" | "UID_ONLY" | "CODE_ONLY";
  assignedAt: string;
  writtenAt: string | null;
  url: string | null;
};

export type FireEquipmentOption = { id: string; internalCode: string; fireEquipmentTypeName: string };

type BindProps = {
  mode: "bind";
  plant: string;
  labels: FireEquipmentUiDictionary;
  fireEquipmentId: string;
  fireEquipmentInternalCode: string;
  onBound: (tag: FireEquipmentTagWire) => void;
};
type DiscoverProps = {
  mode: "discover";
  plant: string;
  labels: FireEquipmentUiDictionary;
  equipmentOptions: FireEquipmentOption[];
};
type Props = BindProps | DiscoverProps;

type ScanPhase =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "picking"; tagUid: string }
  | { phase: "conflict"; tagUid: string; equipmentId: string; equipmentInternalCode: string }
  | { phase: "binding" }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

async function lookupUid(plant: string, tagUid: string) {
  const response = await fetch(`/api/plants/${plant}/fire-equipment/tag-lookup?tagUid=${encodeURIComponent(tagUid)}`);
  const envelope = await requireApiResponse<{ equipment: { fireEquipmentId: string; internalCode: string } | null }>(
    response,
    "Failed to look up the tag",
  );
  return envelope.data?.equipment ?? null;
}

/**
 * §5.1/§5.3: reads a chip via Web NFC and either binds it straight to a
 * known equipment ("bind" mode — profile page, enrolment list) or resolves
 * an unknown physical tag found in the field to whichever equipment it
 * belongs to, prompting for one if it isn't bound yet ("discover" mode —
 * the list page's general "Ler ficha" entry point). Both share the same
 * scan → lookup → (conflict?) → write → persist sequence; only what happens
 * on an unresolved uid differs (bind: proceed with the known target;
 * discover: ask which equipment).
 *
 * Renders nothing outside Chrome/Android — Web NFC doesn't exist on iOS in
 * any browser, and there's no polyfill for that (§5's own note). The normal
 * iPhone path is tapping the tag outside this app entirely; the OS resolves
 * the URL already written on it straight to /scie/[tagCode].
 */
export function FireEquipmentTagScanButton(props: Props) {
  const { plant, labels } = props;
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ScanPhase>({ phase: "idle" });
  const [chipType, setChipType] = useState("");
  const [pickedEquipmentId, setPickedEquipmentId] = useState("");

  useEffect(() => {
    setSupported(Boolean(getNdefReaderConstructor()));
  }, []);

  if (!supported) return null;

  async function bindTo(targetEquipmentId: string, tagUid: string, transferFromEquipmentId?: string) {
    setState({ phase: "binding" });
    const tagCode = randomTagCode();
    const url = `${window.location.origin}/scie/${tagCode}`;
    let writeSucceeded = true;
    try {
      const NDEFReader = getNdefReaderConstructor();
      const reader = NDEFReader ? new NDEFReader() : null;
      if (reader) {
        await reader.write({ records: [{ recordType: "url", data: url }] });
      } else {
        writeSucceeded = false;
      }
    } catch {
      writeSucceeded = false;
    }

    try {
      const response = await fetch(`/api/plants/${plant}/fire-equipment/${targetEquipmentId}/tag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagUid, tagCode, chipType: chipType.trim() || null, writeSucceeded, transferFromEquipmentId }),
      });
      const envelope = await requireApiResponse<FireEquipmentTagWire>(response, labels.tagBindError);
      const tag = envelope.data as FireEquipmentTagWire;
      if (props.mode === "bind") {
        setState({ phase: "done", message: writeSucceeded ? labels.tagBindSuccess : labels.tagBindSuccessNoWrite });
        props.onBound(tag);
      } else {
        window.location.href = `/app/${plant}/fire-equipment/${targetEquipmentId}?fromTag=1`;
      }
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : labels.tagBindError });
    }
  }

  async function handleReading(event: NdefReadingEvent) {
    const tagUid = event.serialNumber;
    if (!tagUid) {
      setState({ phase: "error", message: labels.tagReadNoUid });
      return;
    }

    try {
      const resolved = await lookupUid(plant, tagUid);

      if (props.mode === "bind") {
        if (resolved && resolved.fireEquipmentId !== props.fireEquipmentId) {
          setState({ phase: "conflict", tagUid, equipmentId: resolved.fireEquipmentId, equipmentInternalCode: resolved.internalCode });
          return;
        }
        void bindTo(props.fireEquipmentId, tagUid);
        return;
      }

      if (resolved) {
        window.location.href = `/app/${plant}/fire-equipment/${resolved.fireEquipmentId}?fromTag=1`;
        return;
      }
      setState({ phase: "picking", tagUid });
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : labels.tagLookupError });
    }
  }

  async function startScan() {
    const NDEFReader = getNdefReaderConstructor();
    if (!NDEFReader) return;
    setState({ phase: "scanning" });
    try {
      const reader = new NDEFReader();
      reader.onreading = (event) => void handleReading(event);
      await reader.scan();
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : labels.tagReadError });
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      {props.mode === "bind" ? (
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-600">{labels.tagChipTypeLabel}</span>
          <input
            type="text"
            value={chipType}
            onChange={(event) => setChipType(event.target.value)}
            placeholder={labels.tagChipTypePlaceholder}
            className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
      ) : null}

      {state.phase === "idle" || state.phase === "done" || state.phase === "error" ? (
        <Button type="button" variant="ghost" onClick={() => void startScan()}>
          {labels.tagReadButton}
        </Button>
      ) : null}

      {state.phase === "scanning" ? <p className="text-xs text-slate-500">{labels.tagReadWaiting}</p> : null}
      {state.phase === "binding" ? <p className="text-xs text-slate-500">{labels.tagBinding}</p> : null}
      {state.phase === "done" ? <p className="text-xs text-emerald-700">{state.message}</p> : null}
      {state.phase === "error" ? <p className="text-xs text-rose-600">{state.message}</p> : null}

      {state.phase === "conflict" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-semibold text-amber-900">{labels.tagConflictTitle.replace("{code}", state.equipmentInternalCode)}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                if (props.mode === "bind") void bindTo(props.fireEquipmentId, state.tagUid, state.equipmentId);
              }}
            >
              {labels.tagConflictTransfer}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setState({ phase: "idle" })}>
              {labels.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === "picking" && props.mode === "discover" ? (
        <div className="rounded-md border border-slate-300 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-700">{labels.tagPickEquipmentTitle}</p>
          <select
            value={pickedEquipmentId}
            onChange={(event) => setPickedEquipmentId(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">{labels.tagPickEquipmentPlaceholder}</option>
            {props.equipmentOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.internalCode} — {option.fireEquipmentTypeName}</option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={!pickedEquipmentId} onClick={() => void bindTo(pickedEquipmentId, state.tagUid)}>
              {labels.tagAssign}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setState({ phase: "idle" })}>
              {labels.cancel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
