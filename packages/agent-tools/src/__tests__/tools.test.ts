import { describe, it, expect } from "vitest";
import { ProjectSchema, type Host, type Project } from "@salvador/core";
import { addClipTool, addMusicTool, cropReframeTool } from "../edit";
import { getTimeline, listAssets } from "../inspect";
import type { ToolContext } from "../types";

function makeProject(): Project {
  return ProjectSchema.parse({
    schemaVersion: 2,
    id: "p1",
    name: "test",
    settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    assets: [
      { id: "a1", path: "/x.mp4", hash: "h", durationMs: 5000, streams: [{ index: 0, codecType: "video" }] },
      { id: "m1", path: "/m.mp3", hash: "h2", durationMs: 3000, streams: [{ index: 0, codecType: "audio" }] },
    ],
    tracks: [
      { id: "video-1", kind: "video", clips: [], muted: false, locked: false },
      { id: "audio-1", kind: "audio", clips: [], muted: false, locked: false },
    ],
    markers: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
}

function ctx(): ToolContext {
  let project = makeProject();
  const host: Host = {
    async probe() {
      return { path: "/x.mp4", durationMs: 5000, streams: [] };
    },
    async runFfmpeg() {},
    onJobProgress() {
      return () => {};
    },
    async cancelJob() {},
    async readProject() {
      return project;
    },
    async writeProject() {},
    async llmStream() {},
  };
  return {
    host,
    get project() {
      return project;
    },
    setProject(p) {
      project = p;
    },
  } as ToolContext;
}

describe("tools", () => {
  it("lists assets", async () => {
    const c = ctx();
    const r = await listAssets.execute({}, c);
    expect(r.summary).toContain("2 asset");
  });

  it("adds a clip", async () => {
    const c = ctx();
    await addClipTool.execute({ trackId: "video-1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 }, c);
    expect(c.project.tracks[0].clips).toHaveLength(1);
  });

  it("reframes a clip", async () => {
    const c = ctx();
    const r = await addClipTool.execute({ trackId: "video-1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 }, c);
    const clipId = c.project.tracks[0].clips[0].id;
    await cropReframeTool.execute({ clipId, aspect: "9:16" }, c);
    expect(c.project.tracks[0].clips[0].effects[0].type).toBe("scale");
    expect(r.summary).toContain("added clip");
  });

  it("adds music to an audio track", async () => {
    const c = ctx();
    await addMusicTool.execute({ assetId: "m1", startMs: 0, volume: 0.3 }, c);
    expect(c.project.tracks[1].clips).toHaveLength(1);
  });

  it("get_timeline returns tracks", async () => {
    const c = ctx();
    const r = await getTimeline.execute({}, c);
    expect((r.data as { tracks: unknown[] }).tracks).toHaveLength(2);
  });
});
