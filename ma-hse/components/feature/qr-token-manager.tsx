"use client";

import { useMemo, useState } from "react";
import { PlantAccessTokenType } from "@prisma/client";
import { usePathname } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { HelpPopover } from "@/components/ui/help-popover";
import { formatMasterDataMessage, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";

type GeneratedQr = {
  type: PlantAccessTokenType;
  token: string;
  publicUrl: string;
  qrDataUrl: string;
};

export function QrTokenManager({
  labels = getStaticN0MasterDataUi("en"),
}: {
  labels?: N0MasterDataUi;
}) {
  const pathname = usePathname();
  const plant = pathname.split("/")[2];
  const [tokenType, setTokenType] = useState<PlantAccessTokenType>(PlantAccessTokenType.REPORT);
  const [generated, setGenerated] = useState<GeneratedQr | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    return tokenType === PlantAccessTokenType.REPORT ? labels.qr.reportToken : labels.qr.kioskToken;
  }, [labels.qr.kioskToken, labels.qr.reportToken, tokenType]);

  async function regenerate() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plants/${plant}/admin/qr-tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: tokenType, regenerate: true }),
      });

      const json = await response.json();
      if (!json.ok) {
        setMessage(json.message ?? labels.qr.failedRegenerate);
        return;
      }

      const token = String(json.data.token ?? "");
      const path = String(json.data.path ?? "");
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const publicUrl = currentOrigin
        ? `${currentOrigin}${path}?t=${encodeURIComponent(token)}`
        : String(json.data.publicUrl ?? "");

      const qrDataUrl = await QRCode.toDataURL(publicUrl, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: "M",
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      setGenerated({
        type: json.data.type as PlantAccessTokenType,
        token,
        publicUrl,
        qrDataUrl,
      });
      setMessage(labels.qr.regenerated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.qr.failedRegenerate);
    } finally {
      setLoading(false);
    }
  }

  function openLink() {
    if (!generated) return;
    window.open(generated.publicUrl, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.publicUrl);
    setMessage(labels.qr.linkCopied);
  }

  function downloadImage() {
    if (!generated) return;
    const anchor = document.createElement("a");
    anchor.href = generated.qrDataUrl;
    anchor.download = `qr-${plant}-${generated.type.toLowerCase()}.png`;
    anchor.click();
  }

  function printQr() {
    if (!generated) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      setMessage(labels.qr.printBlocked);
      return;
    }

    const escapedUrl = generated.publicUrl
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${labels.qr.printQr}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
      .wrap { max-width: 640px; margin: 0 auto; text-align: center; }
      img { width: 320px; height: 320px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; }
      .meta { margin-top: 14px; font-size: 13px; line-height: 1.5; word-break: break-all; }
      .actions { margin-top: 16px; }
      button { padding: 8px 12px; font-weight: 600; border: 0; border-radius: 8px; background: #0f172a; color: #fff; cursor: pointer; }
      .hint { margin-top: 10px; color: #475569; font-size: 12px; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>${generated.type} - ${plant.toUpperCase()}</h1>
      <img src="${generated.qrDataUrl}" alt="QR code" />
      <p class="meta">${escapedUrl}</p>
      <div class="actions">
        <button type="button" onclick="window.print()">${labels.qr.print}</button>
      </div>
      <p class="hint">${labels.qr.printHint}</p>
    </main>
  </body>
</html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();

    const runPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        setMessage(labels.qr.printFailed);
      }
    };

    win.addEventListener("load", () => window.setTimeout(runPrint, 150), { once: true });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{labels.qr.title}</h3>
        <HelpPopover title={labels.qr.title} body={labels.qr.help} buttonLabel={labels.helpButton} />
      </div>

      <select
        value={tokenType}
        onChange={(event) => setTokenType(event.target.value as PlantAccessTokenType)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value={PlantAccessTokenType.REPORT}>{labels.qr.reportToken}</option>
        <option value={PlantAccessTokenType.KIOSK}>{labels.qr.kioskToken}</option>
      </select>

      <Button size="sm" onClick={regenerate} disabled={loading}>
        {loading ? labels.qr.regenerating : formatMasterDataMessage(labels.qr.regenerate, { token: title })}
      </Button>

      {message ? <p className="text-xs text-slate-700">{message}</p> : null}

      {generated ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generated.qrDataUrl}
              alt={formatMasterDataMessage(labels.qr.qrAlt, { type: generated.type })}
              className="h-56 w-56 rounded-lg border border-slate-300 bg-white p-2"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.qr.publicLink}</p>
            <a
              href={generated.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-xs text-teal-700 hover:underline"
            >
              {generated.publicUrl}
            </a>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.qr.rawToken}</p>
            <code className="block break-all rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700">
              {generated.token}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
              {labels.qr.copyLink}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={openLink}>
              {labels.qr.openLink}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={downloadImage}>
              {labels.qr.saveImage}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={printQr}>
              {labels.qr.printQr}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
