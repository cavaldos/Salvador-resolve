/**
 * Salvador Resolve editor tools for the AI agent.
 *
 * These keep the *shape* of `@salvador/tools` (zod input + `execute`) but act
 * on the real editor stores. Every mutation goes through the history store
 * (`EditingActions`, `*Command`), so a single Cmd+Z reverts what the agent did.
 *
 * All times are SECONDS on the timeline (the editor's native unit).
 */
import { defineTool, zod as z, type ToolDefinition } from "@salvador/tools";
import { getPlaybackClock } from "@/core/playback";
import { EditingActions, getPreviewInteractionCoordinator } from "@/core/interactions";
import { getActiveSessionOrNull } from "@/core/runtime/ProjectSession";
import { useTimelineStore } from "@/store/timelineStore";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";
import { useTranscriptStore } from "@/store/transcriptStore";
import { AddClipCommand, MoveClipCommand, UpdateClipCommand } from "@/core/history/commands";
import { createTextClip } from "@/lib/text/textClip";
import { EXPORT_PRESET_IDS, pickExportPath, runExport } from "./exportRunner";
import type { ExportPreset } from "@/lib/export/exportPresets";
import type { Clip } from "@/types";

const EPS = 0.001;
const MIN_CLIP_SEC = 0.05;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ── helpers ──────────────────────────────────────────────────────────────

function tl() {
  return useTimelineStore.getState();
}

function getClip(clipId: string): Clip {
  const clip = tl().clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`clip ${clipId} not found (call list_clips for valid ids)`);
  return clip;
}

function assertUnlocked(clip: Clip): void {
  const track = tl().tracks.find((t) => t.id === clip.trackId);
  if (track?.locked) throw new Error(`track ${track.id} is locked`);
}

function playhead(): number {
  try {
    return r3(getPlaybackClock().time);
  } catch {
    return 0;
  }
}

function clipSummary(c: Clip) {
  return {
    id: c.id,
    trackId: c.trackId,
    kind: c.kind ?? "video",
    name: c.name,
    mediaId: c.mediaId || undefined,
    start: r3(c.startTime),
    end: r3(c.startTime + c.duration),
    duration: r3(c.duration),
    trimIn: r3(c.trimIn),
    trimOut: r3(c.trimOut),
    volume: c.volume ?? 1,
    speed: clipSpeed(c),
    text: (c as unknown as { text?: string }).text,
  };
}

function clipSpeed(c: Clip): number {
  const m = c.playbackMapping;
  if (m && m.kind === "normal") return m.speed;
  return c.speed ?? 1;
}

function mediaDuration(clip: Clip): number | undefined {
  const asset = useProjectStore.getState().mediaAssets.find((a) => a.id === clip.mediaId);
  return asset && (asset.type === "video" || asset.type === "audio") ? asset.duration : undefined;
}

/** Run several history commands as ONE undo step. */
export function inTransaction<T>(label: string, fn: () => T): T {
  const h = useHistoryStore.getState();
  h.beginTransaction(label);
  try {
    const out = fn();
    h.commitTransaction();
    return out;
  } catch (e) {
    h.rollbackTransaction();
    throw e;
  }
}

// ── inspect ──────────────────────────────────────────────────────────────

const getProjectInfo = defineTool({
  name: "get_project_info",
  description: "Project name, canvas size, frame rate, timeline duration (seconds), counts and playhead position.",
  kind: "inspect",
  input: z.object({}),
  async execute() {
    const project = useProjectStore.getState().project;
    if (!project) throw new Error("no project is open");
    const s = tl();
    const data = {
      name: project.name,
      canvas: `${project.canvasWidth}x${project.canvasHeight}`,
      frameRate: project.frameRate,
      duration: r3(s.getTimelineEndTime()),
      tracks: s.tracks.length,
      clips: s.clips.length,
      mediaAssets: useProjectStore.getState().mediaAssets.length,
      playhead: playhead(),
    };
    return { summary: `${data.name}: ${data.clips} clips, ${data.duration}s`, data };
  },
});

