"use client";

import { useMemo, useState } from "react";
import { Ban, Bot, Check, MessageCircle, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatInternalAgentCopy,
  getInternalAgentCopy,
  getInternalAgentErrorMessage,
  type InternalAgentCopy,
} from "@/lib/agent/i18n";
import { parseApiResponse } from "@/lib/client-api";
import type { AppLocale } from "@/lib/i18n/routing";

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
};

type PendingConfirmation = {
  confirmationId: string;
  summary?: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
};

type AgentResponseData = {
  type?: string;
  message?: string;
  plantCode?: string;
  confirmation?: {
    confirmationId: string;
    summary?: string;
    status?: PendingConfirmation["status"];
  } | null;
  confirmationId?: string;
  summary?: string;
  toolName?: string;
  result?: unknown;
  status?: PendingConfirmation["status"];
};

class AgentChatError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = "AgentChatError";
  }
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resultText(value: unknown, copy: InternalAgentCopy["ui"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.ok === false && typeof record.message === "string") return record.message;
    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;
      if (typeof data.title === "string" && typeof data.status === "string") {
        return formatInternalAgentCopy(copy.statusChanged, { title: data.title, status: data.status });
      }
    }
  }
  return copy.completed;
}

function normalizeAgentReply(data: AgentResponseData, copy: InternalAgentCopy["ui"]) {
  if (data.type === "confirmation_executed") {
    return {
      text: [
        data.summary
          ? formatInternalAgentCopy(copy.confirmationExecutedWithSummary, { summary: data.summary })
          : copy.confirmationExecuted,
        resultText(data.result, copy),
      ].filter(Boolean).join("\n"),
      confirmation: null,
    };
  }

  if (data.type === "confirmation_cancelled") {
    return {
      text: data.summary
        ? formatInternalAgentCopy(copy.confirmationCancelledWithSummary, { summary: data.summary })
        : copy.confirmationCancelled,
      confirmation: null,
    };
  }

  if (data.type === "confirmation_required" && data.confirmationId) {
    return {
      text: data.message ?? data.summary ?? copy.confirmationRequired,
      confirmation: {
        confirmationId: data.confirmationId,
        summary: data.summary ?? data.message,
        status: "pending" as const,
      },
    };
  }

  if (data.confirmation?.confirmationId) {
    return {
      text: data.message || data.confirmation.summary || copy.confirmationRequired,
      confirmation: {
        confirmationId: data.confirmation.confirmationId,
        summary: data.confirmation.summary,
        status: data.confirmation.status ?? "pending",
      },
    };
  }

  return {
    text: data.message ?? copy.noResponse,
    confirmation: null,
  };
}

export function InternalAgentChat({ plantCode, locale }: { plantCode: string; locale: AppLocale }) {
  const copy = useMemo(() => getInternalAgentCopy(locale), [locale]);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: "agent",
      text: copy.ui.welcome,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => draft.trim().length > 0 && !isBusy, [draft, isBusy]);
  const canActOnConfirmation = pendingConfirmation?.status === "pending" && !isBusy;

  async function postAgent(body: {
    plantCode: string;
    message?: string;
    confirmationId?: string;
    confirmationAction?: "confirm" | "cancel";
  }) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await parseApiResponse<AgentResponseData>(response);
    if (!json) throw new AgentChatError(copy.ui.contactError);
    if (!response.ok || !json.ok) {
      throw new AgentChatError(getInternalAgentErrorMessage(locale, json.errorCode), json.errorCode);
    }
    return json.data ?? { message: copy.ui.noResponse };
  }

  function appendMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: createMessageId() }]);
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isBusy) return;

    setDraft("");
    setError("");
    setIsBusy(true);
    appendMessage({ role: "user", text: message });

    try {
      const data = await postAgent({ plantCode, message });
      const normalized = normalizeAgentReply(data, copy.ui);
      appendMessage({ role: "agent", text: normalized.text });
      setPendingConfirmation(normalized.confirmation);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.ui.genericError);
    } finally {
      setIsBusy(false);
    }
  }

  async function actOnConfirmation(action: "confirm" | "cancel") {
    if (!pendingConfirmation || pendingConfirmation.status !== "pending" || isBusy) return;

    const confirmationId = pendingConfirmation.confirmationId;
    setIsBusy(true);
    setError("");
    setPendingConfirmation((current) =>
      current?.confirmationId === confirmationId
        ? { ...current, status: action === "confirm" ? "confirmed" : "cancelled" }
        : current,
    );

    appendMessage({
      role: "user",
      text: action === "confirm" ? copy.ui.confirm : copy.ui.cancel,
    });

    try {
      const data = await postAgent({
        plantCode,
        confirmationId,
        confirmationAction: action,
      });
      const normalized = normalizeAgentReply(data, copy.ui);
      appendMessage({ role: "agent", text: normalized.text });
      setPendingConfirmation(normalized.confirmation);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.ui.confirmationError);
      setPendingConfirmation((current) =>
        current?.confirmationId === confirmationId
          ? {
              ...current,
              status:
                err instanceof AgentChatError && err.errorCode === "CONFIRMATION_EXPIRED"
                  ? "expired"
                  : err instanceof AgentChatError && err.errorCode === "CONFIRMATION_CANCELLED"
                    ? "cancelled"
                    : err instanceof AgentChatError && err.errorCode === "CONFIRMATION_CONFIRMED"
                      ? "confirmed"
                      : "pending",
            }
          : current,
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        data-onboarding="ai-assistant"
        data-no-translate
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-[95] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-2xl transition hover:bg-slate-800"
        aria-label={copy.ui.openChat}
        title={copy.ui.title}
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <section data-onboarding="ai-assistant" data-no-translate className="fixed bottom-5 right-5 z-[95] flex h-[min(680px,calc(100vh-40px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{copy.ui.title}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-300">{plantCode}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
          aria-label={copy.ui.closeChat}
          title={copy.ui.close}
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const Icon = isUser ? User : Bot;
          return (
            <div key={message.id} className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser ? (
                <div className="mt-1 rounded-full bg-white p-1.5 text-slate-600 shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
              ) : null}
              <p
                className={`max-w-[82%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-5 shadow-sm ${
                  isUser ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                {message.text}
              </p>
            </div>
          );
        })}
        {isBusy ? (
          <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            {copy.ui.processing}
          </div>
        ) : null}
      </div>

      {pendingConfirmation?.status === "pending" ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">{pendingConfirmation.summary ?? copy.ui.pendingConfirmation}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void actOnConfirmation("confirm")}
              disabled={!canActOnConfirmation}
            >
              <Check className="h-4 w-4" />
              {copy.ui.confirm}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void actOnConfirmation("cancel")}
              disabled={!canActOnConfirmation}
            >
              <Ban className="h-4 w-4" />
              {copy.ui.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <label className="sr-only" htmlFor="agent-chat-message">
          {copy.ui.messageLabel}
        </label>
        <textarea
          id="agent-chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-h-11 max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          placeholder={copy.ui.placeholder}
          disabled={isBusy}
        />
        <Button type="submit" size="sm" disabled={!canSubmit} aria-label={copy.ui.send} title={copy.ui.send}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
