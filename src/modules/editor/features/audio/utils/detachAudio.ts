import { db } from "@/modules/core/db/database";
import { resolveMediaAssetBlob } from "@/modules/core/storage/media-source-service";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { useProjectStore } from "@/modules/projects";
import { useToastStore } from "@/shared/components/ui/Toast/useToastStore";

export async function detachAudioFromVideo(clipId: string) {
  const project = useProjectStore.getState().currentProject;
  const track = project?.tracks.find((item) => item.clips.some((clip) => clip.id === clipId));
  const clip = track?.clips.find((item) => item.id === clipId);
  if (!project || track?.locked || !clip?.assetId || clip.type !== "video" || clip.audio?.muted) return;
  const toast = useToastStore.getState().showToast;
  try {
    const asset = await db.assets.get(clip.assetId);
    if (!asset) throw new Error("The source video is missing.");
    const { Input, ALL_FORMATS, BlobSource } = await import("mediabunny");
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await resolveMediaAssetBlob(asset)) });
    try {
      if (!(await input.getPrimaryAudioTrack())) {
        toast("This video has no audio track.", "warning");
        return;
      }
    } finally {
      input.dispose();
    }
    const store = useProjectStore.getState();
    if (store.currentProject?.id !== project.id) return;
    const audioClipId = store.detachClipAudio(clip.id, asset.id);
    if (audioClipId) useEditorUIStore.getState().setSelectedClipIds([audioClipId]);
  } catch (error) {
    toast(`Could not detach audio: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}
