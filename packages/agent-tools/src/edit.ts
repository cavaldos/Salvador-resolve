import { z } from "zod";
import {
  addClip,
  addEffect,
  addTrack,
  addTransition,
  deleteClip,
  moveClip,
  removeRanges,
  rippleDelete,
  setSpeed,
  setVolume,
  splitClip,
  trimClip,
  addSubtitleTrackFromTranscript,
  type Project,
} from "@salvador/core";
import { defineTool, type ToolContext } from "./types";

function commit(ctx: ToolContext, p: Project, summary: string) {
  ctx.setProject(p);
  return { summary };
}

function assetDuration(ctx: ToolContext, assetId: string): number {
  const a = ctx.project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`asset ${assetId} not found`);
  return a.durationMs;
}

export const addClipTool = defineTool({
  name: "add_clip",
  description: "Add a clip from an asset to a track. Times are milliseconds in the source asset.",
  kind: "edit",
  input: z.object({
    trackId: z.string(),
    assetId: z.string(),
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().positive(),
    startMs: z.number().int().nonnegative().default(0),
    speed: z.number().positive().optional(),
    volume: z.number().min(0).max(4).optional(),
  }),
  async execute(input, ctx) {
    const p = addClip(ctx.project, input);
    return commit(ctx, p, `added clip from ${input.assetId}`);
  },
});

export const trimClipTool = defineTool({
  name: "trim_clip",
  description: "Trim a clip's source in/out points and/or timeline start.",
  kind: "edit",
  input: z.object({
    clipId: z.string(),
    inMs: z.number().int().nonnegative().optional(),
    outMs: z.number().int().positive().optional(),
    startMs: z.number().int().nonnegative().optional(),
  }),
  async execute(input, ctx) {
    const { clipId, ...patch } = input;
    return commit(ctx, trimClip(ctx.project, clipId, patch), `trimmed ${clipId}`);
  },
});

export const splitClipTool = defineTool({
  name: "split_clip",
  description: "Split a clip at an absolute timeline position in ms.",
  kind: "edit",
  input: z.object({ clipId: z.string(), atMs: z.number().int().nonnegative() }),
  async execute(input, ctx) {
    return commit(ctx, splitClip(ctx.project, input.clipId, input.atMs), `split ${input.clipId} at ${input.atMs}ms`);
  },
});

export const moveClipTool = defineTool({
  name: "move_clip",
  description: "Move a clip to a new timeline start, optionally onto another track.",
  kind: "edit",
  input: z.object({ clipId: z.string(), startMs: z.number().int().nonnegative(), trackId: z.string().optional() }),
  async execute(input, ctx) {
    return commit(ctx, moveClip(ctx.project, input.clipId, { startMs: input.startMs, trackId: input.trackId }), `moved ${input.clipId}`);
  },
});

export const deleteClipTool = defineTool({
  name: "delete_clip",
  description: "Delete a clip, leaving a gap.",
  kind: "edit",
  input: z.object({ clipId: z.string() }),
  async execute(input, ctx) {
    return commit(ctx, deleteClip(ctx.project, input.clipId), `deleted ${input.clipId}`);
  },
});

export const rippleDeleteTool = defineTool({
  name: "ripple_delete",
  description: "Delete a clip and shift following clips left to close the gap.",
  kind: "edit",
  input: z.object({ clipId: z.string() }),
  async execute(input, ctx) {
    return commit(ctx, rippleDelete(ctx.project, input.clipId), `ripple-deleted ${input.clipId}`);
  },
});

export const removeSilencesTool = defineTool({
  name: "remove_silences",
  description: "Remove silent ranges from all clips of an asset.",
  kind: "edit",
  input: z.object({
    assetId: z.string(),
    ranges: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative() })).optional(),
    thresholdDb: z.number().optional(),
    minDurationMs: z.number().int().optional(),
  }),
  async execute(input, ctx) {
    let ranges = input.ranges;
    if (!ranges) {
      if (!ctx.host.detectSilence) throw new Error("silence detection is not available in this host");
      const asset = ctx.project.assets.find((a) => a.id === input.assetId);
      if (!asset) throw new Error(`asset ${input.assetId} not found`);
      ranges = await ctx.host.detectSilence(asset.path, { thresholdDb: input.thresholdDb, minDurationMs: input.minDurationMs });
    }
    return commit(ctx, removeRanges(ctx.project, input.assetId, ranges), `removed ${ranges.length} silent range(s)`);
  },
});

export const removeFillerWordsTool = defineTool({
  name: "remove_filler_words",
  description: "Remove ranges corresponding to filler words (um, uh, like) from an asset.",
  kind: "edit",
  input: z.object({
    assetId: z.string(),
    words: z.array(z.string()).default(["um", "uh", "erm", "like", "you know"]),
  }),
  async execute(input, ctx) {
    const transcripts = [...(ctx.transcripts?.values() ?? [])].filter((t) => t.assetId === input.assetId);
    const ranges: { startMs: number; endMs: number }[] = [];
    for (const t of transcripts) {
      for (const s of t.segments) {
        const text = s.text.toLowerCase().trim().replace(/[.,!?]/g, "");
        if (input.words.some((w) => text === w)) ranges.push({ startMs: s.startMs, endMs: s.endMs });
      }
    }
    if (ranges.length === 0) return { summary: "no filler words found" };
    return commit(ctx, removeRanges(ctx.project, input.assetId, ranges), `removed ${ranges.length} filler word(s)`);
  },
});

