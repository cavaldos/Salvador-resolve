import { nanoid } from "nanoid";
import type { Project, Track, Clip, Asset, Effect, Transition } from "./schema";
import { ProjectSchema } from "./schema";

export class TimelineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "TimelineError";
  }
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function findTrack(p: Project, trackId: string): Track {
  const t = p.tracks.find((x) => x.id === trackId);
  if (!t) throw new TimelineError("TRACK_NOT_FOUND", `track ${trackId} not found`);
  return t;
}

function findClip(p: Project, clipId: string): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } {
  for (let ti = 0; ti < p.tracks.length; ti++) {
    const t = p.tracks[ti];
    const ci = t.clips.findIndex((c) => c.id === clipId);
    if (ci >= 0) return { track: t, clip: t.clips[ci], trackIndex: ti, clipIndex: ci };
  }
  throw new TimelineError("CLIP_NOT_FOUND", `clip ${clipId} not found`);
}

function assetOf(p: Project, assetId: string): Asset {
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new TimelineError("ASSET_NOT_FOUND", `asset ${assetId} not found`);
  return a;
}

function clipDurationMs(c: Clip): number {
  return Math.round(((c.outMs - c.inMs) / c.speed));
}

function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

function ensureNotLocked(t: Track) {
  if (t.locked) throw new TimelineError("TRACK_LOCKED", `track ${t.id} is locked`);
}

function validateClipTimes(c: { inMs: number; outMs: number; startMs?: number }, asset: Asset) {
  if (!Number.isInteger(c.inMs) || !Number.isInteger(c.outMs) || (c.startMs !== undefined && !Number.isInteger(c.startMs)))
    throw new TimelineError("NON_INTEGER_TIME", "times must be integer ms");
  if (c.startMs !== undefined && c.startMs < 0)
    throw new TimelineError("INVALID_START", "startMs must be nonnegative");
  if (!(c.inMs < c.outMs)) throw new TimelineError("INVALID_RANGE", "inMs must be < outMs");
  if (c.inMs < 0 || c.outMs > asset.durationMs)
    throw new TimelineError("OUT_OF_ASSET", "clip range outside asset duration");
}

function checkOverlap(track: Track, startMs: number, durMs: number, excludeId?: string) {
  for (const c of track.clips) {
    if (excludeId && c.id === excludeId) continue;
    if (overlaps(startMs, durMs, c.startMs, clipDurationMs(c)))
      throw new TimelineError("OVERLAP", `clip overlaps existing clip ${c.id}`);
  }
}

function bump(p: Project): Project {
  return { ...p, updatedAt: new Date().toISOString() };
}

// ---------- ops ----------

export interface AddClipInput {
  trackId: string;
  assetId: string;
  inMs: number;
  outMs: number;
  startMs?: number;
  speed?: number;
  volume?: number;
  effects?: Effect[];
  transitions?: Clip["transitions"];
}

export function addClip(project: Project, input: AddClipInput): Project {
  const p = clone(project);
  const track = findTrack(p, input.trackId);
  ensureNotLocked(track);
  const asset = assetOf(p, input.assetId);
  const speed = input.speed ?? 1;
  const volume = input.volume ?? 1;
  validateClipTimes(input, asset);
  const startMs = input.startMs ?? 0;
  const dur = Math.round((input.outMs - input.inMs) / speed);
  checkOverlap(track, startMs, dur);
  const clip: Clip = {
    id: nanoid(8),
    assetId: input.assetId,
    inMs: input.inMs,
    outMs: input.outMs,
    startMs,
    speed,
    volume,
    effects: input.effects ?? [],
    transitions: input.transitions,
  };
  track.clips.push(clip);
  track.clips.sort((a, b) => a.startMs - b.startMs);
  return bump(ProjectSchema.parse(p));
}

export function trimClip(
  project: Project,
  clipId: string,
  patch: { inMs?: number; outMs?: number; startMs?: number },
): Project {
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  const asset = assetOf(p, clip.assetId);
  const next = { ...clip, ...patch };
  validateClipTimes(next, asset);
  // overlap check with new timing
  const dur = Math.round((next.outMs - next.inMs) / next.speed);
  checkOverlap(track, next.startMs, dur, clip.id);
  Object.assign(clip, patch);
  return bump(ProjectSchema.parse(p));
}

