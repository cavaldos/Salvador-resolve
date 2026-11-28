import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { db, type StoredThumbnail } from "@/modules/core/db/database";
import { registerFolderMedia, type FolderVideo } from "@/modules/core/storage/folder-media-source";
import { prepareFolderVideo } from "@/modules/editor/features/media-library/services/media-import-service";
import { useToastStore } from "@/shared/components/ui/Toast/useToastStore";
import type { MediaAsset, Project } from "../types";
import { makeProject } from "../utils/project-utils";
import { readFolderProject, writeFolderProject } from "./folder-project-document";

interface FolderSnapshot {
  id: string;
  name: string;
  document: string | null;
  revision: string | null;
  videos: FolderVideo[];
}

const revisions = new Map<string, string | null>();
const opening = new Map<string, Promise<Project>>();

async function writeProjectFile(project: Project) {
  if (!project.folder) return;
  const folderId = project.folder.id;
  if (!revisions.has(folderId)) throw new Error("Open the project folder before saving.");
  const revision = await invoke<string>("save_project_folder", {
    folderId,
    document: writeFolderProject(project),
    expectedRevision: revisions.get(folderId),
  });
  revisions.set(folderId, revision);
}

export async function persistProject(project: Project) {
  await writeProjectFile(project);
  await db.projects.put(project);
}

export async function chooseProjectFolder(): Promise<Project | null> {
  const snapshot = await invoke<FolderSnapshot | null>("open_project_folder");
  return snapshot && restoreFolderProject(snapshot);
}

export function reopenFolderProject(folderId: string, expectedProjectId: string): Promise<Project> {
  const key = JSON.stringify([folderId, expectedProjectId]);
  const pending = opening.get(key);
  if (pending) return pending;
  const operation = invoke<FolderSnapshot>("open_project_folder", { folderId })
    .then((snapshot) => restoreFolderProject(snapshot, expectedProjectId))
    .finally(() => opening.delete(key));
  opening.set(key, operation);
  return operation;
}

async function restoreFolderProject(snapshot: FolderSnapshot, expectedProjectId?: string): Promise<Project> {
  const saved = snapshot.document === null ? null : readFolderProject(snapshot.document);
  const project: Project = saved?.project ?? makeProject(snapshot.name, { duration: 0 });
  if (expectedProjectId && project.id !== expectedProjectId) {
    throw new Error("This folder contains a different project. Use Open folder to open it.");
  }
  const localProject = await db.projects.get(project.id);
  if (localProject && !localProject.folder) {
    throw new Error("This folder project conflicts with an existing local project.");
  }

  const files = saved?.files ?? [];
  project.folder = { id: snapshot.id, files };
  const byName = new Map(files.map((file) => [file.name, file]));
  const videos = new Map(snapshot.videos.map((video) => [video.name, video]));
  const activeIds = new Set(project.assetIds);
  const storedIds = [...new Set([...activeIds, ...files.map((file) => file.id)])];
  const existing = new Map((await db.assets.bulkGet(storedIds)).flatMap((asset) => asset ? [[asset.id, asset]] : []));
  if ([...existing.values()].some((asset) => asset.projectId !== project.id) ||
      files.some(({ id }) => existing.has(id) && existing.get(id)?.source?.kind !== "folder")) {
    throw new Error("This folder project conflicts with media from another project.");
  }

  registerFolderMedia(snapshot.id, snapshot.videos);
  const assets: MediaAsset[] = [];
  const thumbnails: StoredThumbnail[] = [];
  let added = false;
  let unavailable = 0;
  const knownIds = new Set(files.map((file) => file.id));
  for (const assetId of activeIds) {
    if (!knownIds.has(assetId) && !existing.has(assetId)) unavailable++;
  }
  for (const file of files) {
    if (activeIds.has(file.id) && !videos.has(file.name)) {
      unavailable++;
      const cached = existing.get(file.id);
      if (cached?.source?.kind === "folder") {
        assets.push({ ...cached, source: { ...cached.source, folderId: snapshot.id, fileName: file.name } });
      }
    }
  }

  // Bound concurrent decoders when a directory contains many videos.
  for (let start = 0; start < snapshot.videos.length; start += 4) {
    const batch = snapshot.videos.slice(start, start + 4);
    const prepared = await Promise.all(batch.map(async (video) => {
      const known = byName.get(video.name);
      if (known && !activeIds.has(known.id)) return null;
      const id = known?.id ?? nanoid();
      const cached = existing.get(id);
      if (cached?.source?.kind === "folder" && cached.source.fileName === video.name &&
          cached.source.modifiedAt === video.modifiedAt && cached.size === video.size) {
        return { asset: { ...cached, source: { ...cached.source, folderId: snapshot.id } } };
      }
      try {
        return await prepareFolderVideo(video, id, project.id, snapshot.id);
      } catch (error) {
        console.warn(`Could not open ${video.name}:`, error);
        unavailable++;
        return null;
      }
    }));
    for (const item of prepared) {
      if (!item) continue;
      assets.push(item.asset);
      if ("thumbnail" in item && item.thumbnail) thumbnails.push(item.thumbnail);
      const fileName = item.asset.source?.kind === "folder" ? item.asset.source.fileName : item.asset.name;
      if (!byName.has(fileName)) {
        files.push({ id: item.asset.id, name: fileName });
        project.assetIds.push(item.asset.id);
        added = true;
      }
    }
  }

  revisions.set(snapshot.id, snapshot.revision);
  if (!saved || added) await writeProjectFile(project);
  await db.transaction("rw", db.projects, db.assets, db.thumbnails, async () => {
    await db.projects.put(project);
    await db.assets.bulkPut(assets);
    await db.thumbnails.bulkPut(thumbnails);
  });
  if (unavailable) {
    useToastStore.getState().showToast(`${unavailable} media file(s) could not be opened. Existing timeline clips were kept.`, "warning");
  }
  return project;
}
