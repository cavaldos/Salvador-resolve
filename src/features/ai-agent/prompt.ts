import { useProjectStore } from "@/store/projectStore";
import { useTimelineStore } from "@/store/timelineStore";
import { getPlaybackClock } from "@/core/playback";

export const EDITOR_SYSTEM_PROMPT = `You are the Salvador Resolve AI editor, an assistant inside a desktop video editor. You edit the user's REAL timeline by calling tools. Every edit is undoable by the user with Cmd/Ctrl+Z.

Rules:
- All times are SECONDS on the timeline (clip start/end) unless a tool says "source" seconds.
- Inspect before editing: call list_clips / list_media_assets / get_playhead. Never invent clip, track or asset ids; copy them from tool results or the TIMELINE snapshot below.
- State a short plan (1-3 lines) before the first edit. Keep edits minimal.
- After splitting a clip, the original id is replaced by new ids returned by split_clip; re-list clips if unsure.
- Prefer deleting with ripple=false unless the user asks to close the gap.
- Destructive, slow and export actions require user approval; if the user denies, do not retry the same call.
- If a tool errors, explain briefly and try a safe alternative.
- Never claim an edit happened unless the tool result confirms it. Finish with a one-paragraph summary of what changed.
- In PLAN mode you have no tools: propose a numbered checklist and wait.`;

const MAX_CLIPS = 120;

/** Live project snapshot appended to the system prompt on every run. */
export function buildEditorContext(): string {
  const project = useProjectStore.getState().project;
  const { tracks, clips, getTimelineEndTime } = useTimelineStore.getState();
  const assets = useProjectStore.getState().mediaAssets;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  let playhead = 0;
  try {
    playhead = getPlaybackClock().time;
  } catch {
    /* clock unavailable */
  }
  const lines = [
    project
      ? `PROJECT: ${project.name} ${project.canvasWidth}x${project.canvasHeight} @${project.frameRate}fps, duration ${r(getTimelineEndTime())}s, playhead ${r(playhead)}s`
      : "PROJECT: none open",
    `ASSETS: ${assets.map((a) => `${a.id}=${a.name}(${a.type},${r(a.duration)}s)`).join("; ") || "none"}`,
    `TIMELINE:`,
  ];
  for (const t of tracks) {
    const tc = clips.filter((c) => c.trackId === t.id).sort((a, b) => a.startTime - b.startTime);
    lines.push(`  track ${t.id} [${t.type}${t.locked ? ",locked" : ""}${t.muted ? ",muted" : ""}] ${t.name}`);
    for (const c of tc.slice(0, MAX_CLIPS)) {
      lines.push(`    clip ${c.id} ${r(c.startTime)}-${r(c.startTime + c.duration)}s media=${c.mediaId || "-"} kind=${c.kind ?? "video"}`);
    }
    if (tc.length > MAX_CLIPS) lines.push(`    ... ${tc.length - MAX_CLIPS} more (use list_clips)`);
  }
  return lines.join("\n");
}
