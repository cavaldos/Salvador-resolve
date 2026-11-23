import { z } from "zod";
import type { Asset } from "@salvador/core";
import { defineTool, type ToolContext } from "./types";

function assetById(ctx: ToolContext, id: string): Asset {
  const a = ctx.project.assets.find((x) => x.id === id);
  if (!a) throw new Error(`asset ${id} not found`);
  return a;
}

export const listAssets = defineTool({
  name: "list_assets",
  description: "List all media assets in the project with id, path, duration and streams.",
  kind: "inspect",
  input: z.object({}),
  async execute(_input, ctx) {
    return {
      summary: `${ctx.project.assets.length} asset(s)`,
      data: ctx.project.assets.map((a) => ({
        id: a.id,
        path: a.path,
        durationMs: a.durationMs,
        hasVideo: a.streams.some((s) => s.codecType === "video"),
        hasAudio: a.streams.some((s) => s.codecType === "audio"),
      })),
    };
  },
});

export const probeAsset = defineTool({
  name: "probe_asset",
  description: "Run ffprobe on an asset path or existing asset id and return its streams.",
  kind: "inspect",
  input: z.object({ assetId: z.string().optional(), path: z.string().optional() }),
  async execute(input, ctx) {
    const path = input.path ?? (input.assetId ? assetById(ctx, input.assetId).path : undefined);
    if (!path) throw new Error("assetId or path required");
    const r = await ctx.host.probe(path);
    return { summary: `probed ${path}`, data: r };
  },
});

export const getTimeline = defineTool({
  name: "get_timeline",
  description: "Return a compact JSON view of tracks and clips (times in ms).",
  kind: "inspect",
  input: z.object({}),
  async execute(_input, ctx) {
    return {
      summary: `${ctx.project.tracks.length} track(s)`,
      data: {
        settings: ctx.project.settings,
        tracks: ctx.project.tracks.map((t) => ({
          id: t.id,
          kind: t.kind,
          muted: t.muted,
          locked: t.locked,
          clips: t.clips.map((c) => ({
            id: c.id,
            assetId: c.assetId,
            inMs: c.inMs,
            outMs: c.outMs,
            startMs: c.startMs,
            speed: c.speed,
            volume: c.volume,
            effects: c.effects,
          })),
        })),
      },
    };
  },
});

export const transcribe = defineTool({
  name: "transcribe",
  description: "Transcribe an asset to word-level timestamps (requires the host transcriber).",
  kind: "inspect",
  input: z.object({ assetId: z.string() }),
  async execute(input, ctx) {
    if (!ctx.host.transcribe) throw new Error("transcription is not available in this host");
    const asset = assetById(ctx, input.assetId);
    const t = await ctx.host.transcribe(asset.path);
    ctx.transcripts?.set(t.id, t);
    return { summary: `transcribed ${t.segments.length} segment(s)`, data: t };
  },
});

export const searchTranscript = defineTool({
  name: "search_transcript",
  description: "Search stored transcripts for a phrase and return matching segments.",
  kind: "inspect",
  input: z.object({ query: z.string(), transcriptId: z.string().optional() }),
  async execute(input, ctx) {
    const all = [...(ctx.transcripts?.values() ?? [])];
    const list = input.transcriptId ? all.filter((t) => t.id === input.transcriptId) : all;
    const q = input.query.toLowerCase();
    const hits = list.flatMap((t) =>
      t.segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => ({ transcriptId: t.id, ...s })),
    );
    return { summary: `${hits.length} match(es)`, data: hits };
  },
});

export const detectSilence = defineTool({
  name: "detect_silence",
  description: "Detect silent ranges in an asset (requires the host detector).",
  kind: "inspect",
  input: z.object({ assetId: z.string(), thresholdDb: z.number().optional(), minDurationMs: z.number().int().optional() }),
  async execute(input, ctx) {
    if (!ctx.host.detectSilence) throw new Error("silence detection is not available in this host");
    const asset = assetById(ctx, input.assetId);
    const ranges = await ctx.host.detectSilence(asset.path, {
      thresholdDb: input.thresholdDb,
      minDurationMs: input.minDurationMs,
    });
    return { summary: `${ranges.length} silent range(s)`, data: ranges };
  },
});

export const detectScenes = defineTool({
  name: "detect_scenes",
  description: "Detect scene cuts in an asset (requires the host detector).",
  kind: "inspect",
  input: z.object({ assetId: z.string() }),
  async execute(input, ctx) {
    if (!ctx.host.detectScenes) throw new Error("scene detection is not available in this host");
    const asset = assetById(ctx, input.assetId);
    const scenes = await ctx.host.detectScenes(asset.path);
    return { summary: `${scenes.length} scene(s)`, data: scenes };
  },
});

export const describeFrames = defineTool({
  name: "describe_frames",
  description: "Extract frames at given timestamps for vision inspection.",
  kind: "inspect",
  input: z.object({ assetId: z.string(), timesMs: z.array(z.number().int()).min(1) }),
  async execute(input, ctx) {
    if (!ctx.host.extractFrames) throw new Error("frame extraction is not available in this host");
    const asset = assetById(ctx, input.assetId);
    const frames = await ctx.host.extractFrames(asset.path, input.timesMs);
    return { summary: `extracted ${frames.length} frame(s)`, data: frames };
  },
});
