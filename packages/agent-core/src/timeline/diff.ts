import type { Project, Track, Clip } from "./schema";

export type ChangeKind = "added" | "removed" | "modified" | "moved";

export interface TimelineChange {
  kind: ChangeKind;
  path: string; // e.g. "track:video-1/clip:abc"
  summary: string;
}

function indexById<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((x) => [x.id, x]));
}

function clipSummary(c: Clip): string {
  return `${c.id} asset=${c.assetId} in=${c.inMs} out=${c.outMs} start=${c.startMs} speed=${c.speed} vol=${c.volume}`;
}

function trackSummary(t: Track): string {
  return `${t.id} (${t.kind}) clips=${t.clips.length}${t.muted ? " muted" : ""}${t.locked ? " locked" : ""}`;
}

export function diffTimeline(a: Project, b: Project): TimelineChange[] {
  const changes: TimelineChange[] = [];

  // Assets
  const aAssets = indexById(a.assets);
  const bAssets = indexById(b.assets);
  for (const [id, asset] of bAssets) {
    if (!aAssets.has(id)) changes.push({ kind: "added", path: `asset:${id}`, summary: `asset added: ${asset.path}` });
  }
  for (const [id, asset] of aAssets) {
    if (!bAssets.has(id)) changes.push({ kind: "removed", path: `asset:${id}`, summary: `asset removed: ${asset.path}` });
  }

  // Tracks
  const aTracks = indexById(a.tracks);
  const bTracks = indexById(b.tracks);
  for (const [id, t] of bTracks) {
    if (!aTracks.has(id)) {
      changes.push({ kind: "added", path: `track:${id}`, summary: `track added: ${trackSummary(t)}` });
      continue;
    }
    const prev = aTracks.get(id)!;
    if (prev.kind !== t.kind || prev.muted !== t.muted || prev.locked !== t.locked) {
      changes.push({ kind: "modified", path: `track:${id}`, summary: `track changed: ${trackSummary(prev)} -> ${trackSummary(t)}` });
    }
    // Clips
    const aClips = indexById(prev.clips);
    const bClips = indexById(t.clips);
    for (const [cid, c] of bClips) {
      if (!aClips.has(cid)) {
        changes.push({ kind: "added", path: `track:${id}/clip:${cid}`, summary: `clip added: ${clipSummary(c)}` });
      } else {
        const pc = aClips.get(cid)!;
        if (JSON.stringify(pc) !== JSON.stringify(c)) {
          // detect move vs trim
          const moved = pc.startMs !== c.startMs && pc.inMs === c.inMs && pc.outMs === c.outMs;
          changes.push({
            kind: moved ? "moved" : "modified",
            path: `track:${id}/clip:${cid}`,
            summary: `clip ${moved ? "moved" : "changed"}: ${clipSummary(pc)} -> ${clipSummary(c)}`,
          });
        }
      }
    }
    for (const [cid, c] of aClips) {
      if (!bClips.has(cid)) changes.push({ kind: "removed", path: `track:${id}/clip:${cid}`, summary: `clip removed: ${clipSummary(c)}` });
    }
  }
  for (const [id, t] of aTracks) {
    if (!bTracks.has(id)) changes.push({ kind: "removed", path: `track:${id}`, summary: `track removed: ${trackSummary(t)}` });
  }

  // Markers
  const aMarkers = indexById(a.markers);
  const bMarkers = indexById(b.markers);
  for (const [id, m] of bMarkers) {
    if (!aMarkers.has(id)) changes.push({ kind: "added", path: `marker:${id}`, summary: `marker added: ${m.label} @${m.timeMs}ms` });
    else if (JSON.stringify(aMarkers.get(id)) !== JSON.stringify(m))
      changes.push({ kind: "modified", path: `marker:${id}`, summary: `marker changed: ${m.label} @${m.timeMs}ms` });
  }
  for (const [id, m] of aMarkers) {
    if (!bMarkers.has(id)) changes.push({ kind: "removed", path: `marker:${id}`, summary: `marker removed: ${m.label}` });
  }

  return changes;
}
