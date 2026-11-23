import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Clip, Track } from "@/types";

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => undefined as unknown),
  handler: null as null | ((e: { payload: unknown }) => void),
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", async (orig) => ({ ...(await orig<object>()), invoke: h.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, cb: (e: { payload: unknown }) => void) => {
    h.handler = cb;
    return h.unlisten;
  }),
}));

import { defineTool, zod as z, type ToolDefinition } from "@salvador/tools";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { EDITOR_TOOLS, DEFAULT_PERMISSIONS, LONG_RUNNING_TOOLS } from "@/features/ai-agent/tools";
import { McpBridgeClient, type ApprovalRequest } from "../bridgeClient";

const askDefaults = { ...DEFAULT_PERMISSIONS.tools } as Record<string, "ask">;

function resolved() {
  return h.invoke.mock.calls
    .filter(([cmd]) => cmd === "mcp_resolve_call")
    .map(([, a]) => a as { callId: string; result: { isError: boolean; content: Array<{ text: string }> } });
}
function registered() {
  return h.invoke.mock.calls.filter(([cmd]) => cmd === "mcp_register_tools").map(([, a]) => (a as { tools: Array<{ name: string }> }).tools);
}
function lastRegistered() {
  const all = registered();
  return all[all.length - 1];
}
function fire(callId: string, name: string, args: unknown = {}, clientName = "test-agent") {
  h.handler!({ payload: { callId, name, arguments: args, clientName } });
}

function client(tools: readonly ToolDefinition[], approve = vi.fn(async (_: ApprovalRequest) => true), policy: "ask" | "allow" | "readonly" = "ask") {
  return new McpBridgeClient({ tools, longRunning: LONG_RUNNING_TOOLS, askDefaults, policy, approve });
}

beforeEach(() => {
  h.invoke.mockClear();
  h.unlisten.mockClear();
  h.handler = null;
});

describe("McpBridgeClient", () => {
  it("registers the manifest on start and clears it on dispose", async () => {
    const c = client(EDITOR_TOOLS);
    await c.start();
    expect(registered()[0].map((t) => t.name)).toContain("split_clip");
    await c.dispose();
    expect(h.unlisten).toHaveBeenCalled();
    expect(lastRegistered()).toEqual([]);
  });

  it("runs calls strictly in arrival order even when the first is slower", async () => {
    const order: string[] = [];
    const tools = [
      defineTool({ name: "slow", description: "", kind: "inspect", input: z.object({}), execute: async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push("slow");
        return { summary: "slow" };
      } }),
      defineTool({ name: "fast", description: "", kind: "inspect", input: z.object({}), execute: async () => {
        order.push("fast");
        return { summary: "fast" };
      } }),
    ] as unknown as ToolDefinition[];
    const c = client(tools);
    await c.start();
    fire("1", "slow");
    fire("2", "fast");
    await c.idle();
    expect(order).toEqual(["slow", "fast"]);
    expect(resolved().map((r) => r.callId)).toEqual(["1", "2"]);
  });

  it("asks for approval with the client name and answers isError when denied", async () => {
    const approve = vi.fn(async () => false);
    const c = client(EDITOR_TOOLS, approve);
    await c.start();
    fire("9", "delete_clip", { clipId: "c1" }, "claude-code");
    await c.idle();
    expect(approve).toHaveBeenCalledWith({ clientName: "claude-code", toolName: "delete_clip", args: { clipId: "c1", ripple: false } });
    expect(resolved()[0].result.isError).toBe(true);
    expect(resolved()[0].result.content[0].text).toContain("denied by user");
  });

  it("read-only never executes a mutating tool even if a stale manifest let the call through", async () => {
    const exec = vi.fn(async () => ({ summary: "mutated" }));
    const tools = [defineTool({ name: "mutate", description: "", kind: "edit", input: z.object({}), execute: exec })] as unknown as ToolDefinition[];
    const c = client(tools, vi.fn(async () => true), "readonly");
    await c.start();
    expect(registered()[0]).toEqual([]);
    fire("1", "mutate");
    await c.idle();
    expect(exec).not.toHaveBeenCalled();
    expect(resolved()[0].result.isError).toBe(true);
  });

  it("setPolicy re-registers the manifest", async () => {
    const c = client(EDITOR_TOOLS);
    await c.start();
    await c.setPolicy("readonly");
    expect(lastRegistered().map((t) => t.name)).not.toContain("split_clip");
  });

  it("an answer failure does not wedge the queue", async () => {
    const c = client(EDITOR_TOOLS);
    await c.start();
    h.invoke.mockImplementationOnce(async () => {
      throw new Error("ipc down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fire("1", "list_tracks");
    fire("2", "list_tracks");
    await c.idle();
    expect(resolved().map((r) => r.callId)).toEqual(["1", "2"]);
    spy.mockRestore();
  });

  it("an MCP edit on the real stores is one undo step", async () => {
    const track: Track = { id: "v1", name: "Video 1", type: "video", locked: false, muted: false, visible: true, height: 80 };
    const clip = { id: "c1", trackId: "v1", mediaId: "m1", startTime: 0, duration: 10, trimIn: 0, trimOut: 10, x: 0, y: 0, width: 1920, height: 1080, opacity: 1, rotation: 0, speed: 1, volume: 1, kind: "video" } as Clip;
    useHistoryStore.getState().clear();
    useTimelineStore.setState({ tracks: [track], clips: [clip], gaps: [], transitions: [], mainVideoTrackId: "v1", epoch: 0 });
    useProjectStore.setState({
      project: { id: "p1", name: "T", canvasWidth: 1920, canvasHeight: 1080, frameRate: 30 } as never,
      mediaAssets: [{ id: "m1", name: "a.mp4", path: "/tmp/a.mp4", type: "video", duration: 20, size: 1 } as never],
    });
    const c = client(EDITOR_TOOLS);
    await c.start();
    fire("1", "split_clip", { clipId: "c1", time: 4 });
    await c.idle();
    expect(resolved()[0].result.isError).toBe(false);
    expect(useTimelineStore.getState().clips).toHaveLength(2);
    useHistoryStore.getState().undo();
    expect(useTimelineStore.getState().clips.map((x) => [x.id, x.duration])).toEqual([["c1", 10]]);
  });
});