const listTracks = defineTool({
  name: "list_tracks",
  description: "List timeline tracks (id, type, name, locked/muted flags, clip count).",
  kind: "inspect",
  input: z.object({}),
  async execute() {
    const { tracks, clips } = tl();
    const data = tracks.map((t) => ({
      id: t.id,
      type: t.type,
      name: t.name,
      locked: t.locked,
      muted: t.muted,
      clips: clips.filter((c) => c.trackId === t.id).length,
    }));
    return { summary: `${data.length} tracks`, data };
  },
});

const listClips = defineTool({
  name: "list_clips",
  description:
    "List timeline clips with id, track, kind, start/end/duration (seconds), trimIn/trimOut (source seconds), volume, speed. Optionally filter by track.",
  kind: "inspect",
  input: z.object({ trackId: z.string().optional() }),
  async execute({ trackId }) {
    const data = tl()
      .clips.filter((c) => !trackId || c.trackId === trackId)
      .sort((a, b) => a.startTime - b.startTime)
      .map(clipSummary);
    return { summary: `${data.length} clips`, data };
  },
});

const listMediaAssets = defineTool({
  name: "list_media_assets",
  description: "List imported media assets (id, name, type, duration seconds, size).",
  kind: "inspect",
  input: z.object({}),
  async execute() {
    const data = useProjectStore.getState().mediaAssets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      duration: r3(a.duration),
      width: a.width,
      height: a.height,
    }));
    return { summary: `${data.length} assets`, data };
  },
});

const getPlayhead = defineTool({
  name: "get_playhead",
  description: "Current playhead position in seconds, plus which clips are under it.",
  kind: "inspect",
  input: z.object({}),
  async execute() {
    const t = playhead();
    const under = tl()
      .clips.filter((c) => t >= c.startTime - EPS && t < c.startTime + c.duration - EPS)
      .map((c) => c.id);
    return { summary: `playhead at ${t}s`, data: { time: t, clipsUnderPlayhead: under } };
  },
});

const getTranscript = defineTool({
  name: "get_transcript",
  description:
    "Return the transcript (words with source-time seconds) of a media asset if captions/transcription were already generated. Call add_captions first if none exists.",
  kind: "inspect",
  input: z.object({ mediaId: z.string().optional(), maxWords: z.number().int().positive().max(2000).default(400) }),
  async execute({ mediaId, maxWords }) {
    const transcripts = Object.values(tl().transcripts);
    const t = mediaId ? transcripts.find((x) => x.mediaId === mediaId || x.sourceMediaId === mediaId) : transcripts[0];
    if (!t) return { summary: "no transcript available", data: { available: false } };
    const words = t.words.slice(0, maxWords).map((w) => ({ t: w.text, s: r3(w.startMs / 1000), e: r3(w.endMs / 1000) }));
    return { summary: `${t.words.length} words`, data: { mediaId: t.mediaId, language: t.language, truncated: t.words.length > maxWords, words } };
  },
});

// ── edit ─────────────────────────────────────────────────────────────────

const splitClip = defineTool({
  name: "split_clip",
  description: "Split a clip into two at a timeline time (seconds). Defaults to the playhead if `time` is omitted.",
  kind: "edit",
  input: z.object({ clipId: z.string(), time: z.number().nonnegative().optional() }),
  async execute({ clipId, time }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    const at = time ?? playhead();
    const res = EditingActions.executeSplit({ clipId, time: at, source: "playhead" });
    if (!res.success) throw new Error(res.error ?? "split failed");
    return {
      summary: `split ${clipId} at ${r3(at)}s`,
      data: { leftClipId: res.leftClipId, rightClipId: res.rightClipId },
    };
  },
});

const deleteClip = defineTool({
  name: "delete_clip",
  description:
    "Delete a clip. With ripple=true later clips on the track shift left to close the gap; default leaves a gap (lift).",
  kind: "edit",
  input: z.object({ clipId: z.string(), ripple: z.boolean().default(false) }),
  async execute({ clipId, ripple }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    const res = EditingActions.deleteSelection([clipId], !ripple);
    if (!res) throw new Error("nothing deleted");
    return { summary: `deleted ${clipId}${ripple ? " (ripple)" : ""}`, data: { deleted: res.deletedClipIds } };
  },
});

