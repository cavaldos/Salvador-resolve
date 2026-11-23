/**
 * Timeline toolbar clip quick-actions (mirror, rotate, crop).
 *
 * Every mutation goes through the history store as an undoable
 * UpdateClipCommand; multi-clip selections are grouped in one transaction so a
 * single undo reverts the whole action.
 */

import { useHistoryStore } from "@/store/historyStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useUIStore } from "@/store/uiStore";
import { UpdateClipCommand } from "@/core/history/commands/UpdateClipCommand";
import { FOCUS_PROPERTY_SECTION_EVENT } from "@/components/editor/properties/primitives/PropertySection";
import type { Clip } from "@/types";

function getEditableSelectedClips(): Clip[] {
  const { selectedClipIds } = useUIStore.getState();
  const { clips, tracks } = useTimelineStore.getState();
  return clips.filter(
    (clip) =>
      selectedClipIds.includes(clip.id) &&
      !tracks.find((track) => track.id === clip.trackId)?.locked,
  );
}

function applyToSelection(
  label: string,
  build: (clip: Clip) => { before: Partial<Clip>; after: Partial<Clip> },
): void {
  const targets = getEditableSelectedClips();
  if (targets.length === 0) return;
  const history = useHistoryStore.getState();
  history.beginTransaction(label);
  try {
    for (const clip of targets) {
      const { before, after } = build(clip);
      history.execute(new UpdateClipCommand(clip.id, before, after));
    }
    history.commitTransaction();
  } catch (error) {
    history.rollbackTransaction();
    throw error;
  }
}

/** Flip the selected clip(s) horizontally (negative width encodes a horizontal flip). */
export function mirrorSelectedClips(): void {
  applyToSelection("Mirror Clip", (clip) => ({
    before: { width: clip.width },
    after: { width: -clip.width },
  }));
}

/** Rotate the selected clip(s) 90 degrees clockwise. */
export function rotateSelectedClips90(): void {
  applyToSelection("Rotate Clip 90°", (clip) => ({
    before: { rotation: clip.rotation ?? 0 },
    after: { rotation: (((clip.rotation ?? 0) + 90) % 360 + 360) % 360 },
  }));
}

/**
 * Crop has no dedicated clip model yet; open the Transform section (which owns
 * conform/fill cropping) in the properties panel for the selected clip.
 */
export function focusCropControls(): void {
  const [first] = getEditableSelectedClips();
  if (!first) return;
  useUIStore.getState().selectClip(first.id);
  useUIStore.getState().setActivePanel("properties");
  // Let the properties panel mount for the selection before targeting it.
  setTimeout(
    () =>
      window.dispatchEvent(
        new CustomEvent(FOCUS_PROPERTY_SECTION_EVENT, { detail: "Transform" }),
      ),
    50,
  );
}
