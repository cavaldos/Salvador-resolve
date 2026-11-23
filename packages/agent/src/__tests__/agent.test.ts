import { describe, it, expect } from "vitest";
import { ProjectSchema, type Host, type Project } from "@salvador/core";
import { Agent } from "../agent";
import { resolvePermission } from "../permissions";
import type { Provider, ProviderChunk } from "../types";

function makeProject(): Project {
  return ProjectSchema.parse({
    schemaVersion: 2,
    id: "p1",
    name: "test",
    settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    assets: [{ id: "a1", path: "/x.mp4", hash: "h", durationMs: 5000, streams: [] }],
    tracks: [{ id: "video-1", kind: "video", clips: [], muted: false, locked: false }],
    markers: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
}

function fakeHost(): Host {
  return {
    async probe() {
      return { path: "/x.mp4", durationMs: 5000, streams: [] };
    },
    async runFfmpeg() {},
    onJobProgress() {
      return () => {};
    },
    async cancelJob() {},
    async readProject() {
      return makeProject();
    },
    async writeProject() {},
    async llmStream() {},
  };
}

function scriptedProvider(steps: ProviderChunk[][]): Provider {
  let i = 0;
  return {
    name: "fake",
    async stream(_req, onChunk) {
      const step = steps[Math.min(i, steps.length - 1)];
      i++;
      for (const c of step) onChunk(c);
    },
  };
}

describe("permissions", () => {
  it("allows inspect and asks for destructive tools", () => {
    expect(resolvePermission("list_assets", "inspect")).toBe("allow");
    expect(resolvePermission("render_final", "output")).toBe("ask");
    expect(resolvePermission("delete_clip", "edit")).toBe("ask");
    expect(resolvePermission("add_clip", "edit")).toBe("allow");
    expect(resolvePermission("add_clip", "edit", { tools: { add_clip: "deny" } })).toBe("deny");
  });
});

describe("agent", () => {
  it("executes a tool and returns final text", async () => {
    const provider = scriptedProvider([
      [{ type: "tool_call", toolCall: { id: "t1", name: "get_timeline", args: {} } }],
      [{ type: "text", text: "Done." }],
    ]);
    const agent = new Agent({ host: fakeHost(), project: makeProject(), provider, model: "fake" });
    const result = await agent.run("show me the timeline");
    expect(result.text).toBe("Done.");
    expect(result.messages.some((m) => m.role === "tool")).toBe(true);
  });

  it("mutates the project and calls onSnapshot", async () => {
    const provider = scriptedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "t1",
            name: "add_clip",
            args: { trackId: "video-1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 },
          },
        },
      ],
      [{ type: "text", text: "Added." }],
    ]);
    let snapshots = 0;
    const agent = new Agent({
      host: fakeHost(),
      project: makeProject(),
      provider,
      model: "fake",
      callbacks: { onSnapshot: () => snapshots++ },
    });
    const result = await agent.run("add the clip");
    expect(snapshots).toBe(1);
    expect(result.project.tracks[0].clips).toHaveLength(1);
  });

  it("plan mode exposes no tools", async () => {
    let seenTools: unknown[] = [];
    const provider: Provider = {
      name: "fake",
      async stream(req, onChunk) {
        seenTools = req.tools;
        onChunk({ type: "text", text: "1. Inspect. 2. Edit." });
      },
    };
    const agent = new Agent({
      host: fakeHost(),
      project: makeProject(),
      provider,
      model: "fake",
      options: { mode: "plan" },
    });
    const r = await agent.run("plan");
    expect(seenTools).toHaveLength(0);
    expect(r.text).toContain("Inspect");
  });
});