const trimClip = defineTool({
  name: "trim_clip",
  description:
    "Trim a clip by moving its edges on the timeline (seconds). `start` = new timeline time of the left edge, `end` = new timeline time of the right edge. Trimming the left edge keeps the remaining media in place (the clip start moves right).",
  kind: "edit",
  input: z
    .object({ clipId: z.string(), start: z.number().nonnegative().optional(), end: z.number().positive().optional() })
    .refine((v) => v.start !== undefined || v.end !== undefined, "provide start and/or end"),
  async execute({ clipId, start, end }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    const mapping = clip.playbackMapping;
    if (mapping && mapping.kind !== "normal" && mapping.kind !== "reverse") {
      throw new Error(`cannot trim a ${mapping.kind} clip`);
    }
    const reversed = mapping?.kind === "reverse";
    const speed = mapping && "speed" in mapping && typeof mapping.speed === "number" ? mapping.speed : clip.speed ?? 1;
    const oldEnd = clip.startTime + clip.duration;
    const newStart = start ?? clip.startTime;
    const newEnd = end ?? oldEnd;
    if (newEnd - newStart < MIN_CLIP_SEC) throw new Error("resulting clip would be too short");

    // Source-time deltas for each edge.
    const leftSrc = (newStart - clip.startTime) * speed;
    const rightSrc = (oldEnd - newEnd) * speed;
    let trimIn = clip.trimIn + (reversed ? 0 : leftSrc);
    let trimOut = clip.trimOut - (reversed ? 0 : rightSrc);
    if (reversed) {
      trimOut = clip.trimOut - leftSrc;
      trimIn = clip.trimIn + rightSrc;
    }
    const limit = mediaDuration(clip);
    if (trimIn < -EPS) throw new Error("cannot extend the clip past the start of the source media");
    if (limit !== undefined && trimOut > limit + EPS) throw new Error("cannot extend the clip past the end of the source media");

    const before = { startTime: clip.startTime, duration: clip.duration, trimIn: clip.trimIn, trimOut: clip.trimOut };
    const after = { startTime: r3(newStart), duration: r3(newEnd - newStart), trimIn: Math.max(0, trimIn), trimOut };
    useHistoryStore.getState().execute(new UpdateClipCommand(clipId, before, after, { before: clip }));
    return { summary: `trimmed ${clipId} to ${after.startTime}s–${r3(after.startTime + after.duration)}s`, data: after };
  },
});

const moveClip = defineTool({
  name: "move_clip",
  description: "Move a clip to a new timeline start (seconds), optionally onto another track of the same kind. Fails if it would overlap another clip.",
  kind: "edit",
  input: z.object({ clipId: z.string(), start: z.number().nonnegative(), trackId: z.string().optional() }),
  async execute({ clipId, start, trackId }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    const target = trackId ?? clip.trackId;
    const track = tl().tracks.find((t) => t.id === target);
    if (!track) throw new Error(`track ${target} not found`);
    if (track.locked) throw new Error(`track ${target} is locked`);
    const srcTrack = tl().tracks.find((t) => t.id === clip.trackId);
    if (srcTrack && srcTrack.type !== track.type) throw new Error(`cannot move a ${srcTrack.type} clip to a ${track.type} track`);
    const s = r3(start);
    const e = s + clip.duration;
    const clash = tl().clips.find((c) => c.id !== clipId && c.trackId === target && s < c.startTime + c.duration - EPS && e > c.startTime + EPS);
    if (clash) throw new Error(`would overlap clip ${clash.id} (${r3(clash.startTime)}s–${r3(clash.startTime + clash.duration)}s)`);
    useHistoryStore.getState().execute(new MoveClipCommand(clipId, clip.trackId, target, clip.startTime, s));
    return { summary: `moved ${clipId} to ${s}s`, data: { start: s, end: r3(e), trackId: target } };
  },
});

