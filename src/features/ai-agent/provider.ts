/** Agent `Provider` backed by the Rust Anthropic proxy (`ai_agent_llm_stream`). */
import { Channel, invoke } from "@tauri-apps/api/core";
import type { Provider, ProviderChunk, ProviderRequest } from "@salvador/agent";
import { AI_PROVIDER } from "./keys";

/** Validate/normalise one chunk coming over the Tauri Channel. */
export function parseLlmChunk(raw: unknown): ProviderChunk | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case "text":
      return typeof c.text === "string" && c.text ? { type: "text", text: c.text } : null;
    case "tool_call": {
      const tc = (c.toolCall ?? c.tool_call) as Record<string, unknown> | undefined;
      if (!tc || typeof tc.id !== "string" || typeof tc.name !== "string") return null;
      return { type: "tool_call", toolCall: { id: tc.id, name: tc.name, args: tc.args ?? {} } };
    }
    case "done":
      return { type: "done" };
    case "error":
      return { type: "error", error: typeof c.error === "string" ? c.error : "unknown provider error" };
    default:
      return null;
  }
}

function describeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

let counter = 0;

export function createTauriProvider(providerName: string = AI_PROVIDER, maxTokens = 4096): Provider {
  return {
    name: providerName,
    async stream(req: ProviderRequest, onChunk) {
      const requestId = `req-${Date.now()}-${++counter}`;
      let sawError = false;
      const channel = new Channel<unknown>();
      channel.onmessage = (raw) => {
        const chunk = parseLlmChunk(raw);
        if (!chunk) return;
        if (chunk.type === "error") sawError = true;
        onChunk(chunk);
      };

      const onAbort = () => {
        void invoke("ai_agent_llm_cancel", { requestId }).catch(() => {});
      };
      if (req.signal?.aborted) return;
      req.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await invoke("ai_agent_llm_stream", {
          channel,
          req: {
            provider: providerName,
            model: req.model,
            messages: req.messages.map((m) => ({
              role: m.role,
              content: m.content,
              toolCallId: m.toolCallId,
              toolCalls: m.toolCalls,
            })),
            tools: req.tools,
            requestId,
            maxTokens,
          },
        });
      } catch (e) {
        if (!sawError && !req.signal?.aborted) onChunk({ type: "error", error: describeError(e) });
      } finally {
        req.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
