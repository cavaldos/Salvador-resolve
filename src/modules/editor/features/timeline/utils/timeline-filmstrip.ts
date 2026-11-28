import type { MediaAsset } from "@/modules/projects/types";

export const MAX_FILMSTRIP_FRAMES = 32;

export function getFilmstripSampleTimes(start: number, end: number, count: number) {
  return Array.from({ length: count }, (_, i) => start + (end - start) * (i + 0.5) / count);
}

export function getFilmstripFrameIndex(tile: number, tileCount: number, frameCount: number) {
  return Math.min(frameCount - 1, Math.floor((tile + 0.5) / tileCount * frameCount));
}

const cache = new Map<string, Promise<string[]>>();
let queue = Promise.resolve();

function waitForVideo(video: HTMLVideoElement, event: "loadeddata" | "seeked", start: () => void) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(fail, 4000);
    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
    }
    function done() {
      cleanup();
      resolve();
    }
    function fail() {
      cleanup();
      reject(new Error("Could not load video frame"));
    }
    video.addEventListener(event, done);
    video.addEventListener("error", fail);
    try {
      start();
    } catch {
      fail();
    }
  });
}

async function decodeFilmstrip(asset: MediaAsset, sourceStart: number, sourceDuration: number, count: number) {
  const { getMediaSourceRef, resolveMediaAssetUrl } = await import("@/modules/core/storage/media-source-service");
  const url = await resolveMediaAssetUrl(asset);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  if (getMediaSourceRef(asset).kind === "remote") video.crossOrigin = "anonymous";

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return [];
  try {
    await waitForVideo(video, "loadeddata", () => { video.src = url; });
    const end = Math.min(video.duration, sourceStart + sourceDuration);
    if (!Number.isFinite(end) || end <= sourceStart || !video.videoWidth || !video.videoHeight) return [];
    const scale = 128 / Math.max(video.videoWidth, video.videoHeight);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const frames: string[] = [];
    for (const time of getFilmstripSampleTimes(sourceStart, end, count)) {
      if (Math.abs(video.currentTime - time) > 0.001) {
        await waitForVideo(video, "seeked", () => { video.currentTime = time; });
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.72));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function getVideoFilmstrip(asset: MediaAsset, start: number, duration: number, count: number) {
  const key = JSON.stringify([asset.id, start, duration, count]);
  const existing = cache.get(key);
  if (existing) return existing;

  // shortcut: share a small in-memory cache; move to disk if frame decoding becomes a bottleneck on large projects.
  const pending = queue.then(() => decodeFilmstrip(asset, start, duration, count)).catch(() => []);
  queue = pending.then(() => {});
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, pending);
  return pending;
}
