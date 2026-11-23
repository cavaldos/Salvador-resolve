import { describe, it, expect } from "vitest";
import { ProjectSchema, StreamInfoSchema, migrateProject, parseProject, type Asset } from "../timeline/schema";
import { addAsset } from "../timeline/ops";

const base = {
  schemaVersion: 1,
  id: "p1",
  name: "test",
  settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
  assets: [],
  tracks: [],
  markers: [],
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("schema", () => {
  it("migrates v1 to v2", () => {
    const p = migrateProject(base);
    expect(p.schemaVersion).toBe(2);
    expect(p.id).toBe("p1");
  });

  it("migrates v1 effects", () => {
    const v1 = {
      ...base,
      tracks: [
        {
          id: "v1",
          kind: "video",
          clips: [
            {
              id: "c1",
              assetId: "a1",
              inMs: 0,
              outMs: 1000,
              startMs: 0,
              effects: [{ type: "crop", params: { x: 0, y: 0, width: 100, height: 100 } }],
            },
          ],
        },
      ],
    };
    const p = migrateProject(v1);
    expect(p.tracks[0].clips[0].effects[0]).toEqual({ type: "crop", x: 0, y: 0, width: 100, height: 100 });
  });

  it("parses v2 project", () => {
    const v2 = { ...base, schemaVersion: 2 };
    const p = parseProject(v2);
    expect(p.schemaVersion).toBe(2);
  });

  const nativeAsset = {
    id: "a1", path: "/video.mp4", hash: "video", durationMs: 1000,
    streams: [
      { index: 0, codecType: "video", codecName: "h264", width: 1920, height: 1080, fps: 30,
        sampleRate: null, channels: null, durationMs: 1000, bitRate: null },
      { index: 1, codecType: "audio", codecName: null, width: null, height: null, fps: null,
        sampleRate: 48000, channels: 2, durationMs: null, bitRate: 128000 },
    ],
  };

  it("accepts native null metadata through the import addAsset boundary", () => {
    // Tauri invoke's generic type does not validate its JSON payload at runtime.
    const p = addAsset(parseProject({ ...base, schemaVersion: 2 }), nativeAsset as unknown as Asset);
    expect(p.assets[0].streams).toEqual([
      { ...nativeAsset.streams[0], sampleRate: undefined, channels: undefined, bitRate: undefined },
      { ...nativeAsset.streams[1], codecName: undefined, width: undefined, height: undefined,
        fps: undefined, durationMs: undefined },
    ]);
    expect(JSON.stringify(p)).not.toContain(":null");
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it.each([1, 2])("normalizes persisted v%s native metadata", (schemaVersion) => {
    const p = parseProject({ ...base, schemaVersion, assets: [nativeAsset] });
    expect(p.assets[0].streams[0].sampleRate).toBeUndefined();
    expect(p.assets[0].streams[1].width).toBeUndefined();
    expect(p.assets[0].streams[1].sampleRate).toBe(48000);
  });

  it.each(["width", "height", "fps", "sampleRate", "channels", "durationMs", "bitRate"])(
    "still validates numeric %s metadata", (field) => {
      for (const value of [-1, "123", NaN, "bad", true]) {
        expect(StreamInfoSchema.safeParse({ index: 0, codecType: "video", [field]: value }).success).toBe(false);
      }
      if (!["durationMs", "bitRate"].includes(field)) {
        expect(StreamInfoSchema.safeParse({ index: 0, codecType: "video", [field]: 0 }).success).toBe(false);
      }
      if (field !== "fps") {
        expect(StreamInfoSchema.safeParse({ index: 0, codecType: "video", [field]: 1.5 }).success).toBe(false);
      }
    },
  );

  it("keeps required metadata required and optional metadata optional", () => {
    expect(StreamInfoSchema.parse({ index: 0, codecType: "video" })).toEqual({ index: 0, codecType: "video" });
    expect(StreamInfoSchema.safeParse({ index: null, codecType: "video" }).success).toBe(false);
    expect(StreamInfoSchema.safeParse({ index: 0, codecType: null }).success).toBe(false);
    expect(() => parseProject({ ...base, schemaVersion: 2, assets: [{ ...nativeAsset, durationMs: null }] })).toThrow();
  });

  it("rejects invalid project", () => {
    expect(() => ProjectSchema.parse({ ...base, schemaVersion: 2, settings: { width: 0 } })).toThrow();
  });
});
