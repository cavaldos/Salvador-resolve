export const workspaceLayouts = {
  studio: {
    label: "Studio",
    description: "Media, preview and properties above the timeline",
  },
  "tall-player-right": {
    label: "Right Player",
    description: "Full-height preview to the right of the timeline",
  },
  "tall-player-left": {
    label: "Left Player",
    description: "Full-height preview to the left of the timeline",
  },
  "timeline-focus": {
    label: "Timeline Focus",
    description: "Larger timeline with track headers",
  },
  "cinema-preview": {
    label: "Cinema Preview",
    description: "Large preview with the side panels hidden",
  },
  "inspector-focus": {
    label: "Inspector Focus",
    description: "Wider properties panel for detailed editing",
  },
} as const;

export type WorkspaceLayout = keyof typeof workspaceLayouts;

export function maximumTimelineHeight(
  layout: WorkspaceLayout,
  viewportHeight: number,
) {
  return Math.max(
    120,
    Math.min(
      500,
      Math.floor(viewportHeight * (layout === "timeline-focus" ? 0.6 : 0.45)),
    ),
  );
}
