"use client";

import { useMemo, useRef, useState } from "react";
import { Ban, Bot, Check, ChevronDown, MessageCircle, RotateCcw, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildActionFlowMessage,
  getAgentMessageForIntent,
  getAgentQuickActions,
  resolveAgentIntent,
  type AgentIntent,
} from "@/lib/agent/intents";
import {
  formatInternalAgentCopy,
  getInternalAgentCopy,
  getInternalAgentErrorMessage,
  type InternalAgentCopy,
} from "@/lib/agent/i18n";
import { parseApiResponse } from "@/lib/client-api";
import type { AppLocale } from "@/lib/i18n/routing";

type ChatMessage = { id: string; role: "user" | "agent" | "system"; text: string };
type PendingConfirmation = { confirmationId: string; summary?: string; status: "pending" | "confirmed" | "cancelled" | "expired" };
type ActionChoice = { id: string; sequenceNumber?: number | null; title: string; status: string; priority: string; dueDate?: string | null };
type ActionFlow = { type: "update_priority" | "close_action"; actions: ActionChoice[] };
type AgentRequest = { message: string; intent?: AgentIntent };
type RetryRequest = { request: AgentRequest; userText: string };

type AgentResponseData = {
  type?: string;
  message?: string;
  plantCode?: string;
  intent?: AgentIntent | null;
  mode?: "mock" | "real";
  flow?: ActionFlow | null;
  confirmation?: { confirmationId: string; summary?: string; status?: PendingConfirmation["status"] } | null;
  confirmationId?: string;
  summary?: string;
  toolName?: string;
  result?: unknown;
  status?: PendingConfirmation["status"];
};

