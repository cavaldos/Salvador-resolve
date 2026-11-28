import { convertFileSrc } from "@tauri-apps/api/core";

export interface FolderVideo {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
}

const authorizedMedia = new Map<string, Map<string, string>>();

export function registerFolderMedia(folderId: string, videos: FolderVideo[]) {
  authorizedMedia.set(folderId, new Map(videos.map((video) => [video.name, convertFileSrc(video.path)])));
}

export function getFolderMediaUrl(folderId: string, fileName: string): string {
  const url = authorizedMedia.get(folderId)?.get(fileName);
  if (!url) throw new Error(`Video "${fileName}" is missing from the project folder.`);
  return url;
}
