import { invoke } from "@tauri-apps/api/core";

const CHUNK_SIZE = 1024 * 1024;

type SaveResult = "original" | "remuxed" | "remux-failed";

export async function saveDesktopExport(blob: Blob, name: string) {
  const id = await invoke<string | null>("begin_export_save", {
    name,
    size: blob.size,
  });
  if (!id) return null;
  try {
    for (let start = 0; start < blob.size; start += CHUNK_SIZE) {
      const bytes = await blob.slice(start, start + CHUNK_SIZE).arrayBuffer();
      await invoke("write_export_chunk", bytes, {
        headers: { "salvador-export-id": id },
      });
    }
    return await invoke<SaveResult>("finish_export_save", { id });
  } catch (error) {
    // Preserve the original failure if the backend has already released the job.
    await invoke("abort_export_save", { id }).catch(() => undefined);
    throw error;
  }
}