export function splitClip(project: Project, clipId: string, atMs: number): Project {
  const p = clone(project);
  const { track, clip, clipIndex } = findClip(p, clipId);
  ensureNotLocked(track);
  // atMs is absolute timeline ms
  if (atMs <= clip.startMs || atMs >= clip.startMs + clipDurationMs(clip))
    throw new TimelineError("SPLIT_OUT_OF_RANGE", "split point outside clip");
  const sourceAt = clip.inMs + Math.round((atMs - clip.startMs) * clip.speed);
  if (sourceAt <= clip.inMs || sourceAt >= clip.outMs)
    throw new TimelineError("SPLIT_OUT_OF_RANGE", "split point outside clip");
  const left: Clip = { ...clip, id: nanoid(8), outMs: sourceAt };
  const right: Clip = { ...clip, id: nanoid(8), inMs: sourceAt, startMs: atMs };
  track.clips.splice(clipIndex, 1, left, right);
  return bump(ProjectSchema.parse(p));
}

export function moveClip(
  project: Project,
  clipId: string,
  patch: { trackId?: string; startMs: number },
): Project {
  const p = clone(project);
  const { track, clip, clipIndex } = findClip(p, clipId);
  ensureNotLocked(track);
  const targetTrack = patch.trackId ? findTrack(p, patch.trackId) : track;
  if (patch.trackId && targetTrack.id !== track.id) ensureNotLocked(targetTrack);
  if (targetTrack.locked) throw new TimelineError("TRACK_LOCKED", `track ${targetTrack.id} is locked`);
  validateClipTimes({ inMs: clip.inMs, outMs: clip.outMs, startMs: patch.startMs }, assetOf(p, clip.assetId));
  const dur = clipDurationMs(clip);
  checkOverlap(targetTrack, patch.startMs, dur, clip.id);
  // remove from old track if moving
  if (targetTrack.id !== track.id) {
    track.clips.splice(clipIndex, 1);
    clip.startMs = patch.startMs;
    targetTrack.clips.push(clip);
    targetTrack.clips.sort((a, b) => a.startMs - b.startMs);
  } else {
    clip.startMs = patch.startMs;
    track.clips.sort((a, b) => a.startMs - b.startMs);
  }
  return bump(ProjectSchema.parse(p));
}

export function deleteClip(project: Project, clipId: string): Project {
  const p = clone(project);
  const { track, clipIndex } = findClip(p, clipId);
  ensureNotLocked(track);
  track.clips.splice(clipIndex, 1);
  return bump(ProjectSchema.parse(p));
}

export function rippleDelete(project: Project, clipId: string): Project {
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  const dur = clipDurationMs(clip);
  const start = clip.startMs;
  // remove clip
  track.clips = track.clips.filter((c) => c.id !== clipId);
  // shift following clips left by dur
  for (const c of track.clips) {
    if (c.startMs >= start + dur) {
      c.startMs = Math.max(0, c.startMs - dur);
    }
  }
  return bump(ProjectSchema.parse(p));
}

export function setSpeed(project: Project, clipId: string, speed: number): Project {
  if (!(speed > 0)) throw new TimelineError("INVALID_SPEED", "speed must be > 0");
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  const asset = assetOf(p, clip.assetId);
  // validate outMs unchanged within asset
  validateClipTimes({ inMs: clip.inMs, outMs: clip.outMs, startMs: clip.startMs }, asset);
  const nextDuration = Math.round((clip.outMs - clip.inMs) / speed);
  checkOverlap(track, clip.startMs, nextDuration, clip.id);
  clip.speed = speed;
  return bump(ProjectSchema.parse(p));
}

export function setVolume(project: Project, clipId: string, volume: number): Project {
  if (volume < 0 || volume > 4) throw new TimelineError("INVALID_VOLUME", "volume must be 0..4");
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  clip.volume = volume;
  return bump(ProjectSchema.parse(p));
}

