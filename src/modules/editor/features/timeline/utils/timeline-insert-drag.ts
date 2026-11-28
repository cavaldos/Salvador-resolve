import type { DragEvent } from "react";
import { nanoid } from "nanoid";
import type { TimelineClip, Track } from "@/modules/editor/types";

const dragType = "application/x-salvador-timeline-item";

export interface TimelineInsertPosition {
  time: number;
  trackId: string | null;
}

type ClipType = TimelineClip["type"];
let active: {
  id: string;
  type: ClipType;
  insert: (position: TimelineInsertPosition) => unknown;
} | null = null;

export function timelineInsertDragProps(
  type: ClipType,
  insert: (position: TimelineInsertPosition) => unknown,
) {
  return {
    draggable: true,
    onDragStart(event: DragEvent) {
      if ((event.target as Element).closest("input, textarea, [contenteditable]")) {
        event.preventDefault();
        return;
      }
      active = { id: nanoid(), type, insert };
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(dragType, active.id);
    },
    onDragEnd() {
      active = null;
    },
  };
}

export function getTimelineInsertDrag(transfer: DataTransfer, dropping = false) {
  if (!active || !transfer.types.includes(dragType)) return null;
  return dropping && transfer.getData(dragType) !== active.id ? null : active;
}

export function acceptsTimelineInsert(track: Track, type: ClipType) {
  if (track.locked) return false;
  if (type === "image") return track.type === "video" || track.type === "overlay";
  return track.type === type;
}
