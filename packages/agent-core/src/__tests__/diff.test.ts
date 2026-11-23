import { describe, it, expect } from "vitest";
import { migrateProject } from "../timeline/schema";
import { diffTimeline } from "../timeline/diff";
import { addClip } from "../timeline/ops";

describe("diff", () => {
  it("detects added clip", () => {
    const base = migrateProject({
      schemaVersion: 1,
      id: "p1",
      name: "test",
      settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
      assets: [{ id: "a1", path: "/x.mp4", hash: "h", durationMs: 5000, streams: [] }],
      tracks: [{ id: "v1", kind: "video", clips: [], muted: false, locked: false }],
      markers: [],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const next = addClip(base, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 });
    const changes = diffTimeline(base, next);
    expect(changes.some((c) => c.kind === "added" && c.path.includes("clip"))).toBe(true);
  });
});
