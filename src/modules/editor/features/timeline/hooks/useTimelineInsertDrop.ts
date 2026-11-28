import { useState, type DragEvent } from "react";
import { useProjectStore } from "@/modules/projects";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import { useMediaImporter } from "@/modules/editor/features/media-library/hooks/useMediaImporter";
import { addMediaAssetToTimeline } from "@/modules/editor/features/media-library/utils/add-media-asset-to-timeline";
import { acceptsTimelineInsert, getTimelineInsertDrag } from "../utils/timeline-insert-drag";
import { snapTimelineTime } from "../utils/timeline-snap-utils";

function getDropPosition(event: DragEvent<HTMLDivElement>) {
  const { currentTarget, clientX, target, altKey } = event;
  const project = useProjectStore.getState().currentProject;
  if (!project) return null;
  const lane = (target as Element).closest<HTMLElement>("[data-timeline-track]");
  const track = project.tracks.find(({ id }) => id === lane?.dataset.timelineTrack);
  const { zoom, snappingEnabled } = useEditorUIStore.getState();
  const offset = clientX - currentTarget.getBoundingClientRect().left + currentTarget.scrollLeft - 16;
  const { snappedTime } = snapTimelineTime(
    offset / zoom, project.tracks, usePlaybackStore.getState().playhead,
    undefined, zoom, snappingEnabled && !altKey,
  );
  const fps = project.settings.fps || 30;
  return { track, time: Math.round(snappedTime * fps) / fps };
}

export function useTimelineInsertDrop() {
  const [hover, setHover] = useState<{ time: number; valid: boolean } | null>(null);
  const { importFiles, isImporting } = useMediaImporter();

  return {
    hover,
    isImporting,
    handlers: {
      onDragOver(event: DragEvent<HTMLDivElement>) {
        const item = getTimelineInsertDrag(event.dataTransfer);
        if (!item && !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        const position = getDropPosition(event);
        if (!position) return;
        const { track, time } = position;
        const valid = !track?.locked && (item ? !track || acceptsTimelineInsert(track, item.type) : !isImporting);
        event.dataTransfer.dropEffect = valid ? "copy" : "none";
        setHover((previous) => previous?.time === time && previous.valid === valid ? previous : { time, valid });
      },
      onDragLeave(event: DragEvent<HTMLDivElement>) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null);
      },
      async onDrop(event: DragEvent<HTMLDivElement>) {
        setHover(null);
        const item = getTimelineInsertDrag(event.dataTransfer, true);
        const files = Array.from(event.dataTransfer.files);
        if (!item && !files.length) return;
        event.preventDefault();
        const position = getDropPosition(event);
        if (!position || position.track?.locked) return;
        const { track, time } = position;
        if (item) {
          if (!track || acceptsTimelineInsert(track, item.type)) item.insert({ time, trackId: track?.id ?? null });
          return;
        }
        if (isImporting) return;
        const projectId = useProjectStore.getState().currentProject?.id;
        const assets = await importFiles(files);
        if (useProjectStore.getState().currentProject?.id !== projectId) return;
        const lastByTrack = new Map<string, { id: string; end: number }>();
        for (const asset of assets) {
          const project = useProjectStore.getState().currentProject;
          const target = project?.tracks.find(({ id }) => id === track?.id);
          const preferred = target && acceptsTimelineInsert(target, asset.type) ? target.id : null;
          const group = preferred ?? asset.type;
          const last = lastByTrack.get(group);
          const clip = addMediaAssetToTimeline(asset, { time: last?.end ?? time, trackId: last?.id ?? preferred });
          if (clip) lastByTrack.set(group, { id: clip.trackId, end: clip.timelineStart + clip.timelineDuration });
        }
      },
    },
  };
}