class AgentChatError extends Error {
  constructor(message: string, public readonly errorCode?: string) {
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
        data.summary ? formatInternalAgentCopy(copy.confirmationExecutedWithSummary, { summary: data.summary }) : copy.confirmationExecuted,
        resultText(data.result, copy),
      ].filter(Boolean).join("\n"),
      confirmation: null,
    };
  }
  if (data.type === "confirmation_cancelled") {
    return {
      text: data.summary ? formatInternalAgentCopy(copy.confirmationCancelledWithSummary, { summary: data.summary }) : copy.confirmationCancelled,
      confirmation: null,
    };
  }
  if (data.type === "confirmation_required" && data.confirmationId) {
    return {
      text: data.message ?? data.summary ?? copy.confirmationRequired,
      confirmation: { confirmationId: data.confirmationId, summary: data.summary ?? data.message, status: "pending" as const },
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
  return { text: data.message ?? copy.noResponse, confirmation: null };
}

function getChatCopy(locale: AppLocale) {
  const isPortuguese = locale === "pt";
  return {
    chooseOption: isPortuguese ? "Escolha uma das opções ou escreva a sua pergunta." : "Choose an option or write your question.",
    viewOptions: isPortuguese ? "Ver opções" : "View options",
    hideOptions: isPortuguese ? "Ocultar opções" : "Hide options",
    selectAction: isPortuguese ? "Selecione uma ação" : "Select an action",
    selectPriority: isPortuguese ? "Selecione a nova prioridade" : "Select the new priority",
    high: isPortuguese ? "Alta" : "High",
    medium: isPortuguese ? "Média" : "Medium",
    low: isPortuguese ? "Baixa" : "Low",
    retry: isPortuguese ? "Tentar novamente" : "Try again",
    mockNotice: isPortuguese
      ? "Modo de demonstração ativo. As alterações continuam a exigir confirmação explícita."
      : "Demonstration mode is active. Changes still require explicit confirmation.",
  };
}

function actionReference(action: ActionChoice) {
  return action.sequenceNumber ? `#${action.sequenceNumber}` : action.id;
}

export function InternalAgentChat({ plantCode, locale }: { plantCode: string; locale: AppLocale }) {
  const copy = useMemo(() => getInternalAgentCopy(locale), [locale]);
  const chatCopy = useMemo(() => getChatCopy(locale), [locale]);
  const quickActions = useMemo(() => getAgentQuickActions(locale), [locale]);
  const requestInFlight = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [guidedFlow, setGuidedFlow] = useState<ActionFlow | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionChoice | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [error, setError] = useState("");
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);

  const canSubmit = useMemo(() => draft.trim().length > 0 && !isBusy, [draft, isBusy]);
  const canActOnConfirmation = pendingConfirmation?.status === "pending" && !isBusy;

  async function postAgent(body: { plantCode: string; message?: string; intent?: AgentIntent; confirmationId?: string; confirmationAction?: "confirm" | "cancel" }) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await parseApiResponse<AgentResponseData>(response);
    if (!json) throw new AgentChatError(copy.ui.contactError);
    if (!response.ok || !json.ok) throw new AgentChatError(getInternalAgentErrorMessage(locale, json.errorCode), json.errorCode);
    return json.data ?? { message: copy.ui.noResponse };
  }

  function appendMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: createMessageId() }]);
  }

  function applyAgentResponse(data: AgentResponseData) {
    const normalized = normalizeAgentReply(data, copy.ui);
    appendMessage({ role: "agent", text: normalized.text });
    setPendingConfirmation(normalized.confirmation);
    setIsMockMode(data.mode === "mock");
    if (data.flow) {
      setGuidedFlow(data.flow);
      setSelectedAction(null);
    } else if (normalized.confirmation) {
      setGuidedFlow(null);
      setSelectedAction(null);
    }
  }

  async function submitAgentRequest(request: AgentRequest, userText: string, appendUserMessage = true) {
    if (isBusy || requestInFlight.current) return;
    requestInFlight.current = true;
    setError("");
    setRetryRequest(null);
    setIsBusy(true);
    setShowQuickActions(false);
    if (appendUserMessage) appendMessage({ role: "user", text: userText });
    try {
      applyAgentResponse(await postAgent({ plantCode, ...request }));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.ui.genericError);
      setRetryRequest({ request, userText });
    } finally {
      requestInFlight.current = false;
      setIsBusy(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isBusy || requestInFlight.current) return;
    setDraft("");
    await submitAgentRequest({ message, intent: resolveAgentIntent(message) ?? undefined }, message);
  }

  async function actOnConfirmation(action: "confirm" | "cancel") {
    if (!pendingConfirmation || pendingConfirmation.status !== "pending" || isBusy || requestInFlight.current) return;
    const confirmationId = pendingConfirmation.confirmationId;
    requestInFlight.current = true;
    setIsBusy(true);
    setError("");
    setRetryRequest(null);
    setPendingConfirmation((current) => current?.confirmationId === confirmationId
      ? { ...current, status: action === "confirm" ? "confirmed" : "cancelled" }
      : current);
    appendMessage({ role: "user", text: action === "confirm" ? copy.ui.confirm : copy.ui.cancel });
    try {
      applyAgentResponse(await postAgent({ plantCode, confirmationId, confirmationAction: action }));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.ui.confirmationError);
      setPendingConfirmation((current) => current?.confirmationId === confirmationId
        ? {
            ...current,
            status: err instanceof AgentChatError && err.errorCode === "CONFIRMATION_EXPIRED"
              ? "expired"
              : err instanceof AgentChatError && err.errorCode === "CONFIRMATION_CANCELLED"
                ? "cancelled"
                : err instanceof AgentChatError && err.errorCode === "CONFIRMATION_CONFIRMED"
                  ? "confirmed"
                  : "pending",
          }
        : current);
    } finally {
      requestInFlight.current = false;
      setIsBusy(false);
    }
  }

  function startQuickAction(intent: AgentIntent, label: string) {
    void submitAgentRequest({ message: getAgentMessageForIntent(intent), intent }, label);
  }

  function selectAction(action: ActionChoice) {
    if (!guidedFlow || isBusy) return;
    setSelectedAction(action);
    appendMessage({ role: "user", text: `${actionReference(action)} — ${action.title}` });
    if (guidedFlow.type === "close_action") {
      void submitAgentRequest(
        { intent: "START_CLOSE_ACTION", message: buildActionFlowMessage({ intent: "START_CLOSE_ACTION", actionId: action.id }) },
        `${actionReference(action)} — ${action.title}`,
        false,
      );
    }
  }

  function selectPriority(priority: "LOW" | "MEDIUM" | "HIGH") {
    if (!guidedFlow || guidedFlow.type !== "update_priority" || !selectedAction || isBusy) return;
    const labels = { LOW: chatCopy.low, MEDIUM: chatCopy.medium, HIGH: chatCopy.high };
    void submitAgentRequest(
      {
        intent: "START_UPDATE_ACTION_PRIORITY",
        message: buildActionFlowMessage({ intent: "START_UPDATE_ACTION_PRIORITY", actionId: selectedAction.id, priority }),
      },
      labels[priority],
    );
  }

  if (!isOpen) {
    return <button type="button" data-onboarding="ai-assistant" data-no-translate onClick={() => { setShowQuickActions(true); setIsOpen(true); }} className="fixed bottom-5 right-5 z-[95] inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-2xl transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2" aria-label={copy.ui.openChat} title={copy.ui.title}><MessageCircle className="h-6 w-6" /></button>;
  }

  return (
    <section data-onboarding="ai-assistant" data-no-translate className="fixed bottom-5 right-5 z-[95] flex h-[min(680px,calc(100vh-40px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2"><Bot className="h-5 w-5 shrink-0" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{copy.ui.title}</p><p className="text-xs uppercase tracking-[0.18em] text-slate-300">{plantCode}</p></div></div>
        <button type="button" onClick={() => setIsOpen(false)} className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={copy.ui.closeChat} title={copy.ui.close}><X className="h-5 w-5" /></button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {isMockMode ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{chatCopy.mockNotice}</p> : null}
        {showQuickActions ? (
          <aside aria-label={chatCopy.viewOptions} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{copy.ui.welcome}</p>
            <p className="mt-1 text-sm text-slate-600">{chatCopy.chooseOption}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
              {quickActions.map((action) => <button key={action.intent} type="button" onClick={() => startQuickAction(action.intent, action.label)} disabled={isBusy} aria-label={action.ariaLabel} className="min-h-11 rounded-full border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[var(--primary)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{action.label}</button>)}
            </div>
          </aside>
        ) : null}
        {messages.map((message) => {
          const isUser = message.role === "user";
          const Icon = isUser ? User : Bot;
          return <div key={message.id} className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>{!isUser ? <div className="mt-1 rounded-full bg-white p-1.5 text-slate-600 shadow-sm"><Icon className="h-4 w-4" /></div> : null}<p className={`max-w-[82%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-5 shadow-sm ${isUser ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>{message.text}</p></div>;
        })}
        {guidedFlow && !selectedAction ? (
          <section aria-label={chatCopy.selectAction} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-sm font-semibold text-slate-900">{chatCopy.selectAction}</p><div className="mt-2 space-y-2">{guidedFlow.actions.map((action) => <button key={action.id} type="button" onClick={() => selectAction(action)} disabled={isBusy} aria-label={`${chatCopy.selectAction}: ${actionReference(action)} ${action.title}`} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-800 transition hover:border-[var(--primary)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><span className="block font-semibold">{actionReference(action)} — {action.title}</span><span className="block text-xs text-slate-500">{action.status} · {action.priority}</span></button>)}</div></section>
        ) : null}
        {guidedFlow?.type === "update_priority" && selectedAction ? (
          <section aria-label={chatCopy.selectPriority} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-sm font-semibold text-slate-900">{chatCopy.selectPriority}</p><div className="mt-2 grid grid-cols-3 gap-2">{(["LOW", "MEDIUM", "HIGH"] as const).map((priority) => { const labels = { LOW: chatCopy.low, MEDIUM: chatCopy.medium, HIGH: chatCopy.high }; return <button key={priority} type="button" onClick={() => selectPriority(priority)} disabled={isBusy} aria-label={`${chatCopy.selectPriority}: ${labels[priority]}`} className="min-h-11 rounded-full border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-800 transition hover:border-[var(--primary)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{labels[priority]}</button>; })}</div></section>
        ) : null}
        {isBusy ? <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">{copy.ui.processing}</div> : null}
      </div>

      {pendingConfirmation?.status === "pending" ? <div className="border-t border-amber-200 bg-amber-50 px-4 py-3"><p className="text-sm font-semibold text-amber-950">{pendingConfirmation.summary ?? copy.ui.pendingConfirmation}</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" onClick={() => void actOnConfirmation("confirm")} disabled={!canActOnConfirmation}><Check className="h-4 w-4" />{copy.ui.confirm}</Button><Button type="button" size="sm" variant="secondary" onClick={() => void actOnConfirmation("cancel")} disabled={!canActOnConfirmation}><Ban className="h-4 w-4" />{copy.ui.cancel}</Button></div></div> : null}
      {error ? <div role="alert" className="flex items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700"><p>{error}</p>{retryRequest ? <Button type="button" size="sm" variant="secondary" onClick={() => void submitAgentRequest(retryRequest.request, retryRequest.userText, false)} disabled={isBusy}><RotateCcw className="h-4 w-4" />{chatCopy.retry}</Button> : null}</div> : null}
      <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <button type="button" onClick={() => setShowQuickActions((current) => !current)} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label={showQuickActions ? chatCopy.hideOptions : chatCopy.viewOptions} aria-expanded={showQuickActions}>{chatCopy.viewOptions}<ChevronDown className={`h-4 w-4 transition ${showQuickActions ? "rotate-180" : ""}`} /></button>
        <label className="sr-only" htmlFor="agent-chat-message">{copy.ui.messageLabel}</label>
        <textarea id="agent-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="min-h-11 max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus-visible:ring-2 focus-visible:ring-[var(--primary)]" placeholder={copy.ui.placeholder} disabled={isBusy} />
        <Button type="submit" size="sm" disabled={!canSubmit} aria-label={copy.ui.send} title={copy.ui.send}><Send className="h-4 w-4" /></Button>
      </form>
    </section>
  );
}
