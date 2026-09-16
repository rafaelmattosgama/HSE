import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpsMock = vi.hoisted(() => ({
  request: vi.fn(),
  Agent: vi.fn().mockImplementation((options: unknown) => ({ options })),
}));

vi.mock("node:https", () => ({
  default: httpsMock,
  request: httpsMock.request,
  Agent: httpsMock.Agent,
}));

const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from("pinned-ca-cert")),
}));

vi.mock("node:fs", () => ({
  default: fsMock,
  readFileSync: fsMock.readFileSync,
}));

vi.mock("@/lib/env", () => ({
  env: {
    SMTP_GATEWAY_BASE_URL: "https://148.69.182.60:8444",
    SMTP_GATEWAY_API_KEY: "test-api-key",
  },
}));

class FakeClientRequest extends EventEmitter {
  written: string[] = [];
  ended = false;
  destroyed = false;
  write(chunk: string) {
    this.written.push(chunk);
  }
  end() {
    this.ended = true;
  }
  destroy(error?: Error) {
    this.destroyed = true;
    if (error) this.emit("error", error);
  }
}

function respondWith(status: number, body: unknown) {
  httpsMock.request.mockImplementationOnce((_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
    const req = new FakeClientRequest();
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = status;
    queueMicrotask(() => {
      callback(res);
      res.emit("data", Buffer.from(JSON.stringify(body)));
      res.emit("end");
    });
    return req;
  });
}

function failWith(error: Error) {
  httpsMock.request.mockImplementationOnce(() => {
    const req = new FakeClientRequest();
    queueMicrotask(() => req.emit("error", error));
    return req;
  });
}

describe("smtp-gateway-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("assertPinnedFingerprint", () => {
    it("does not throw when the fingerprint matches the pinned certificate", async () => {
      const { assertPinnedFingerprint } = await import("@/lib/services/smtp-gateway-client");
      expect(() =>
        assertPinnedFingerprint(
          "89:BB:C0:99:C0:23:0A:1F:09:C4:27:A8:5C:DB:18:2F:35:EC:30:33:19:37:12:8A:AA:63:51:31:9A:A3:2F:71",
        ),
      ).not.toThrow();
    });

    it("throws a non-retryable SmtpGatewayError when the fingerprint does not match", async () => {
      const { assertPinnedFingerprint, SmtpGatewayError } = await import("@/lib/services/smtp-gateway-client");
      try {
        assertPinnedFingerprint("00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF");
        expect.unreachable("expected assertPinnedFingerprint to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(SmtpGatewayError);
        expect((error as InstanceType<typeof SmtpGatewayError>).retryable).toBe(false);
      }
    });
  });

  describe("sendViaSmtpGateway", () => {
    it("posts to /send with the bearer token and returns the messageId on 200", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(200, { status: "sent", messageId: "msg-123" });

      const result = await sendViaSmtpGateway({ to: "worker@example.com", subject: "Hello", text: "Body" });

      expect(result).toEqual({ messageId: "msg-123" });
      expect(httpsMock.request).toHaveBeenCalledTimes(1);
      const [options] = httpsMock.request.mock.calls[0];
      expect(options).toMatchObject({
        method: "POST",
        path: "/send",
        headers: expect.objectContaining({ authorization: "Bearer test-api-key" }),
      });
    });

    it("throws a non-retryable error on 400 without retrying", async () => {
      const { sendViaSmtpGateway, SmtpGatewayError } = await import("@/lib/services/smtp-gateway-client");
      respondWith(400, { error: "Invalid recipient address" });

      await expect(sendViaSmtpGateway({ to: "bad", subject: "Hello", text: "Body" })).rejects.toMatchObject({
        message: "Invalid recipient address",
        retryable: false,
        status: 400,
      });
      expect(httpsMock.request).toHaveBeenCalledTimes(1);
    });

    it("throws a non-retryable error on 401", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(401, { error: "Unauthorized" });

      await expect(sendViaSmtpGateway({ to: "a@example.com", subject: "s", text: "t" })).rejects.toMatchObject({
        retryable: false,
        status: 401,
      });
      expect(httpsMock.request).toHaveBeenCalledTimes(1);
    });

    it("retries on 502 and succeeds if a later attempt returns 200", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(502, { error: "Failed to send email." });
      respondWith(200, { status: "sent", messageId: "msg-456" });

      const promise = sendViaSmtpGateway({ to: "a@example.com", subject: "s", text: "t" });
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ messageId: "msg-456" });
      expect(httpsMock.request).toHaveBeenCalledTimes(2);
    });

    it("gives up after exhausting retries on persistent 502", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(502, { error: "Failed to send email." });
      respondWith(502, { error: "Failed to send email." });
      respondWith(502, { error: "Failed to send email." });

      const promise = sendViaSmtpGateway({ to: "a@example.com", subject: "s", text: "t" });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({ retryable: true, status: 502 });
      expect(httpsMock.request).toHaveBeenCalledTimes(3);
    });

    it("retries a network-level error and gives up after exhausting attempts", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      failWith(new Error("socket hang up"));
      failWith(new Error("socket hang up"));
      failWith(new Error("socket hang up"));

      const promise = sendViaSmtpGateway({ to: "a@example.com", subject: "s", text: "t" });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({ retryable: true });
      expect(httpsMock.request).toHaveBeenCalledTimes(3);
    });

    it("rejects when neither text, html nor attachments are provided, without making a request", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");

      await expect(sendViaSmtpGateway({ to: "a@example.com", subject: "s" })).rejects.toMatchObject({
        retryable: false,
      });
      expect(httpsMock.request).not.toHaveBeenCalled();
    });

    it("base64-encodes attachments into the request body", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(200, { status: "sent", messageId: "msg-789" });

      const content = Buffer.from("%PDF-1.4 fake report bytes");
      await sendViaSmtpGateway({
        to: "corporate@example.com",
        subject: "Report",
        text: "see attached",
        attachments: [{ filename: "report.pdf", content, contentType: "application/pdf" }],
      });

      const requestCall = httpsMock.request.mock.results[0].value as FakeClientRequest;
      const sentBody = JSON.parse(requestCall.written.join(""));
      expect(sentBody.attachments).toEqual([
        { filename: "report.pdf", content: content.toString("base64"), contentType: "application/pdf" },
      ]);
    });

    it("allows an attachment-only email with no text or html", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      respondWith(200, { status: "sent", messageId: "msg-attach-only" });

      const result = await sendViaSmtpGateway({
        to: "corporate@example.com",
        subject: "Report",
        attachments: [{ filename: "report.pdf", content: Buffer.from("bytes"), contentType: "application/pdf" }],
      });

      expect(result).toEqual({ messageId: "msg-attach-only" });
    });

    it("rejects a too-large attachment before making a request", async () => {
      const { sendViaSmtpGateway } = await import("@/lib/services/smtp-gateway-client");
      const oversized = Buffer.alloc(15 * 1024 * 1024 + 1);

      await expect(
        sendViaSmtpGateway({
          to: "corporate@example.com",
          subject: "Report",
          attachments: [{ filename: "huge.pdf", content: oversized, contentType: "application/pdf" }],
        }),
      ).rejects.toMatchObject({ retryable: false, status: 400 });
      expect(httpsMock.request).not.toHaveBeenCalled();
    });
  });
});