export const setSpeedTool = defineTool({
  name: "set_speed",
  description: "Set a clip's playback speed.",
  kind: "edit",
  input: z.object({ clipId: z.string(), speed: z.number().positive() }),
  async execute(input, ctx) {
    return commit(ctx, setSpeed(ctx.project, input.clipId, input.speed), `set ${input.clipId} speed to ${input.speed}`);
  },
});

export const setVolumeTool = defineTool({
  name: "set_volume",
  description: "Set a clip's volume (0..4).",
  kind: "edit",
  input: z.object({ clipId: z.string(), volume: z.number().min(0).max(4) }),
  async execute(input, ctx) {
    return commit(ctx, setVolume(ctx.project, input.clipId, input.volume), `set ${input.clipId} volume to ${input.volume}`);
  },
});

export const addFadeTool = defineTool({
  name: "add_fade",
  description: "Add a fade-in and/or fade-out effect to a clip.",
  kind: "edit",
  input: z.object({ clipId: z.string(), inMs: z.number().int().nonnegative().optional(), outMs: z.number().int().nonnegative().optional() }),
  async execute(input, ctx) {
    return commit(ctx, addEffect(ctx.project, input.clipId, { type: "fade", inMs: input.inMs, outMs: input.outMs }), `added fade to ${input.clipId}`);
  },
});

export const addTransitionTool = defineTool({
  name: "add_transition",
  description: "Add a transition at the in or out edge of a clip.",
  kind: "edit",
  input: z.object({
    clipId: z.string(),
    position: z.enum(["in", "out"]),
    type: z.enum(["crossfade", "fade", "wipe", "slide", "none"]).default("crossfade"),
    durationMs: z.number().int().nonnegative(),
  }),
  async execute(input, ctx) {
    return commit(
      ctx,
      addTransition(ctx.project, input.clipId, input.position, { type: input.type, durationMs: input.durationMs }),
      `added ${input.type} transition to ${input.clipId}`,
    );
  },
});

export const addTextOverlayTool = defineTool({
  name: "add_text_overlay",
  description: "Add a text overlay effect to a clip.",
  kind: "edit",
  input: z.object({
    clipId: z.string(),
    text: z.string(),
    x: z.union([z.number(), z.string()]).optional(),
    y: z.union([z.number(), z.string()]).optional(),
    fontSize: z.number().positive().optional(),
    color: z.string().optional(),
  }),
  async execute(input, ctx) {
    const { clipId, ...rest } = input;
    return commit(ctx, addEffect(ctx.project, clipId, { type: "text", ...rest }), `added text overlay to ${clipId}`);
  },
});

export const addSubtitlesTool = defineTool({
  name: "add_subtitles",
  description: "Add a subtitle track from transcript segments.",
  kind: "edit",
  input: z.object({
    transcriptId: z.string(),
    trackId: z.string().optional(),
  }),
  async execute(input, ctx) {
    const t = ctx.transcripts?.get(input.transcriptId);
    if (!t) throw new Error(`transcript ${input.transcriptId} not found`);
    return commit(
      ctx,
      addSubtitleTrackFromTranscript(ctx.project, t.segments, input.trackId),
      `added subtitle track from ${t.segments.length} segment(s)`,
    );
  },
});

export const cropReframeTool = defineTool({
  name: "crop_reframe",
  description: "Reframe a clip to 9:16, 1:1 or 16:9.",
  kind: "edit",
  input: z.object({ clipId: z.string(), aspect: z.enum(["9:16", "1:1", "16:9"]) }),
  async execute(input, ctx) {
    const dims = input.aspect === "9:16" ? { width: 1080, height: 1920 } : input.aspect === "1:1" ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 };
    return commit(
      ctx,
      addEffect(ctx.project, input.clipId, { type: "scale", width: dims.width, height: dims.height, fit: "cover" }),
      `reframed ${input.clipId} to ${input.aspect}`,
    );
  },
});

export const addMusicTool = defineTool({
  name: "add_music",
  description: "Add a music asset to an audio track with a volume (ducking hint for the compiler).",
  kind: "edit",
  input: z.object({
    assetId: z.string(),
    startMs: z.number().int().nonnegative().default(0),
    volume: z.number().min(0).max(4).default(0.3),
    trackId: z.string().optional(),
  }),
  async execute(input, ctx) {
    let p = ctx.project;
    let trackId = input.trackId ?? p.tracks.find((t) => t.kind === "audio")?.id;
    if (!trackId) {
      trackId = "audio-1";
      p = addTrack(p, { id: trackId, kind: "audio", clips: [], muted: false, locked: false });
    }
    p = addClip(p, {
      trackId,
      assetId: input.assetId,
      inMs: 0,
      outMs: assetDuration(ctx, input.assetId),
      startMs: input.startMs,
      volume: input.volume,
    });
    return commit(ctx, p, `added music ${input.assetId}`);
  },
});

export const colorAdjustTool = defineTool({
  name: "color_adjust",
  description: "Adjust brightness, contrast, saturation or gamma on a clip.",
  kind: "edit",
  input: z.object({
    clipId: z.string(),
    brightness: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
    gamma: z.number().optional(),
  }),
  async execute(input, ctx) {
    const { clipId, ...rest } = input;
    return commit(ctx, addEffect(ctx.project, clipId, { type: "colorAdjust", ...rest }), `adjusted color on ${clipId}`);
  },
});

export const applyLutTool = defineTool({
  name: "apply_lut",
  description: "Apply a LUT file to a clip.",
  kind: "edit",
  input: z.object({ clipId: z.string(), path: z.string() }),
  async execute(input, ctx) {
    return commit(ctx, addEffect(ctx.project, input.clipId, { type: "lut", path: input.path }), `applied LUT to ${input.clipId}`);
  },
});
