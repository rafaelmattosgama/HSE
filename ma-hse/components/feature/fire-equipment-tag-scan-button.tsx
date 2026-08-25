"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type NdefRecord = { recordType?: string; mediaType?: string; data?: ArrayBuffer; encoding?: string };
type NdefReadingEvent = { message: { records: NdefRecord[] } };
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

/**
 * §5.3/§5.5: both modes are conditional to Web NFC support
 * (`'NDEFReader' in window` — Chrome/Android only; absent on iOS and on
 * Android outside Chrome). Outside that, the button renders nothing — the
 * normal path is tapping the physical tag, which the OS opens in the
 * browser at /scie/[tagCode] on its own, no in-app button involved.
 */
export function FireEquipmentTagScanButton({
  mode,
  url,
  labels,
}: {
  mode: "write" | "read";
  /** Required for mode="write" — the current active tag's URL to encode onto a blank tag. */
  url?: string;
  labels: FireEquipmentUiDictionary;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSupported(Boolean(getNdefReaderConstructor()));
  }, []);

  if (!supported || (mode === "write" && !url)) {
    return null;
  }

  async function handleWrite() {
    const NDEFReader = getNdefReaderConstructor();
    if (!NDEFReader || !url) return;
    setBusy(true);
    setMessage("");
    try {
      const reader = new NDEFReader();
      await reader.write({ records: [{ recordType: "url", data: url }] });
      setMessage(labels.tagWriteSuccess);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.tagWriteError);
    } finally {
      setBusy(false);
    }
  }

  async function handleScan() {
    const NDEFReader = getNdefReaderConstructor();
    if (!NDEFReader) return;
    setBusy(true);
    setMessage(labels.tagReadWaiting);
    try {
      const reader = new NDEFReader();
      reader.onreading = (event) => {
        const record = event.message.records.find((entry) => entry.recordType === "url");
        if (!record?.data) return;
        const decoded = new TextDecoder(record.encoding ?? "utf-8").decode(record.data);
        const tagCode = decoded.split("/").filter(Boolean).pop();
        if (tagCode) {
          window.location.href = `/scie/${tagCode}`;
        }
      };
      await reader.scan();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : labels.tagReadError);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <Button type="button" variant="ghost" onClick={() => void (mode === "write" ? handleWrite() : handleScan())} disabled={busy}>
        {mode === "write" ? labels.tagWriteButton : labels.tagReadButton}
      </Button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
