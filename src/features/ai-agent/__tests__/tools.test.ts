import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Clip, Track } from "@/types";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", async (orig) => ({ ...(await orig<object>()), invoke: invokeMock }));

import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { EDITOR_TOOLS, findEditorTool, findQuietRanges } from "../tools";
import { resolvePermission } from "@salvador/agent";

const videoTrack: Track = { id: "v1", name: "Video 1", type: "video", locked: false, muted: false, visible: true, height: 80 };
const lockedTrack: Track = { id: "v2", name: "Locked", type: "video", locked: true, muted: false, visible: true, height: 80 };

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    trackId: "v1",
    mediaId: "m1",
    startTime: 0,
    duration: 10,
    trimIn: 0,
    trimOut: 10,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    opacity: 1,
    rotation: 0,
    speed: 1,
    volume: 1,
    kind: "video",
    ...over,
  };
}

async function run(name: string, args: unknown = {}) {
  const tool = findEditorTool(name)!;
  expect(tool, `tool ${name}`).toBeTruthy();
  return tool.execute(tool.input.parse(args), {} as never);
}

const snapshot = () => JSON.parse(JSON.stringify(useTimelineStore.getState().clips)) as Clip[];
const undo = () => useHistoryStore.getState().undo();

beforeEach(() => {
  invokeMock.mockReset();
  useHistoryStore.getState().clear();
  useTimelineStore.setState({
    tracks: [videoTrack, lockedTrack],
    clips: [clip(), clip({ id: "c2", startTime: 12, duration: 4, trimOut: 4, mediaId: "m1" }), clip({ id: "locked", trackId: "v2" })],
    gaps: [],
    transitions: [],
    mainVideoTrackId: "v1",
    epoch: 0,
  });
  useProjectStore.setState({
    project: { id: "p1", name: "Test", canvasWidth: 1920, canvasHeight: 1080, frameRate: 30 } as never,
    mediaAssets: [{ id: "m1", name: "a.mp4", path: "/tmp/a.mp4", type: "video", duration: 20, size: 1 } as never],
  });
});

