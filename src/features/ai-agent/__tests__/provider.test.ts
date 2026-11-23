import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ channel: null as null | { onmessage: (m: unknown) => void }, calls: [] as Array<[string, unknown]>, impl: null as null | ((cmd: string, args: any) => Promise<unknown>) }));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: (m: unknown) => void = () => {};
    constructor() {
      state.channel = this;
    }
  },
  invoke: (cmd: string, args: unknown) => {
    state.calls.push([cmd, args]);
    return state.impl ? state.impl(cmd, args) : Promise.resolve();
  },
}));

import { createTauriProvider, parseLlmChunk } from "../provider";
import type { ProviderChunk } from "@salvador/agent";

beforeEach(() => {
  state.calls = [];
  state.impl = null;
  state.channel = null;
});

describe("parseLlmChunk", () => {
  it("parses text, tool_call (camelCase and snake_case), done, error", () => {
    expect(parseLlmChunk({ type: "text", text: "hi" })).toEqual({ type: "text", text: "hi" });
    expect(parseLlmChunk({ type: "tool_call", toolCall: { id: "1", name: "split_clip", args: { a: 1 } } })).toEqual({
      type: "tool_call",
      toolCall: { id: "1", name: "split_clip", args: { a: 1 } },
    });
    expect(parseLlmChunk({ type: "tool_call", tool_call: { id: "2", name: "x" } })).toEqual({
      type: "tool_call",
      toolCall: { id: "2", name: "x", args: {} },
    });
    expect(parseLlmChunk({ type: "done" })).toEqual({ type: "done" });
    expect(parseLlmChunk({ type: "error", error: "boom" })).toEqual({ type: "error", error: "boom" });
  });

  it("drops malformed chunks", () => {
    expect(parseLlmChunk(null)).toBeNull();
    expect(parseLlmChunk("x")).toBeNull();
    expect(parseLlmChunk({ type: "text", text: "" })).toBeNull();
    expect(parseLlmChunk({ type: "tool_call", toolCall: { id: 1 } })).toBeNull();
    expect(parseLlmChunk({ type: "weird" })).toBeNull();
  });
});

describe("createTauriProvider", () => {
  const req = {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    messages: [{ role: "user" as const, content: "hello" }],
    tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
    stream: true,
  };

  it("forwards streamed chunks and sends the request to the Rust command", async () => {
    state.impl = async () => {
      state.channel!.onmessage({ type: "text", text: "he" });
      state.channel!.onmessage({ type: "text", text: "llo" });
      state.channel!.onmessage({ type: "tool_call", toolCall: { id: "a", name: "t", args: {} } });
      state.channel!.onmessage({ type: "done" });
    };
    const got: ProviderChunk[] = [];
    await createTauriProvider().stream(req, (c) => got.push(c));
    expect(got.map((c) => c.type)).toEqual(["text", "text", "tool_call", "done"]);
    const [cmd, args] = state.calls[0] as [string, any];
    expect(cmd).toBe("ai_agent_llm_stream");
    expect(args.req).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hello" }] });
    expect(typeof args.req.requestId).toBe("string");
  });

  it("surfaces invoke rejection as an error chunk (once)", async () => {
    state.impl = async () => {
      throw "anthropic 401: bad key";
    };
    const got: ProviderChunk[] = [];
    await createTauriProvider().stream(req, (c) => got.push(c));
    expect(got).toEqual([{ type: "error", error: "anthropic 401: bad key" }]);
  });

  it("does not duplicate an error already sent over the channel", async () => {
    state.impl = async () => {
      state.channel!.onmessage({ type: "error", error: "overloaded" });
      throw "overloaded";
    };
    const got: ProviderChunk[] = [];
    await createTauriProvider().stream(req, (c) => got.push(c));
    expect(got).toHaveLength(1);
  });

  it("cancels the Rust stream on abort", async () => {
    const ac = new AbortController();
    state.impl = async (cmd) => {
      if (cmd === "ai_agent_llm_stream") ac.abort();
    };
    await createTauriProvider().stream({ ...req, signal: ac.signal }, () => {});
    expect(state.calls.map((c) => c[0])).toContain("ai_agent_llm_cancel");
  });
});
