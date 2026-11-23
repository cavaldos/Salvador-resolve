import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Key, Loader2, Send, Square, Trash2, X, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives/Button";
import { cn } from "@/lib/utils";
import { useAiAgentStore, type ChatItem } from "./agentStore";
import { AI_MODELS, clearApiKey, saveApiKey } from "./keys";

function ToolCard({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const icon =
    item.status === "running" ? (
      <Loader2 className="size-3.5 animate-spin text-text-muted" />
    ) : item.status === "awaiting-approval" ? (
      <AlertTriangle className="size-3.5 text-status-warning" />
    ) : item.status === "ok" ? (
      <Check className="size-3.5 text-status-success" />
    ) : (
      <X className="size-3.5 text-status-error" />
    );
  return (
    <div className="rounded-md border border-border-subtle bg-surface-input text-xs" data-testid="ai-tool-card">
      <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left" onClick={() => setOpen((o) => !o)}>
        {icon}
        <Wrench className="size-3 text-text-muted" />
        <span className="font-mono font-medium text-text-primary">{item.name}</span>
        <span className="min-w-0 flex-1 truncate text-text-muted">{item.argsSummary}</span>
        <ChevronDown className={cn("size-3 text-text-muted transition-transform", open && "rotate-180")} />
      </button>
      {item.result && (
        <div className={cn("border-t border-border-subtle px-2 py-1 text-text-muted", item.status === "error" && "text-status-error", !open && "line-clamp-2")}>
          {item.result}
        </div>
      )}
      {open && <div className="border-t border-border-subtle px-2 py-1 font-mono text-[11px] text-text-muted break-all">{item.argsSummary || "(no arguments)"}</div>}
    </div>
  );
}

function Bubble({ item }: { item: ChatItem }) {
  if (item.kind === "tool") return <ToolCard item={item} />;
  if (item.kind === "error") {
    return <div className="rounded-md border border-status-error/40 bg-status-error/10 px-3 py-2 text-xs text-status-error">{item.text}</div>;
  }
  const user = item.kind === "user";
  return (
    <div className={cn("flex", user ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
          user ? "bg-accent-primary text-white" : "bg-surface-elevated text-text-primary",
        )}
      >
        {item.text}
      </div>
    </div>
  );
}

function KeySettings({ onClose }: { onClose: () => void }) {
  const keySet = useAiAgentStore((s) => s.keySet);
  const refresh = useAiAgentStore((s) => s.refreshKeyStatus);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
      setValue("");
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-border-subtle bg-surface-panel p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-primary">Anthropic API key</span>
        <button aria-label="Close settings" onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="text-text-muted">
        {keySet ? "A key is stored in your OS keychain." : "No key set."} It is never shown or sent anywhere except api.anthropic.com.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-surface-input px-2 text-text-primary outline-none focus:border-accent-primary"
        />
        <Button size="sm" disabled={busy || !value.trim()} onClick={() => run(() => saveApiKey(value))}>
          Save
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !keySet} onClick={() => run(() => clearApiKey())}>
          Clear
        </Button>
      </div>
      {err && <p className="text-status-error">{err}</p>}
    </div>
  );
}

export function AiAgentPanel({ className }: { className?: string }) {
  const { items, running, mode, model, keySet, pending } = useAiAgentStore();
  const { send, stop, setMode, setModel, resolveApproval, refreshKeyStatus, newChat } = useAiAgentStore.getState();
  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshKeyStatus();
  }, [refreshKeyStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [items, pending]);

  const submit = () => {
    if (!draft.trim() || running) return;
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface-panel text-text-primary", className)} data-testid="ai-agent-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Bot className="size-4 text-accent-primary" />
        <span className="text-sm font-medium">AI Agent</span>
        <div className="ml-auto flex items-center gap-1">
          <div role="group" aria-label="Mode" className="flex overflow-hidden rounded-md border border-border-default text-xs">
            {(["plan", "build"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn("px-2 py-1 capitalize", mode === m ? "bg-accent-primary text-white" : "text-text-muted hover:bg-surface-hover")}
              >
                {m}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="API key settings" onClick={() => setShowKey((v) => !v)}>
            <Key />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="New chat" onClick={newChat} disabled={items.length === 0 && !running}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {(showKey || keySet === false) && <KeySettings onClose={() => setShowKey(false)} />}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 && (
          <p className="text-xs text-text-muted">
            Ask me to edit the timeline, e.g. “cut the first 5 seconds”, “remove silences from the main clip”, “add a title at the playhead”. In Plan mode I only propose steps.
          </p>
        )}
        {items.map((i) => (
          <Bubble key={i.id} item={i} />
        ))}
        {running && !pending && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="size-3 animate-spin" /> Working…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Approval required" className="space-y-2 border-t border-status-warning/40 bg-status-warning/10 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5 text-status-warning" /> Approve <span className="font-mono">{pending.name}</span>?
          </div>
          {pending.argsSummary && <div className="break-all font-mono text-text-muted">{pending.argsSummary}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => resolveApproval(true)}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => resolveApproval(false)}>
              Deny
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-border-subtle p-3">
        <textarea
          value={draft}
          rows={2}
          placeholder={keySet === false ? "Add an API key to start" : mode === "plan" ? "Describe what you want (plan only)…" : "Tell the agent what to edit…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none rounded-md border border-border-default bg-surface-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
        />
        <div className="flex items-center gap-2">
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
            className="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-surface-input px-2 text-xs text-text-primary"
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {running ? (
            <Button size="sm" variant="destructive" onClick={stop} aria-label="Stop">
              <Square /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={!draft.trim() || keySet === false} aria-label="Send">
              <Send /> Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
