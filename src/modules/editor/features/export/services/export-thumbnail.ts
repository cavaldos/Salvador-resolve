import { isTauri } from "@tauri-apps/api/core";
import { db } from "@/modules/core/db/database";
import { resolveMediaAssetUrl } from "@/modules/core/storage/media-source-service";
import { loadTextFonts } from "@/modules/editor/features/text/utils/text-fonts";
import type { Project } from "@/modules/projects/types";
import { saveDesktopExport } from "./desktop-export-save";
import { renderExportFrame, type ExportMediaSource } from "./exportCompositor";
import { loadExportMediaElement } from "./export-media-loader";
import { getExportFilename } from "./export-settings";

function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.001) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(fail, 5000);
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    }
    function done() {
      cleanup();
      resolve();
    }
    function fail() {
      cleanup();
      reject(new Error("The video frame could not be decoded."));
    }
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    try {
      video.currentTime = time;
    } catch {
      fail();
    }
  });
}

export async function exportThumbnail(project: Project, playhead: number) {
  const time = Math.max(
    0,
    Math.min(playhead, project.settings.duration - 0.001),
  );
  const clips = project.tracks
    .filter((track) => !track.hidden)
    .flatMap((track) =>
      track.clips.filter(
        (clip) =>
          !(clip as { hidden?: boolean }).hidden &&
          clip.timelineStart <= time &&
          time < clip.timelineStart + clip.timelineDuration,
      ),
    );
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open the thumbnail renderer.");
  const media = new Map<string, ExportMediaSource>();
  try {
    await loadTextFonts(
      clips.flatMap((clip) =>
        clip.type === "text" && clip.textStyle ? [clip.textStyle] : [],
      ),
    );
    for (const clip of clips) {
      if (!clip.assetId || (clip.type !== "video" && clip.type !== "image"))
        continue;
      const asset = await db.assets.get(clip.assetId);
      if (!asset) throw new Error("A media file at the playhead is missing.");
      const url = await resolveMediaAssetUrl(asset);
      if (clip.type === "image") {
        const image = new Image();
        if (asset.remoteUrl || asset.source?.kind === "remote")
          image.crossOrigin = "anonymous";
        await loadExportMediaElement(image, url, () => false);
        media.set(clip.id, image);
      } else {
        const video = document.createElement("video");
        media.set(clip.id, video);
        video.preload = "auto";
        video.muted = true;
        if (asset.remoteUrl || asset.source?.kind === "remote" || asset.source?.kind === "folder")
          video.crossOrigin = "anonymous";
        await loadExportMediaElement(video, url, () => false);
        const sourceTime =
          clip.sourceStart + (time - clip.timelineStart) * (clip.speed || 1);
        await seekVideo(
          video,
          Math.max(0, Math.min(sourceTime, video.duration - 0.001)),
        );
      }
    }
    renderExportFrame({
      canvas,
      ctx,
      project,
      currentTime: time,
      exportWidth: project.settings.width,
      exportHeight: project.settings.height,
      mediaElementsMap: media,
    });
  } finally {
    for (const element of media.values()) {
      if (!(element instanceof HTMLVideoElement)) continue;
      element.removeAttribute("src");
      element.load();
    }
  }
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob?.size
          ? resolve(blob)
          : reject(new Error("Could not encode the thumbnail.")),
      "image/png",
    );
  });
  const name = getExportFilename(
    `${project.name.slice(0, 60)}-thumbnail`,
    "png",
  );
  if (isTauri()) return (await saveDesktopExport(png, name)) !== null;

  const url = URL.createObjectURL(png);
  const download = document.createElement("a");
  download.href = url;
  download.download = name;
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