export function addEffect(project: Project, clipId: string, effect: Effect): Project {
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  clip.effects = [...clip.effects, effect];
  return bump(ProjectSchema.parse(p));
}

export function addTransition(
  project: Project,
  clipId: string,
  position: "in" | "out",
  transition: Transition,
): Project {
  const p = clone(project);
  const { track, clip } = findClip(p, clipId);
  ensureNotLocked(track);
  clip.transitions = { ...(clip.transitions ?? {}), [position]: transition };
  return bump(ProjectSchema.parse(p));
}

export interface SubtitleSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export function addSubtitleTrackFromTranscript(
  project: Project,
  segments: SubtitleSegment[],
  trackId?: string,
): Project {
  const p = clone(project);
  const id = trackId ?? `subtitles-${nanoid(6)}`;
  if (p.tracks.some((t) => t.id === id)) throw new TimelineError("TRACK_EXISTS", `track ${id} exists`);
  const track: Track = { id, kind: "subtitle", clips: [], muted: false, locked: false };
  // represent each segment as a marker for now
  for (const s of segments) {
    p.markers.push({ id: nanoid(8), timeMs: s.startMs, label: s.text, color: "#ffff00" });
  }
  p.tracks.push(track);
  return bump(ProjectSchema.parse(p));
}

export function removeRanges(
  project: Project,
  assetId: string,
  ranges: { startMs: number; endMs: number }[],
): Project {
  const p = clone(project);
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  for (const track of p.tracks) {
    if (track.locked) continue;
    const newClips: Clip[] = [];
    for (const clip of track.clips) {
      if (clip.assetId !== assetId) {
        newClips.push(clip);
        continue;
      }
      // clip source range [inMs,outMs]; remove overlapping source ranges
      let cursor = clip.inMs;
      const pieces: { inMs: number; outMs: number }[] = [];
      for (const r of sorted) {
        const rs = Math.max(r.startMs, clip.inMs);
        const re = Math.min(r.endMs, clip.outMs);
        if (rs >= re) continue;
        if (cursor < rs) pieces.push({ inMs: cursor, outMs: rs });
        cursor = Math.max(cursor, re);
      }
      if (cursor < clip.outMs) pieces.push({ inMs: cursor, outMs: clip.outMs });
      if (pieces.length === 0) continue; // removed entirely
      // preserve startMs offset for first piece; subsequent pieces ripple? keep simple: same startMs for first, append
      let offset = clip.startMs;
      for (const piece of pieces) {
        newClips.push({
          ...clip,
          id: nanoid(8),
          inMs: piece.inMs,
          outMs: piece.outMs,
          startMs: offset,
        });
        offset += Math.round((piece.outMs - piece.inMs) / clip.speed);
      }
    }
    track.clips = newClips;
  }
  return bump(ProjectSchema.parse(p));
}

// ---------- project/asset helpers ----------

export function addAsset(project: Project, asset: Asset): Project {
  const p = clone(project);
  if (p.assets.some((a) => a.id === asset.id))
    throw new TimelineError("ASSET_EXISTS", `asset ${asset.id} already exists`);
  p.assets.push(asset);
  return bump(ProjectSchema.parse(p));
}

export function updateAsset(project: Project, assetId: string, patch: Partial<Asset>): Project {
  const p = clone(project);
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new TimelineError("ASSET_NOT_FOUND", `asset ${assetId} not found`);
  Object.assign(a, patch);
  return bump(ProjectSchema.parse(p));
}

export function addTrack(project: Project, track: Track): Project {
  const p = clone(project);
  if (p.tracks.some((t) => t.id === track.id))
    throw new TimelineError("TRACK_EXISTS", `track ${track.id} already exists`);
  p.tracks.push(track);
  return bump(ProjectSchema.parse(p));
}

export function updateTrack(project: Project, trackId: string, patch: Partial<Track>): Project {
  const p = clone(project);
  const t = findTrack(p, trackId);
  Object.assign(t, patch);
  return bump(ProjectSchema.parse(p));
}
