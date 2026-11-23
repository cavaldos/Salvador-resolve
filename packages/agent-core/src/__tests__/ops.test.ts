import { describe, it, expect } from "vitest";
import { migrateProject } from "../timeline/schema";
import { addClip, trimClip, splitClip, rippleDelete, setSpeed, removeRanges } from "../timeline/ops";

function makeProject() {
  return migrateProject({
    schemaVersion: 1,
    id: "p1",
    name: "test",
    settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    assets: [{ id: "a1", path: "/x.mp4", hash: "h", durationMs: 10000, streams: [] }],
    tracks: [{ id: "v1", kind: "video", clips: [], muted: false, locked: false }],
    markers: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
}

describe("ops", () => {
  it("addClip and invariants", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    expect(p2.tracks[0].clips).toHaveLength(1);
    expect(() => addClip(p2, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 1000 })).toThrow();
  });

  it("trimClip validates", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const cid = p2.tracks[0].clips[0].id;
    const p3 = trimClip(p2, cid, { outMs: 1500 });
    expect(p3.tracks[0].clips[0].outMs).toBe(1500);
    expect(() => trimClip(p3, cid, { inMs: 2000 })).toThrow();
  });

  it("splitClip", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const cid = p2.tracks[0].clips[0].id;
    const p3 = splitClip(p2, cid, 1000);
    expect(p3.tracks[0].clips).toHaveLength(2);
  });

  it("deleteClip and rippleDelete", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 });
    const p3 = addClip(p2, { trackId: "v1", assetId: "a1", inMs: 1000, outMs: 2000, startMs: 1000 });
    const cid = p3.tracks[0].clips[0].id;
    const p4 = rippleDelete(p3, cid);
    expect(p4.tracks[0].clips).toHaveLength(1);
    expect(p4.tracks[0].clips[0].startMs).toBe(0);
  });

  it("setSpeed", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const cid = p2.tracks[0].clips[0].id;
    const p3 = setSpeed(p2, cid, 2);
    expect(p3.tracks[0].clips[0].speed).toBe(2);
    expect(() => setSpeed(p3, cid, 0)).toThrow();
  });

  it("rejects negative timeline positions and speed changes that overlap", () => {
    const p = makeProject();
    const first = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const second = addClip(first, { trackId: "v1", assetId: "a1", inMs: 2000, outMs: 4000, startMs: 2500 });
    expect(() => setSpeed(second, second.tracks[0].clips[0].id, 0.5)).toThrow();
    expect(() => trimClip(second, second.tracks[0].clips[0].id, { startMs: -1 })).toThrow();
  });

  it("locked track immutable", () => {
    const p = makeProject();
    p.tracks[0].locked = true;
    expect(() => addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0 })).toThrow();
  });

  it("removeRanges", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 5000, startMs: 0 });
    const p3 = removeRanges(p2, "a1", [{ startMs: 1000, endMs: 2000 }]);
    // clip split into two pieces
    expect(p3.tracks[0].clips.length).toBe(2);
  });
});