const setClipVolume = defineTool({
  name: "set_clip_volume",
  description: "Set a clip's audio volume (0 = silent, 1 = original level).",
  kind: "edit",
  input: z.object({ clipId: z.string(), volume: z.number().min(0).max(1) }),
  async execute({ clipId, volume }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    useHistoryStore.getState().execute(new UpdateClipCommand(clipId, { volume: clip.volume ?? 1 }, { volume }, { before: clip }));
    return { summary: `volume of ${clipId} set to ${volume}` };
  },
});

function ensureTextTrackId(preferCaption = false): string {
  const s = tl();
  const texts = s.tracks.filter((t) => t.type === "text");
  const pick = (preferCaption && texts.find((t) => t.name.toLowerCase().includes("caption"))) || texts.find((t) => !t.locked);
  return pick ? pick.id : s.ensureTrackForType("text");
}

function canvas() {
  const p = useProjectStore.getState().project;
  return { canvasWidth: p?.canvasWidth || 1920, canvasHeight: p?.canvasHeight || 1080 };
}

const addTextClip = defineTool({
  name: "add_text_clip",
  description: "Add a text/title clip on a text track. Defaults: starts at the playhead, 3 seconds long, centered, white.",
  kind: "edit",
  input: z.object({
    text: z.string().min(1),
    start: z.number().nonnegative().optional(),
    duration: z.number().positive().max(3600).default(3),
    position: z.enum(["top", "center", "bottom"]).default("center"),
    fontSize: z.number().positive().max(400).optional(),
    color: z.string().optional(),
    bold: z.boolean().optional(),
  }),
  async execute(a) {
    const start = a.start ?? playhead();
    const clip = createTextClip({
      trackId: ensureTextTrackId(),
      startTime: start,
      duration: a.duration,
      text: a.text,
      position: a.position,
      fontSize: a.fontSize,
      color: a.color,
      bold: a.bold,
      ...canvas(),
    });
    useHistoryStore.getState().execute(new AddClipCommand(clip));
    return { summary: `added text "${a.text.slice(0, 40)}" at ${r3(start)}s`, data: { clipId: clip.id, start: r3(start), duration: a.duration } };
  },
});

interface RawSegment {
  text: string;
  startMs?: number;
  endMs?: number;
  start_ms?: number;
  end_ms?: number;
}

const addCaptions = defineTool({
  name: "add_captions",
  description:
    "Transcribe the audio of a video/audio clip (local Whisper) and add one caption text clip per segment on a caption text track. Slow for long media. Needs a downloaded Whisper model.",
  kind: "edit",
  input: z.object({
    clipId: z.string().describe("Video/audio clip to caption"),
    language: z.string().default("auto"),
    modelSize: z.enum(["tiny", "base", "small", "medium", "large-v3"]).optional(),
  }),
  async execute({ clipId, language, modelSize }) {
    const clip = getClip(clipId);
    const asset = useProjectStore.getState().mediaAssets.find((a) => a.id === clip.mediaId);
    if (!asset?.path) throw new Error("clip has no source media");
    const { invoke } = await import("@tauri-apps/api/core");
    const { useCaptionStore } = await import("@/store/captionStore");
    const model = modelSize ?? useCaptionStore.getState().captionSettings.activeModel ?? "base";
    const jobId = `ai-caption-${Date.now()}`;
    const segments = await invoke<RawSegment[]>("generate_auto_captions", {
      videoPath: asset.path,
      modelSize: model,
      language: language === "auto" ? null : language,
      jobId,
    });
    const trackId = ensureTextTrackId(true);
    const dims = canvas();
    const clipEnd = clip.startTime + clip.duration;
    let count = 0;
    inTransaction("AI: Add Captions", () => {
      for (const seg of segments ?? []) {
        const sMs = seg.startMs ?? seg.start_ms ?? 0;
        const eMs = seg.endMs ?? seg.end_ms ?? 0;
        const rel = sMs / 1000 - clip.trimIn;
        if (rel < 0 || rel >= clip.duration) continue;
        const at = clip.startTime + rel;
        const dur = Math.min((eMs - sMs) / 1000, clipEnd - at);
        if (dur <= 0) continue;
        useHistoryStore.getState().execute(
          new AddClipCommand(
            createTextClip({ trackId, startTime: at, duration: dur, text: seg.text.trim(), position: "bottom", textRole: "caption", bold: true, ...dims }),
          ),
        );
        count++;
      }
    });
    return { summary: `added ${count} caption clips`, data: { count, trackId } };
  },
});