describe("inspect tools", () => {
  it("get_project_info / list_clips / list_tracks / list_media_assets / get_playhead", async () => {
    const info = (await run("get_project_info")).data as { name: string; clips: number; duration: number };
    expect(info).toMatchObject({ name: "Test", clips: 3 });
    expect(info.duration).toBeGreaterThanOrEqual(16);

    const clips = (await run("list_clips", { trackId: "v1" })).data as Array<{ id: string }>;
    expect(clips.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(((await run("list_tracks")).data as unknown[]).length).toBe(2);
    expect(((await run("list_media_assets")).data as Array<{ id: string }>)[0].id).toBe("m1");
    expect((await run("get_playhead")).data).toHaveProperty("time");
  });

  it("every tool has a unique name and kind", () => {
    const names = EDITOR_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(EDITOR_TOOLS.find((t) => t.name === "start_export")!.kind).toBe("output");
  });

  it("permissions: destructive and output tools ask", () => {
    const perms = { default: "allow" as const, tools: { delete_clip: "ask", start_export: "ask" } as const };
    expect(resolvePermission("start_export", "output", { ...perms, tools: { ...perms.tools } })).toBe("ask");
    expect(resolvePermission("delete_clip", "edit", { ...perms, tools: { ...perms.tools } })).toBe("ask");
    expect(resolvePermission("list_clips", "inspect")).toBe("allow");
    expect(resolvePermission("start_export", "output")).toBe("ask");
  });
});

describe("edit tools go through history and undo", () => {
  it("split_clip", async () => {
    const before = snapshot();
    await run("split_clip", { clipId: "c1", time: 4 });
    const after = useTimelineStore.getState().clips.filter((c) => c.trackId === "v1" && c.startTime < 11);
    expect(after).toHaveLength(2);
    expect(after.map((c) => Math.round(c.duration))).toEqual([4, 6]);
    undo();
    expect(snapshot().map((c) => [c.id, c.startTime, c.duration])).toEqual(before.map((c) => [c.id, c.startTime, c.duration]));
  });

  it("delete_clip (lift) and undo", async () => {
    await run("delete_clip", { clipId: "c2" });
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c2")).toBeUndefined();
    undo();
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c2")).toBeTruthy();
  });

  it("trim_clip start+end and undo", async () => {
    await run("trim_clip", { clipId: "c1", start: 2, end: 8 });
    const c = useTimelineStore.getState().clips.find((x) => x.id === "c1")!;
    expect(c).toMatchObject({ startTime: 2, duration: 6, trimIn: 2, trimOut: 8 });
    undo();
    const o = useTimelineStore.getState().clips.find((x) => x.id === "c1")!;
    expect(o).toMatchObject({ startTime: 0, duration: 10, trimIn: 0, trimOut: 10 });
  });

  it("trim_clip rejects extending past source and too-short clips", async () => {
    await expect(run("trim_clip", { clipId: "c2", end: 40 })).rejects.toThrow(/past the end/);
    await expect(run("trim_clip", { clipId: "c1", start: 5, end: 5.01 })).rejects.toThrow(/too short/);
  });

  it("move_clip, overlap rejection, and undo", async () => {
    await run("move_clip", { clipId: "c2", start: 20 });
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c2")!.startTime).toBe(20);
    undo();
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c2")!.startTime).toBe(12);
    await expect(run("move_clip", { clipId: "c2", start: 5 })).rejects.toThrow(/overlap/);
  });

  it("set_clip_volume and undo", async () => {
    await run("set_clip_volume", { clipId: "c1", volume: 0.25 });
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c1")!.volume).toBe(0.25);
    undo();
    expect(useTimelineStore.getState().clips.find((c) => c.id === "c1")!.volume).toBe(1);
  });

  it("refuses to edit clips on locked tracks and unknown clips", async () => {
    await expect(run("delete_clip", { clipId: "locked" })).rejects.toThrow(/locked/);
    await expect(run("set_clip_volume", { clipId: "nope", volume: 0 })).rejects.toThrow(/not found/);
  });

  it("add_text_clip adds a text clip and undo removes it", async () => {
    const n = useTimelineStore.getState().clips.length;
    const res = await run("add_text_clip", { text: "Hello", start: 1, duration: 2 });
    const id = (res.data as { clipId: string }).clipId;
    const added = useTimelineStore.getState().clips.find((c) => c.id === id)!;
    expect(added).toMatchObject({ kind: "text", startTime: 1, duration: 2 });
    expect(useTimelineStore.getState().clips.length).toBe(n + 1);
    undo();
    expect(useTimelineStore.getState().clips.find((c) => c.id === id)).toBeUndefined();
  });

  it("add_captions maps whisper segments onto text clips as ONE undo step", async () => {
    invokeMock.mockResolvedValueOnce([
      { text: "hi there", startMs: 1000, endMs: 2500 },
      { text: "second", startMs: 3000, endMs: 4000 },
      { text: "out of range", startMs: 99000, endMs: 100000 },
    ]);
    const n = useTimelineStore.getState().clips.length;
    const res = await run("add_captions", { clipId: "c1" });
    expect((res.data as { count: number }).count).toBe(2);
    expect(useTimelineStore.getState().clips.length).toBe(n + 2);
    expect(invokeMock).toHaveBeenCalledWith("generate_auto_captions", expect.objectContaining({ videoPath: "/tmp/a.mp4" }));
    undo();
    expect(useTimelineStore.getState().clips.length).toBe(n);
  });
});

describe("remove_silences", () => {
  it("findQuietRanges finds runs >= min length", () => {
    expect(findQuietRanges([1, 0, 0, 0, 1, 0, 1], 1, 0.5, 2)).toEqual([[1, 4]]);
  });

  it("cuts the silent middle with ripple and undoes in one step", async () => {
    // 10s clip, 0.05s buckets -> 200 buckets; silence from 4s to 6s (buckets 80..119)
    const buckets = Array.from({ length: 200 }, (_, i) => ({ peak: 1, rms: i >= 80 && i < 120 ? 0 : 1 }));
    invokeMock.mockResolvedValueOnce(buckets);
    const res = await run("remove_silences", { clipId: "c1", padding: 0, minSilence: 0.5 });
    expect((res.data as { removed: number }).removed).toBe(1);
    const v1 = useTimelineStore.getState().clips.filter((c) => c.trackId === "v1" && c.startTime < 9);
    const total = v1.reduce((s, c) => s + c.duration, 0);
    expect(total).toBeCloseTo(8, 1);
    undo();
    const restored = useTimelineStore.getState().clips.filter((c) => c.trackId === "v1");
    expect(restored.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(restored.find((c) => c.id === "c1")!.duration).toBe(10);
  });
});

describe("start_export", () => {
  it("is kind output and validates presets", () => {
    const tool = findEditorTool("start_export")!;
    expect(tool.input.safeParse({ preset: "1080p-fast" }).success).toBe(true);
    expect(tool.input.safeParse({ preset: "bogus" }).success).toBe(false);
  });
});
