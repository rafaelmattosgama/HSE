import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { TLSSocket } from "node:tls";
import { env } from "@/lib/env";

const PINNED_CERT_PATH = path.join(process.cwd(), "certs", "smtp-gateway.crt");
const PINNED_CERT_FINGERPRINT_SHA256 =
  "89:BB:C0:99:C0:23:0A:1F:09:C4:27:A8:5C:DB:18:2F:35:EC:30:33:19:37:12:8A:AA:63:51:31:9A:A3:2F:71";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];
const REQUEST_TIMEOUT_MS = 20_000;

export class SmtpGatewayError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, options?: { retryable?: boolean; status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SmtpGatewayError";
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}

export function assertPinnedFingerprint(fingerprint256: string) {
  if (fingerprint256.toUpperCase() !== PINNED_CERT_FINGERPRINT_SHA256) {
    throw new SmtpGatewayError(
      `SMTP gateway presented an unexpected certificate (fingerprint ${fingerprint256})`,
      { retryable: false },
    );
  }
}

let cachedAgent: https.Agent | null = null;

function getPinnedAgent() {
  if (!cachedAgent) {
    cachedAgent = new https.Agent({
      ca: fs.readFileSync(PINNED_CERT_PATH),
      rejectUnauthorized: true,
    });
  }
  return cachedAgent;
}

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_COMBINED_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type SmtpGatewayAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SmtpGatewaySendInput = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: SmtpGatewayAttachment[];
};

type GatewayAttachmentPayload = {
  filename: string;
  content: string;
  contentType?: string;
};

type GatewaySendPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: GatewayAttachmentPayload[];
};

function buildAttachmentsPayload(
  attachments: SmtpGatewayAttachment[] | undefined,
): GatewayAttachmentPayload[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  if (attachments.length > MAX_ATTACHMENTS) {
    throw new SmtpGatewayError(`SMTP gateway accepts at most ${MAX_ATTACHMENTS} attachments`, {
      retryable: false,
      status: 400,
    });
  }

  let combinedBytes = 0;
  const payload = attachments.map((attachment) => {
    if (attachment.content.length > MAX_ATTACHMENT_BYTES) {
      throw new SmtpGatewayError(`Attachment "${attachment.filename}" exceeds the 15MB per-file limit`, {
        retryable: false,
        status: 400,
      });
    }
    combinedBytes += attachment.content.length;
    return {
      filename: attachment.filename,
      content: attachment.content.toString("base64"),
      contentType: attachment.contentType,
    };
  });

  if (combinedBytes > MAX_COMBINED_ATTACHMENT_BYTES) {
    throw new SmtpGatewayError("Combined attachments exceed the 20MB limit", { retryable: false, status: 400 });
  }

  return payload;
}

type GatewayResponseBody = {
  status?: string;
  messageId?: string;
  error?: string;
};

function parseResponseBody(raw: string): GatewayResponseBody {
  try {
    return raw ? (JSON.parse(raw) as GatewayResponseBody) : {};
  } catch {
    return {};
  }
}

function requestOnce(payload: GatewaySendPayload): Promise<{ status: number; body: GatewayResponseBody }> {
  return new Promise((resolve, reject) => {
    const url = new URL("/send", env.SMTP_GATEWAY_BASE_URL);
    const body = JSON.stringify(payload);

    const request = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        agent: getPinnedAgent(),
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          authorization: `Bearer ${env.SMTP_GATEWAY_API_KEY}`,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: parseResponseBody(Buffer.concat(chunks).toString("utf8")),
          });
        });
        response.on("error", reject);
      },
    );

    request.on("socket", (socket: TLSSocket) => {
      socket.once("secureConnect", () => {
        const cert = socket.getPeerCertificate?.();
        if (!cert?.fingerprint256) return;
        try {
          assertPinnedFingerprint(cert.fingerprint256);
        } catch (error) {
          request.destroy(error as Error);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("SMTP gateway request timed out"));
    });
    request.on("error", reject);

    request.write(body);
    request.end();
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendViaSmtpGateway(input: SmtpGatewaySendInput): Promise<{ messageId: string }> {
  if (!env.SMTP_GATEWAY_API_KEY) {
    throw new SmtpGatewayError("SMTP_GATEWAY_API_KEY is not configured", { retryable: false });
  }

  const attachmentsPayload = buildAttachmentsPayload(input.attachments);
  if (!input.text && !input.html && !attachmentsPayload) {
    throw new SmtpGatewayError("At least one of text, html, or attachments is required", { retryable: false });
  }

  const payload: GatewaySendPayload = {
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: attachmentsPayload,
  };

  let lastError: SmtpGatewayError = new SmtpGatewayError("SMTP gateway request failed", { retryable: true });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { status, body } = await requestOnce(payload);

      if (status === 200) {
        return { messageId: body.messageId ?? "" };
      }
      if (status === 400 || status === 401 || status === 403) {
        throw new SmtpGatewayError(body.error ?? `SMTP gateway rejected the request (HTTP ${status})`, {
          retryable: false,
          status,
        });
      }
      lastError = new SmtpGatewayError(body.error ?? `SMTP gateway returned HTTP ${status}`, {
        retryable: true,
        status,
      });
    } catch (error) {
      if (error instanceof SmtpGatewayError) {
        if (!error.retryable) throw error;
        lastError = error;
      } else {
        lastError = new SmtpGatewayError("SMTP gateway request failed", { retryable: true, cause: error });
      }
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}