interface WaveformBucket {
  peak: number;
  rms: number;
}

/** Pure helper (exported for tests): contiguous runs of buckets below `threshold`. */
export function findQuietRanges(rms: number[], bucketSec: number, threshold: number, minSilenceSec: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let runStart = -1;
  for (let i = 0; i <= rms.length; i++) {
    const quiet = i < rms.length && rms[i] < threshold;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      if ((i - runStart) * bucketSec >= minSilenceSec) out.push([runStart * bucketSec, i * bucketSec]);
      runStart = -1;
    }
  }
  return out;
}

const removeSilences = defineTool({
  name: "remove_silences",
  description:
    "Cut out silent passages from a clip (ripple-deleted, one undo step). Uses the clip's audio loudness envelope; `threshold` is the relative loudness (0-1, fraction of the loudest part) below which audio counts as silence.",
  kind: "edit",
  input: z.object({
    clipId: z.string(),
    threshold: z.number().min(0.001).max(0.5).default(0.05),
    minSilence: z.number().min(0.1).max(10).default(0.5),
    padding: z.number().min(0).max(1).default(0.08).describe("seconds of audio kept on each side of speech"),
  }),
  async execute({ clipId, threshold, minSilence, padding }) {
    const clip = getClip(clipId);
    assertUnlocked(clip);
    const asset = useProjectStore.getState().mediaAssets.find((a) => a.id === clip.mediaId);
    if (!asset?.path) throw new Error("clip has no source media");
    const speed = clipSpeed(clip);
    const srcSpan = clip.trimOut - clip.trimIn;
    const bucketSec = 0.05;
    const numBuckets = Math.max(1, Math.round(srcSpan / bucketSec));
    const { invoke } = await import("@tauri-apps/api/core");
    const buckets = await invoke<WaveformBucket[]>("extract_waveform_data", {
      path: asset.path,
      numBuckets,
      startTime: clip.trimIn,
      duration: srcSpan,
    });
    const quiet = findQuietRanges(
      buckets.map((b) => b.rms),
      srcSpan / buckets.length,
      threshold,
      minSilence,
    )
      .map(([a, b]): [number, number] => [a + padding, b - padding])
      .filter(([a, b]) => b - a > MIN_CLIP_SEC);
    if (quiet.length === 0) return { summary: "no silences found", data: { removed: 0 } };

    // Convert to timeline time and process back-to-front so earlier ranges stay valid.
    const ranges = quiet.map(([a, b]): [number, number] => [clip.startTime + a / speed, clip.startTime + b / speed]);
    let removedSec = 0;
    inTransaction("AI: Remove Silences", () => {
      for (const [a, b] of [...ranges].reverse()) {
        const mid = () => tl().clips.find((c) => c.trackId === clip.trackId && c.startTime <= a + EPS && c.startTime + c.duration > a + EPS);
        const c1 = mid();
        if (!c1) continue;
        if (b < c1.startTime + c1.duration - EPS) EditingActions.executeSplit({ clipId: c1.id, time: b, source: "playhead" });
        const c2 = mid();
        if (!c2) continue;
        if (a > c2.startTime + EPS) EditingActions.executeSplit({ clipId: c2.id, time: a, source: "playhead" });
        const target = tl().clips.find((c) => c.trackId === clip.trackId && Math.abs(c.startTime - a) < 0.02 && c.startTime + c.duration <= b + 0.02);
        if (target) {
          EditingActions.deleteSelection([target.id], false);
          removedSec += b - a;
        }
      }
    });
    return { summary: `removed ${ranges.length} silences (${r3(removedSec)}s)`, data: { removed: ranges.length, seconds: r3(removedSec) } };
  },
});

// ── history & transport ──────────────────────────────────────────────────

