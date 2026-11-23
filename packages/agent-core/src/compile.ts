import type { Clip, Effect, Project, TextEffect, ZoomPanEffect } from "./timeline/schema";

export interface CompileOptions {
  range?: { startMs: number; endMs: number };
  proxy?: boolean;
  preset?: "youtube-1080p" | "tiktok-9x16" | "gif" | "audio-only";
}

function clipDurMs(c: { inMs: number; outMs: number; speed: number }): number {
  return Math.round((c.outMs - c.inMs) / c.speed);
}

function sourceDurMs(c: { inMs: number; outMs: number }): number {
  return c.outMs - c.inMs;
}

function atempoFilters(speed: number): string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`);
  return filters;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");
}

function effectFilters(e: Effect, clip: Clip): string[] {
  // GenericEffect (migrated v1 / plugin effects) is not compiled yet.
  if ("params" in e) return [];
  switch (e.type) {
    case "crop":
      return [`crop=${e.width}:${e.height}:${e.x}:${e.y}`];
    case "scale": {
      if (e.fit === "cover") {
        return [
          `scale=${e.width}:${e.height}:force_original_aspect_ratio=increase`,
          `crop=${e.width}:${e.height}`,
        ];
      }
      if (e.fit === "fill") return [`scale=${e.width}:${e.height}`];
      return [
        `scale=${e.width}:${e.height}:force_original_aspect_ratio=decrease`,
        `pad=${e.width}:${e.height}:(ow-iw)/2:(oh-ih)/2`,
      ];
    }
    case "colorAdjust": {
      const parts: string[] = [];
      if (e.brightness !== undefined) parts.push(`brightness=${e.brightness}`);
      if (e.contrast !== undefined) parts.push(`contrast=${e.contrast}`);
      if (e.saturation !== undefined) parts.push(`saturation=${e.saturation}`);
      if (e.gamma !== undefined) parts.push(`gamma=${e.gamma}`);
      return parts.length ? [`eq=${parts.join(":")}`] : [];
    }
    case "lut":
      return [`lut3d=file='${esc(e.path)}'`];
    case "blur":
      return [`gblur=sigma=${e.radius}`];
    case "fade": {
      const out: string[] = [];
      const dur = clipDurMs(clip) / 1000;
      if (e.inMs !== undefined && e.inMs > 0) out.push(`fade=t=in:st=0:d=${(e.inMs / 1000).toFixed(3)}`);
      if (e.outMs !== undefined && e.outMs > 0)
        out.push(`fade=t=out:st=${Math.max(0, dur - e.outMs / 1000).toFixed(3)}:d=${(e.outMs / 1000).toFixed(3)}`);
      return out;
    }
    case "text": {
      const te = e as TextEffect;
      const x = typeof te.x === "number" ? String(te.x) : (te.x ?? "(w-text_w)/2");
      const y = typeof te.y === "number" ? String(te.y) : (te.y ?? "(h-text_h)/2");
      const font = te.font ? `fontfile='${esc(te.font)}':` : "";
      return [
        `drawtext=${font}text='${esc(te.text)}':x=${x}:y=${y}:fontsize=${te.fontSize ?? 48}:fontcolor=${te.color ?? "white"}`,
      ];
    }
    case "zoomPan": {
      const ze = e as ZoomPanEffect;
      const z = ze.zoom ?? 1;
      return [`zoompan=z='${z}':x='${ze.panX ?? 0}':y='${ze.panY ?? 0}':d=1:s=1920x1080`];
    }
    default:
      return [];
  }
}

export function compileToFfmpeg(project: Project, opts: CompileOptions = {}): string[] {
  const preset = opts.preset ?? "youtube-1080p";
  const fps = project.settings.fps;

  const video: { clip: Clip; path: string; hasAudio: boolean }[] = [];
  for (const t of project.tracks) {
    if (t.kind !== "video" && t.kind !== "overlay") continue;
    if (t.muted) continue;
    for (const c of t.clips) {
      const asset = project.assets.find((a) => a.id === c.assetId);
      const path = opts.proxy && asset?.proxyPath ? asset.proxyPath : asset?.path ?? c.assetId;
      const hasAudio = asset ? asset.streams.length === 0 || asset.streams.some((s) => s.codecType === "audio") : true;
      video.push({ clip: c, path, hasAudio });
    }
  }
  video.sort((a, b) => a.clip.startMs - b.clip.startMs);

  const audio: { clip: Clip; path: string }[] = [];
  for (const t of project.tracks) {
    if (t.kind !== "audio" || t.muted) continue;
    for (const c of t.clips) {
      const asset = project.assets.find((a) => a.id === c.assetId);
      const path = opts.proxy && asset?.proxyPath ? asset.proxyPath : asset?.path ?? c.assetId;
      audio.push({ clip: c, path });
    }
  }
  audio.sort((a, b) => a.clip.startMs - b.clip.startMs);

  if (opts.range) {
    const { startMs, endMs } = opts.range;
    const keep = (c: Clip) => c.startMs < endMs && c.startMs + clipDurMs(c) > startMs;
    for (let i = video.length - 1; i >= 0; i--) if (!keep(video[i].clip)) video.splice(i, 1);
    for (let i = audio.length - 1; i >= 0; i--) if (!keep(audio[i].clip)) audio.splice(i, 1);
  }

  const args: string[] = ["-y"];
  let inputIndex = 0;
  const videoInput: number[] = [];
  for (const v of video) {
    const inSec = (v.clip.inMs / 1000).toFixed(3);
    const durSec = (sourceDurMs(v.clip) / 1000).toFixed(3);
    args.push("-ss", inSec, "-t", durSec, "-i", v.path);
    videoInput.push(inputIndex++);
  }
  const audioInput: number[] = [];
  for (const a of audio) {
    const inSec = (a.clip.inMs / 1000).toFixed(3);
    const durSec = (sourceDurMs(a.clip) / 1000).toFixed(3);
    args.push("-ss", inSec, "-t", durSec, "-i", a.path);
    audioInput.push(inputIndex++);
  }

  if (video.length === 0 && audio.length === 0) {
    if (preset === "audio-only") {
      args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=2", "-t", "1", "-c:a", "aac", "-b:a", "192k");
    } else {
      args.push(
        "-f", "lavfi", "-i", `color=c=black:s=${project.settings.width}x${project.settings.height}:r=${fps}`,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=2",
        "-t", "1", "-map", "0:v", "-map", "1:a", "-c:v", preset === "gif" ? "gif" : "libx264", "-c:a", "aac", "-shortest",
      );
    }
    return args;
  }

  const parts: string[] = [];
  // video chains
  const vLabels: string[] = [];
  let previousVideoEndMs = 0;
  video.forEach((v, n) => {
    const filters = [`setpts=PTS/${v.clip.speed}`];
    for (const e of v.clip.effects) filters.push(...effectFilters(e, v.clip));
    const gapMs = Math.max(0, v.clip.startMs - previousVideoEndMs);
    if (gapMs > 0) filters.push(`tpad=start_mode=add:start_duration=${(gapMs / 1000).toFixed(3)}:start_color=black`);
    parts.push(`[${videoInput[n]}:v]${filters.join(",")}[v${n}]`);
    vLabels.push(`[v${n}]`);
    previousVideoEndMs = Math.max(previousVideoEndMs, v.clip.startMs + clipDurMs(v.clip));
  });
  let videoOut = "outv";
  if (vLabels.length > 0) {
    parts.push(`${vLabels.join("")}concat=n=${vLabels.length}:v=1:a=0[outv]`);
    // Markers act as caption cues (subtitle tracks write markers).
    const markers = [...project.markers].sort((a, b) => a.timeMs - b.timeMs);
    if (markers.length > 0) {
      const draws = markers.map((m, i) => {
        const start = m.timeMs / 1000;
        const end = (markers[i + 1]?.timeMs ?? m.timeMs + 2000) / 1000;
        const color = m.color ?? "#ffff00";
        return `drawtext=text='${esc(m.label)}':x=(w-text_w)/2:y=h-120:fontsize=48:fontcolor=${color}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
      });
      parts.push(`[outv]${draws.join(",")}[outv_markers]`);
      videoOut = "outv_markers";
    }
  }

  // audio chains: video clips with audio + audio-track clips
  const aLabels: string[] = [];
  let an = 0;
  video.forEach((v, n) => {
    if (!v.hasAudio) return;
    const filters = [`asetpts=PTS-STARTPTS`, ...atempoFilters(v.clip.speed)];
    if (v.clip.volume !== 1) filters.push(`volume=${v.clip.volume}`);
    filters.push(`adelay=${v.clip.startMs}:all=1`);
    parts.push(`[${videoInput[n]}:a]${filters.join(",")}[a${an}]`);
    aLabels.push(`[a${an}]`);
    an++;
  });
  audio.forEach((a, n) => {
    const filters = [`asetpts=PTS-STARTPTS`, ...atempoFilters(a.clip.speed)];
    if (a.clip.volume !== 1) filters.push(`volume=${a.clip.volume}`);
    filters.push(`adelay=${a.clip.startMs}:all=1`);
    parts.push(`[${audioInput[n]}:a]${filters.join(",")}[a${an}]`);
    aLabels.push(`[a${an}]`);
    an++;
  });
  if (aLabels.length === 0) {
    parts.push("anullsrc=r=48000:cl=2[outa]");
  } else if (aLabels.length === 1) {
    parts.push(`${aLabels[0]}anull[outa]`);
  } else {
    parts.push(`${aLabels.join("")}amix=inputs=${aLabels.length}:duration=longest:normalize=0[outa]`);
  }

  args.push("-filter_complex", parts.join(";"));
  if (vLabels.length > 0) args.push("-map", `[${videoOut}]`);
  args.push("-map", "[outa]", "-r", String(fps));

  let w = project.settings.width;
  let h = project.settings.height;
  if (preset === "tiktok-9x16") {
    w = 1080;
    h = 1920;
  }
  args.push("-s", `${w}x${h}`);

  if (preset === "gif") {
    args.push("-c:v", "gif");
  } else if (preset === "audio-only") {
    args.push("-vn", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k");
  }

  return args;
}
