import { describe, it, expect } from "vitest";
import { migrateProject } from "../timeline/schema";
import { addClip } from "../timeline/ops";
import { compileToFfmpeg } from "../compile";

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

describe("compile", () => {
  it("generates args", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const args = compileToFfmpeg(p2);
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("concat=n=1");
  });

  it("compiles effects and audio tracks", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const cid = p2.tracks[0].clips[0].id;
    const p3 = {
      ...p2,
      tracks: p2.tracks.map((t) =>
        t.id === "v1"
          ? { ...t, clips: t.clips.map((c) => ({ ...c, effects: [{ type: "fade" as const, inMs: 200 }] })) }
          : t,
      ),
    };
    const args = compileToFfmpeg(p3);
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("fade=t=in");
    expect(filter).toContain("[outa]");
    expect(cid).toBeTruthy();
  });

  it("preserves timeline gaps and delays audio", () => {
    const p = makeProject();
    const withAudio = {
      ...p,
      tracks: [...p.tracks, { id: "a1", kind: "audio" as const, clips: [], muted: false, locked: false }],
    };
    const p2 = addClip(withAudio, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const p3 = addClip(p2, { trackId: "v1", assetId: "a1", inMs: 2000, outMs: 4000, startMs: 3000 });
    const p4 = addClip(p3, { trackId: "a1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 1500 });
    const args = compileToFfmpeg(p4);
    const filter = args[args.indexOf("-filter_complex") + 1];

    expect(filter).toContain("tpad=start_mode=add:start_duration=1.000:start_color=black");
    expect(filter).toContain("adelay=1500:all=1");
  });

  it("chains atempo for speeds outside ffmpeg's single-filter range", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 4000, startMs: 0, speed: 4 });
    const args = compileToFfmpeg(p2);
    const filter = args[args.indexOf("-filter_complex") + 1];

    expect(filter).toContain("atempo=2,atempo=2");
    expect(filter).not.toContain("atempo=4");

    const slow = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 1000, startMs: 0, speed: 0.25 });
    const slowArgs = compileToFfmpeg(slow);
    const slowFilter = slowArgs[slowArgs.indexOf("-filter_complex") + 1];
    expect(slowFilter).toContain("atempo=0.5,atempo=0.5");
  });

  it("tiktok preset dimensions", () => {
    const p = makeProject();
    const p2 = addClip(p, { trackId: "v1", assetId: "a1", inMs: 0, outMs: 2000, startMs: 0 });
    const args = compileToFfmpeg(p2, { preset: "tiktok-9x16" });
    expect(args).toContain("1080x1920");
  });
});