const undoTool = defineTool({
  name: "undo",
  description: "Undo the most recent edit in the editor's history (the same as Cmd/Ctrl+Z). Returns what was undone.",
  kind: "edit",
  input: z.object({}),
  async execute() {
    const h = useHistoryStore.getState();
    const label = h.state.undoLabel;
    if (!h.state.canUndo) throw new Error("nothing to undo");
    h.undo();
    return { summary: `undid ${label ?? "last edit"}`, data: { undone: label } };
  },
});

const redoTool = defineTool({
  name: "redo",
  description: "Redo the most recently undone edit (the same as Cmd/Ctrl+Shift+Z).",
  kind: "edit",
  input: z.object({}),
  async execute() {
    const h = useHistoryStore.getState();
    const label = h.state.redoLabel;
    if (!h.state.canRedo) throw new Error("nothing to redo");
    h.redo();
    return { summary: `redid ${label ?? "last undone edit"}`, data: { redone: label } };
  },
});

/** Transport goes through the active session's authority, like the UI transport bar (Invariant 1). */
function transport() {
  const authority = getActiveSessionOrNull()?.transportAuthority;
  if (!authority) throw new Error("no active editing session");
  getPreviewInteractionCoordinator().notifyTransportBoundary();
  return authority;
}

const seekTool = defineTool({
  name: "seek",
  description: "Move the playhead to a timeline time (seconds). Clamped to the timeline duration.",
  kind: "edit",
  input: z.object({ time: z.number().nonnegative() }),
  async execute({ time }) {
    const t = r3(Math.min(time, Math.max(0, tl().getTimelineEndTime())));
    transport().seek(t, { mode: "seek" });
    return { summary: `playhead moved to ${t}s`, data: { time: t } };
  },
});

const playTool = defineTool({
  name: "play",
  description: "Start playback from the playhead.",
  kind: "edit",
  input: z.object({}),
  async execute() {
    transport().play();
    return { summary: "playing", data: { playhead: playhead() } };
  },
});

const pauseTool = defineTool({
  name: "pause",
  description: "Pause playback. Returns the playhead position.",
  kind: "edit",
  input: z.object({}),
  async execute() {
    transport().pause();
    return { summary: `paused at ${playhead()}s`, data: { playhead: playhead() } };
  },
});

// ── output ───────────────────────────────────────────────────────────────

const startExport = defineTool({
  name: "start_export",
  description: `Export the timeline with a preset (${EXPORT_PRESET_IDS.join(", ")}). If outputPath is omitted the user is asked where to save. Requires user approval. Blocks until finished.`,
  kind: "output",
  input: z.object({
    preset: z.enum(EXPORT_PRESET_IDS as unknown as [string, ...string[]]),
    outputPath: z.string().optional(),
  }),
  async execute({ preset, outputPath }) {
    const path = outputPath ?? (await pickExportPath(preset as ExportPreset));
    if (!path) throw new Error("export cancelled: no output path chosen");
    const r = await runExport(preset as ExportPreset, path);
    if (r.cancelled) throw new Error("export was cancelled");
    return { summary: `exported to ${path}`, data: { outputPath: path, frames: r.totalFrames, seconds: r3(r.totalTimeMs / 1000) } };
  },
});

export const EDITOR_TOOLS: ToolDefinition[] = [
  getProjectInfo,
  listTracks,
  listClips,
  listMediaAssets,
  getPlayhead,
  getTranscript,
  splitClip,
  deleteClip,
  trimClip,
  moveClip,
  setClipVolume,
  addTextClip,
  addCaptions,
  removeSilences,
  undoTool,
  redoTool,
  seekTool,
  playTool,
  pauseTool,
  startExport,
] as unknown as ToolDefinition[];

/** Tools that can legitimately run for minutes (MCP uses a longer timeout for them). */
export const LONG_RUNNING_TOOLS: ReadonlySet<string> = new Set(["add_captions", "start_export"]);

/** Default permissions: destructive / slow / external actions ask first. */
export const DEFAULT_PERMISSIONS = {
  tools: { delete_clip: "ask", remove_silences: "ask", start_export: "ask", add_captions: "ask" },
} as const;

export function findEditorTool(name: string): ToolDefinition | undefined {
  return EDITOR_TOOLS.find((t) => t.name === name);
}
