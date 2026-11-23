/** Panel/session state for the AI agent (zustand). Messages are UI-level, not LLM-level. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Agent, type AgentMode, type Provider } from "@salvador/agent";
import type { Host } from "@salvador/core";
import type { ToolCall, ToolDefinition } from "@salvador/tools";
import { createTauriProvider } from "./provider";
import { EDITOR_TOOLS, DEFAULT_PERMISSIONS } from "./tools";
import { EDITOR_SYSTEM_PROMPT, buildEditorContext } from "./prompt";
import { DEFAULT_MODEL, hasApiKey } from "./keys";

export type ToolStatus = "running" | "awaiting-approval" | "ok" | "error" | "denied";

export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "tool"; callId: string; name: string; argsSummary: string; status: ToolStatus; result?: string };

export interface PendingApproval {
  callId: string;
  name: string;
  argsSummary: string;
}

interface AiAgentState {
  items: ChatItem[];
  running: boolean;
  mode: AgentMode;
  model: string;
  keySet: boolean | null;
  pending: PendingApproval | null;

  refreshKeyStatus: () => Promise<void>;
  setMode: (m: AgentMode) => void;
  setModel: (m: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  resolveApproval: (ok: boolean) => void;
  newChat: () => void;
}

let idSeq = 0;
const nid = () => `m${++idSeq}`;

export function summarizeArgs(args: unknown, max = 120): string {
  if (args == null || typeof args !== "object") return "";
  const s = Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`)
    .join(", ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function resultText(r: unknown): { text: string; error: boolean } {
  if (r && typeof r === "object" && "error" in r) return { text: String((r as { error: unknown }).error), error: true };
  if (r && typeof r === "object" && "summary" in r) return { text: String((r as { summary: unknown }).summary), error: false };
  return { text: JSON.stringify(r), error: false };
}

// Module-level runtime (not serialisable, so kept out of the store state).
let agent: Agent | null = null;
let controller: AbortController | null = null;
let approvalResolver: ((ok: boolean) => void) | null = null;
let provider: Provider | null = null;

/** Test hook: inject a provider instead of the Tauri one. */
export function __setProviderForTests(p: Provider | null): void {
  provider = p;
  agent = null;
}

export const useAiAgentStore = create<AiAgentState>()(
  persist(
    (set, get) => {
      const patchTool = (callId: string, patch: Partial<Extract<ChatItem, { kind: "tool" }>>) =>
        set((s) => ({ items: s.items.map((i) => (i.kind === "tool" && i.callId === callId ? { ...i, ...patch } : i)) }));

      const ensureAgent = (): Agent => {
        if (agent) return agent;
        let appendNew = true;
        agent = new Agent({
          host: {} as unknown as Host,
          provider: provider ?? createTauriProvider(),
          model: get().model,
          options: {
            mode: get().mode,
            tools: EDITOR_TOOLS,
            systemPrompt: EDITOR_SYSTEM_PROMPT,
            contextProvider: buildEditorContext,
            permissions: { default: "allow", tools: { ...DEFAULT_PERMISSIONS.tools } },
          },
          callbacks: {
            onText: (text) => {
              set((s) => {
                const last = s.items[s.items.length - 1];
                if (!appendNew && last && last.kind === "assistant") {
                  return { items: [...s.items.slice(0, -1), { ...last, text: last.text + text }] };
                }
                appendNew = false;
                return { items: [...s.items, { id: nid(), kind: "assistant", text }] };
              });
            },
            onToolStart: (call: ToolCall, _tool: ToolDefinition) => {
              appendNew = true;
              set((s) => ({
                items: [
                  ...s.items,
                  { id: nid(), kind: "tool", callId: call.id, name: call.name, argsSummary: summarizeArgs(call.args), status: "running" },
                ],
              }));
            },
            onToolResult: (call, _tool, result) => {
              const { text, error } = resultText(result);
              patchTool(call.id, {
                status: error ? (/denied/.test(text) ? "denied" : "error") : "ok",
                result: text,
              });
            },
            approve: (call) =>
              new Promise<boolean>((resolve) => {
                approvalResolver = resolve;
                patchTool(call.id, { status: "awaiting-approval" });
                set({ pending: { callId: call.id, name: call.name, argsSummary: summarizeArgs(call.args) } });
              }),
          },
        });
        return agent;
      };

      return {
        items: [],
        running: false,
        mode: "build",
        model: DEFAULT_MODEL,
        keySet: null,
        pending: null,

        refreshKeyStatus: async () => {
          try {
            set({ keySet: await hasApiKey() });
          } catch {
            set({ keySet: false });
          }
        },

        setMode: (mode) => {
          set({ mode });
          agent?.setMode(mode);
        },

        setModel: (model) => {
          set({ model });
          agent?.setModel(model);
        },

        send: async (text) => {
          const trimmed = text.trim();
          if (!trimmed || get().running) return;
          const a = ensureAgent();
          a.setMode(get().mode);
          a.setModel(get().model);
          controller = new AbortController();
          a.setSignal(controller.signal);
          set((s) => ({ running: true, items: [...s.items, { id: nid(), kind: "user", text: trimmed }] }));
          try {
            await a.run(trimmed);
          } catch (e) {
            set((s) => ({ items: [...s.items, { id: nid(), kind: "error", text: e instanceof Error ? e.message : String(e) }] }));
          } finally {
            controller = null;
            approvalResolver = null;
            set({ running: false, pending: null });
          }
        },

        stop: () => {
          controller?.abort();
          approvalResolver?.(false);
          approvalResolver = null;
          set({ pending: null });
        },

        resolveApproval: (ok) => {
          approvalResolver?.(ok);
          approvalResolver = null;
          set({ pending: null });
        },

        newChat: () => {
          get().stop();
          agent?.clearConversation();
          agent = null;
          set({ items: [] });
        },
      };
    },
    {
      name: "salvador-ai-agent",
      partialize: (s) => ({ mode: s.mode, model: s.model }),
    },
  ),
);
