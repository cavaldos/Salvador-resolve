import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useProjectStore } from "@/modules/projects";
import { MIN_TRACK_HEADER_WIDTH, useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import { playbackClock } from "@/modules/editor/features/playback/services/playback-clock";
import { timelineTimeFromPosition } from "../utils/ruler-utils";
import type { TimelineClip, TrackType } from "@/modules/editor/types";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimeRuler } from "./TimeRuler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import type { ClipDragAppearance } from "./TimelineClipItem";
import { TimelineContextMenu } from "./TimelineContextMenu";
import { snapTimelineTime } from "../utils/timeline-snap-utils";
import { useTimelineInsertDrop } from "../hooks/useTimelineInsertDrop";
import { preventClipOverlap } from "@/modules/editor/utils/timeline-utils";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import {
  Video,
  GripVertical,
  Image as ImageIcon,
  Music,
  Plus,
  Move,
  Ban,
  Shapes,
  Type,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  DEFAULT_TIMELINE_ZOOM,
  getFitTimelineZoom,
  getMinimumTimelineZoom,
} from "../utils/timeline-zoom-utils";

const NEW_TRACK_DROP_THRESHOLD = 10;
const TRACK_TOP_GAP = 32;
// Keep headers aligned with their lanes until the reorder is committed.
const stationaryTrackSortingStrategy: SortingStrategy = () => null;

interface ClipDragPreview extends Partial<ClipDragAppearance> {
  clipId: string;
  clipName: string;
  clipType: TimelineClip["type"];
  targetStart: number;
  targetTrackId: string | null;
  targetTrackIndex: number;
  targetTrackType: TrackType;
  targetTrackName: string;
  createTrack: boolean;
  valid: boolean;
  duration: number;
}

function getPreferredTrack(clipType: TimelineClip["type"]): {
  type: TrackType;
  name: string;
} {
  switch (clipType) {
    case "video":
      return { type: "video", name: "Video Track" };
    case "audio":
      return { type: "audio", name: "Audio Track" };
    case "text":
      return { type: "text", name: "Text Track" };
    case "image":
      return { type: "overlay", name: "Image Track" };
    case "overlay":
      return { type: "overlay", name: "Overlay Track" };
  }
}

function getDragClipColor(clipType: TimelineClip["type"]) {
  switch (clipType) {
    case "video":
      return "bg-studio-panel border-studio-border text-studio-fg";
    case "image":
      return "bg-studio-panel border-studio-border text-studio-fg";
    case "audio":
      return "bg-emerald-950/40 border-emerald-500/50 text-emerald-300";
    case "text":
      return "bg-studio-panel-raised border-studio-border text-studio-fg";
    case "overlay":
      return "bg-studio-panel-raised border-studio-border text-studio-fg";
  }
}

function renderDragClipIcon(clipType: TimelineClip["type"]) {
  switch (clipType) {
    case "video":
      return <Video className="h-3.5 w-3.5 text-studio-muted shrink-0" />;
    case "image":
      return <ImageIcon className="h-3.5 w-3.5 text-studio-muted shrink-0" />;
    case "audio":
      return <Music className="h-3.5 w-3.5 text-studio-muted shrink-0" />;
    case "text":
      return <Type className="h-3.5 w-3.5 text-studio-muted shrink-0" />;
    case "overlay":
      return <Shapes className="h-3.5 w-3.5 text-studio-muted shrink-0" />;
  }
}

export function TimelineEditor() {
  const insertDrop = useTimelineInsertDrop();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const clipDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => clipDragCleanupRef.current?.(), []);
  const {
    currentProject,
    moveClip,
    moveClipToNewTrack,
    trimClip,
    reorderTracks,
  } = useProjectStore();
  const {
    zoom,
    trackHeight,
    setZoom,
    scrollLeft,
    setScrollLeft,
    snappingEnabled,
    clearSelection,
    trackHeaderWidth: rawTrackHeaderWidth,
    showTrackHeaders: savedShowTrackHeaders,
  } = useEditorUIStore();
  const trackHeaderWidth = Math.max(MIN_TRACK_HEADER_WIDTH, rawTrackHeaderWidth);
  const showTrackHeaders =
    savedShowTrackHeaders && (currentProject?.tracks.length ?? 0) > 0;
  const { playhead, isPlaying } = usePlaybackStore();

  const handleStartResizeTrackHeader = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = trackHeaderWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const rawWidth = startWidth + deltaX;

      // Snap to collapse if dragged below threshold
      if (rawWidth < MIN_TRACK_HEADER_WIDTH - 26) {
        useEditorUIStore.getState().setShowTrackHeaders(false);
        useEditorUIStore.getState().setTrackHeaderWidth(MIN_TRACK_HEADER_WIDTH);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        return;
      }

      useEditorUIStore.getState().setTrackHeaderWidth(rawWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const [isAltPressed, setIsAltPressed] = useState(false);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [clipDragPreview, setClipDragPreview] =
    useState<ClipDragPreview | null>(null);
  const [activeTrackDragId, setActiveTrackDragId] = useState<string | null>(
    null,
  );
  const [overTrackDragId, setOverTrackDragId] = useState<string | null>(null);
  const trackDragCursorRef = useRef("");
  const [timelineContextMenu, setTimelineContextMenu] = useState<{
    x: number;
    y: number;
    pasteTime: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const tracks = currentProject?.tracks || [];
  const projectDuration = currentProject?.settings.duration ?? 0;
  const timelineClipCount = tracks.reduce(
    (count, track) => count + track.clips.length,
    0,
  );
  const previousTimelineRef = useRef({
    projectId: currentProject?.id ?? "",
    duration: projectDuration,
    clipCount: timelineClipCount,
  });
  const fitTimelineZoom = getFitTimelineZoom(
    projectDuration,
    timelineViewportWidth,
  );
  const minimumTimelineZoom = getMinimumTimelineZoom(
    projectDuration,
    timelineViewportWidth,
  );
  const dragPreviewEnd = clipDragPreview
    ? clipDragPreview.targetStart + clipDragPreview.duration
    : 0;
  const visibleTimelineDuration = Math.max(projectDuration, dragPreviewEnd);
  const contentWidthPx = visibleTimelineDuration * zoom + 16 + 60;
  const isOverflowing =
    timelineViewportWidth > 0 && contentWidthPx > timelineViewportWidth;
  const totalWidthPx = isOverflowing ? Math.ceil(contentWidthPx) : 0;
  const playheadLeftPx = Math.round(16 + playhead * zoom - scrollLeft);
  const previousZoomRef = useRef(zoom);

  // Keep the visible playhead (or viewport center) in place while magnifying.
  useLayoutEffect(() => {
    const previousZoom = previousZoomRef.current;
    previousZoomRef.current = zoom;
    const element = scrollContainerRef.current;
    if (!element || previousZoom === zoom) return;
    const oldScroll = useEditorUIStore.getState().scrollLeft;
    const currentTime = usePlaybackStore.getState().playhead;
    const oldPlayheadX = 16 + currentTime * previousZoom - oldScroll;
    const screenX = Math.max(0, Math.min(element.clientWidth, oldPlayheadX));
    const playheadVisible = oldPlayheadX >= 0 && oldPlayheadX <= element.clientWidth;
    const anchorX = playheadVisible ? screenX : element.clientWidth / 2;
    const anchorTime = playheadVisible ? currentTime : (oldScroll + anchorX - 16) / previousZoom;
    element.scrollLeft = zoom === fitTimelineZoom ? 0 : Math.max(0, 16 + anchorTime * zoom - anchorX);
    rulerContainerRef.current?.scrollTo({ left: element.scrollLeft });
    setScrollLeft(element.scrollLeft);
  }, [zoom, fitTimelineZoom, setScrollLeft]);
  const activeTrackDrag = tracks.find(
    (track) => track.id === activeTrackDragId,
  );
  const activeTrackDragIndex = tracks.findIndex(
    (track) => track.id === activeTrackDragId,
  );
  const overTrackDragIndex = tracks.findIndex(
    (track) => track.id === overTrackDragId,
  );
  const trackDropPosition: "before" | "after" =
    activeTrackDragIndex >= 0 &&
    overTrackDragIndex >= 0 &&
    activeTrackDragIndex < overTrackDragIndex
      ? "after"
      : "before";

  const resetTrackDrag = () => {
    setActiveTrackDragId(null);
    setOverTrackDragId(null);

    document.body.style.cursor = trackDragCursorRef.current;
  };
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const updateViewportWidth = () => {
      setTimelineViewportWidth(element.clientWidth);
    };
    updateViewportWidth();

    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (timelineViewportWidth <= 0) return;

    const previous = previousTimelineRef.current;
    const projectId = currentProject?.id ?? "";

    if (timelineClipCount === 0) {
      if (zoom !== DEFAULT_TIMELINE_ZOOM) setZoom(DEFAULT_TIMELINE_ZOOM);
      if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = 0;
      if (scrollLeft !== 0) setScrollLeft(0);
    } else {
      const openedProject = previous.projectId !== projectId;
      const addedFirstClip = previous.clipCount === 0;
      const durationGrewSignificantly =
        previous.duration > 0 && projectDuration > previous.duration * 2;

      if (openedProject || addedFirstClip || durationGrewSignificantly) {
        setZoom(fitTimelineZoom);
        if (scrollContainerRef.current)
          scrollContainerRef.current.scrollLeft = 0;
        setScrollLeft(0);
      } else if (zoom < minimumTimelineZoom) {
        setZoom(minimumTimelineZoom);
      }
    }

    previousTimelineRef.current = {
      projectId,
      duration: projectDuration,
      clipCount: timelineClipCount,
    };
  }, [
    currentProject?.id,
    fitTimelineZoom,
    minimumTimelineZoom,
    projectDuration,
    scrollLeft,
    setScrollLeft,
    setZoom,
    timelineClipCount,
    timelineViewportWidth,
    zoom,
  ]);

  const handleTrackDragStart = (event: DragStartEvent) => {
    const trackId = String(event.active.id);
    trackDragCursorRef.current = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    setActiveTrackDragId(trackId);
    setOverTrackDragId(trackId);
  };

  const handleTrackDragOver = (event: DragOverEvent) => {
    setOverTrackDragId(event.over ? String(event.over.id) : null);
  };

  // Track reorder end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((t) => t.id === active.id);
      const newIndex = tracks.findIndex((t) => t.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) reorderTracks(oldIndex, newIndex);
    }
    resetTrackDrag();
  };

  // Alt key tracking for disabling snapping during drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") setIsAltPressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setIsAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const rulerContainerRef = useRef<HTMLDivElement>(null);
  const trackHeadersContainerRef = useRef<HTMLDivElement>(null);
  const syncedHeadersScrollTopRef = useRef(0);

  useEffect(() => {
    const restoredScrollLeft = useEditorUIStore.getState().scrollLeft;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = restoredScrollLeft;
    }
    rulerContainerRef.current?.scrollTo({ left: restoredScrollLeft });
  }, [currentProject?.id]);

  // Sync scroll positions across TimeRuler (horizontal) and Track Headers (vertical)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const newScrollLeft = target.scrollLeft;
    const newScrollTop = target.scrollTop;

    setScrollLeft(newScrollLeft);

    rulerContainerRef.current?.scrollTo({ left: newScrollLeft });
    if (trackHeadersContainerRef.current) {
      trackHeadersContainerRef.current.scrollTop = newScrollTop;
      syncedHeadersScrollTopRef.current =
        trackHeadersContainerRef.current.scrollTop;
    }
  };

  const handleHeadersScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    // Ignore scroll events caused by syncing from the lanes, including clamping.
    if (newScrollTop === syncedHeadersScrollTopRef.current) return;
    syncedHeadersScrollTopRef.current = newScrollTop;
    if (scrollContainerRef.current)
      scrollContainerRef.current.scrollTop = newScrollTop;
  };

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (isPlaying && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const playheadPx = playhead * zoom;
      if (
        playheadPx > el.scrollLeft + el.clientWidth - 100 ||
        playheadPx < el.scrollLeft
      ) {
        el.scrollLeft = Math.max(0, playheadPx - 100);
      }
    }
  }, [playhead, isPlaying, zoom]);

  // Pointer drag & trim handler
  const handleStartDragClip = (
    clip: TimelineClip,
    mode: "move" | "trim-start" | "trim-end",
    e: React.PointerEvent,
    appearance?: ClipDragAppearance,
  ) => {
    clipDragCleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialScrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
    const initialStart = clip.timelineStart;
    const initialDuration = clip.timelineDuration;
    const initialSourceStart = clip.sourceStart;
    const isSnapping = snappingEnabled && !isAltPressed;
    const preferredTrack = getPreferredTrack(clip.type);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let latestMovePreview: ClipDragPreview | null = null;
    let latestPointer: PointerEvent | null = null;
    let autoScrollFrame: number | null = null;

    if (mode === "move") {
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (moveEv.pointerId !== e.pointerId) return;
      moveEv.preventDefault();
      latestPointer = moveEv;
      if (mode === "move" && autoScrollFrame === null) {
        autoScrollFrame = requestAnimationFrame(autoScroll);
      }

      const scroller = scrollContainerRef.current;

      const scrollDeltaX =
        (scroller?.scrollLeft ?? initialScrollLeft) - initialScrollLeft;
      const deltaX =
        moveEv.clientX - startX + (mode === "move" ? scrollDeltaX : 0);
      const deltaY = moveEv.clientY - startY;
      const deltaSecs = deltaX / zoom;

      if (mode === "move") {
        const rawStart = Math.max(0, initialStart + deltaSecs);
        const snapRes = snapTimelineTime(
          rawStart,
          tracks,
          playhead,
          clip.id,
          zoom,
          isSnapping,
        );
        const targetStart = snapRes.snappedTime;
        setActiveSnapLine(snapRes.isSnapped ? snapRes.snappedTime : null);

        const rect = scroller?.getBoundingClientRect();
        const currentTrackIndex = tracks.findIndex(
          (track) => track.id === clip.trackId,
        );
        const pointerY =
          rect && scroller
            ? moveEv.clientY - rect.top + scroller.scrollTop - TRACK_TOP_GAP
            : (currentTrackIndex + 0.5) * trackHeight + deltaY;
        const isClearlyBelowLastTrack =
          pointerY >= tracks.length * trackHeight + NEW_TRACK_DROP_THRESHOLD;
        const pointerTrackIndex = Math.floor(pointerY / trackHeight);
        const createTrack = isClearlyBelowLastTrack;
        const requestedTrackIndex = createTrack
          ? tracks.length
          : Math.max(0, Math.min(tracks.length - 1, pointerTrackIndex));
        const targetTrackIndex = createTrack
          ? tracks.length
          : requestedTrackIndex;
        const targetTrack = createTrack ? null : tracks[targetTrackIndex];
        const valid =
          createTrack || Boolean(targetTrack && !targetTrack.locked);
        const safeStart = targetTrack
          ? preventClipOverlap(
              targetTrack.clips,
              clip.id,
              targetStart,
              clip.timelineDuration,
            )
          : targetStart;

        latestMovePreview = {
          ...appearance,
          clipId: clip.id,
          clipName: clip.name,
          clipType: clip.type,
          targetStart: safeStart,
          targetTrackId: targetTrack?.id ?? null,
          targetTrackIndex,
          targetTrackType: preferredTrack.type,
          targetTrackName: preferredTrack.name,
          createTrack,
          valid,
          duration: clip.timelineDuration,
        };
        setClipDragPreview(latestMovePreview);
      } else if (mode === "trim-start") {
        const rawStart = Math.max(0, initialStart + deltaSecs);
        const snapRes = snapTimelineTime(
          rawStart,
          tracks,
          playhead,
          clip.id,
          zoom,
          isSnapping,
        );

        // Cannot trim left past the start of the source video (sourceStart >= 0)
        const minTimelineStart =
          clip.type === "video" || clip.type === "audio"
            ? initialStart - initialSourceStart
            : 0;

        let newStart = Math.max(minTimelineStart, snapRes.snappedTime);
        newStart = Math.min(initialStart + initialDuration - 0.1, newStart);

        const newDuration = Math.max(
          0.1,
          initialDuration + (initialStart - newStart),
        );
        const newSourceStart = Math.max(
          0,
          initialSourceStart + (newStart - initialStart),
        );

        setActiveSnapLine(snapRes.isSnapped ? snapRes.snappedTime : null);
        trimClip(clip.id, newStart, newDuration, newSourceStart);
      } else if (mode === "trim-end") {
        const rawDuration = Math.max(0.1, initialDuration + deltaSecs);
        const rawEnd = initialStart + rawDuration;
        const snapRes = snapTimelineTime(
          rawEnd,
          tracks,
          playhead,
          clip.id,
          zoom,
          isSnapping,
        );
        const newEnd = snapRes.snappedTime;
        let newDuration = Math.max(0.1, newEnd - initialStart);

        // Clamp duration so clip duration does not exceed remaining source video/audio file length
        if (
          (clip.type === "video" || clip.type === "audio") &&
          clip.sourceDuration
        ) {
          const maxAvailable = Math.max(
            0.1,
            (clip.sourceDuration - initialSourceStart) / (clip.speed || 1),
          );
          newDuration = Math.min(maxAvailable, newDuration);
        }

        setActiveSnapLine(snapRes.isSnapped ? snapRes.snappedTime : null);
        trimClip(clip.id, initialStart, newDuration, initialSourceStart);
      }
    };

    const autoScroll = () => {
      const scroller = scrollContainerRef.current;
      if (scroller && latestPointer) {
        const rect = scroller.getBoundingClientRect();
        const edge = 36;
        const oldTop = scroller.scrollTop;
        const oldLeft = scroller.scrollLeft;
        if (latestPointer.clientY > rect.top + scroller.clientHeight - edge) {
          scroller.scrollTop += 8;
        } else if (latestPointer.clientY < rect.top + edge) {
          scroller.scrollTop -= 8;
        }
        if (latestPointer.clientX > rect.left + scroller.clientWidth - edge) {
          scroller.scrollLeft += 12;
        } else if (latestPointer.clientX < rect.left + edge) {
          scroller.scrollLeft -= 12;
        }
        if (oldTop !== scroller.scrollTop || oldLeft !== scroller.scrollLeft) {
          handlePointerMove(latestPointer);
        }
      }
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    const finishDrag = (commit: boolean) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleBlur);
      if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
      clipDragCleanupRef.current = null;

      if (commit && mode === "move" && latestMovePreview?.valid) {
        if (latestMovePreview.createTrack) {
          moveClipToNewTrack(
            clip.id,
            latestMovePreview.targetTrackType,
            latestMovePreview.targetStart,
            latestMovePreview.targetTrackName,
          );
        } else if (
          latestMovePreview.targetTrackId &&
          (latestMovePreview.targetTrackId !== clip.trackId ||
            Math.abs(latestMovePreview.targetStart - clip.timelineStart) >
              0.001)
        ) {
          moveClip(
            clip.id,
            latestMovePreview.targetTrackId,
            latestMovePreview.targetStart,
          );
        }
      }

      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setClipDragPreview(null);
      setActiveSnapLine(null);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === e.pointerId) finishDrag(true);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId === e.pointerId) finishDrag(false);
    };
    const handleBlur = () => finishDrag(false);
    clipDragCleanupRef.current = handleBlur;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleBlur);
  };

  // Compute dynamic scrubber line height: only extend down to the lowest track that has intersecting media
  return (
    <div className="@container/timeline flex h-full w-full flex-col overflow-hidden bg-studio-panel text-studio-fg select-none">
      {/* Top Timeline Toolbar */}
      <TimelineToolbar
        fitTimelineZoom={fitTimelineZoom}
        minimumTimelineZoom={minimumTimelineZoom}
      />

      {/* Fixed Time Ruler Header Row */}
      <div
        className={cn(
          "z-20 flex h-6 w-full shrink-0",
          timelineClipCount === 0 && "hidden",
        )}
      >
        {/* Left header corner over track headers */}
        <div
          style={{ width: `${trackHeaderWidth}px` }}
          className={cn(
            "shrink-0 border-b border-studio-border",
            !showTrackHeaders && "hidden",
          )}
        />

        {/* Resizer separator line */}
        <div
          className={cn(
            "w-px bg-studio-border shrink-0",
            !showTrackHeaders && "hidden",
          )}
        />

        {/* Time Ruler Horizontal Scroll Area */}
        <div className="relative min-w-0 flex-1">
          <div ref={rulerContainerRef} className="relative h-full overflow-hidden">
            <TimeRuler
              duration={visibleTimelineDuration}
              zoom={zoom}
              scrollLeft={scrollLeft}
              viewportWidth={timelineViewportWidth}
            />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            <div
              className="absolute inset-y-0 flex w-3 -translate-x-1/2 flex-col items-center"
              style={{ left: playheadLeftPx }}
            >
              <div className="h-3 w-[9px] shrink-0 rounded-t-[2px] rounded-b-[4px] border-2 border-studio-fg bg-studio-panel" />
              <div className="w-px flex-1 bg-studio-fg" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Multi-track Workspace Layout */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {/* Left Column: Track Headers (Vertical scroll synced with main container) */}
        <div
          ref={trackHeadersContainerRef}
          onScroll={handleHeadersScroll}
          onPointerDown={(e) => {
            if (e.button === 0 && e.target === trackHeadersContainerRef.current) {
              clearSelection();
            }
          }}
          style={{ width: `${trackHeaderWidth}px` }}
          className={cn(
            "z-10 flex shrink-0 flex-col overflow-x-hidden overflow-y-auto no-scrollbar",
            !showTrackHeaders && "hidden",
          )}
        >
          <div aria-hidden="true" className="shrink-0" style={{ height: TRACK_TOP_GAP }} />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={{
              canScroll: (element) =>
                element === trackHeadersContainerRef.current,
            }}
            onDragStart={handleTrackDragStart}
            onDragOver={handleTrackDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={resetTrackDrag}
          >
            <SortableContext
              items={tracks.map((t) => t.id)}
              strategy={stationaryTrackSortingStrategy}
            >
              {tracks.map((track) => {
                const reorderState =
                  activeTrackDragId === track.id
                    ? "active"
                    : overTrackDragId === track.id &&
                        overTrackDragId !== activeTrackDragId
                      ? "over"
                      : null;

                return (
                  <TrackHeader
                    key={track.id}
                    track={track}
                    trackHeight={trackHeight}
                    reorderState={reorderState}
                    reorderDropPosition={trackDropPosition}
                  />
                );
              })}
            </SortableContext>
            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay
                  zIndex={1000}
                  dropAnimation={{
                    duration: 180,
                    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }}
                >
                  {activeTrackDrag && (
                    <div
                      style={{
                        width: `${trackHeaderWidth - 8}px`,
                        height: trackHeight,
                      }}
                      className="pointer-events-none flex items-center gap-2 rounded-lg border border-studio-border-strong bg-studio-panel-raised/95 px-2 text-studio-fg shadow-2xl ring-1 ring-studio-border backdrop-blur-md"
                    >
                      <span className="flex h-6 w-4 shrink-0 items-center justify-center text-studio-muted">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="shrink-0">
                        {renderDragClipIcon(activeTrackDrag.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-studio-fg">
                          {activeTrackDrag.name}
                        </div>
                        <div className="text-[9px] text-studio-muted">
                          {activeTrackDrag.clips.length}{" "}
                          {activeTrackDrag.clips.length === 1
                            ? "clip"
                            : "clips"}
                        </div>
                      </div>
                      <span className="shrink-0 rounded bg-studio-hover px-1.5 py-0.5 text-[9px] font-medium text-studio-fg">
                        Moving
                      </span>
                    </div>
                  )}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
          {clipDragPreview && (
            <div
              style={{ height: trackHeight }}
              className="flex shrink-0 items-center gap-2 border-y border-dashed border-studio-border-strong bg-studio-hover/50 px-3 text-studio-fg"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-studio-hover text-studio-fg">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold">
                  Create {clipDragPreview.targetTrackName}
                </div>
                <div className="truncate text-[9px] text-studio-muted">
                  Release to add this track
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resizer Handle for Track Headers Width */}
        <div
          onPointerDown={handleStartResizeTrackHeader}
          className={cn(
            "relative z-30 h-full w-px shrink-0 cursor-col-resize bg-studio-border transition-colors after:absolute after:inset-y-0 after:-inset-x-1 hover:bg-studio-fg/40 active:bg-studio-fg/60",
            !showTrackHeaders && "hidden",
          )}
          title="Drag to resize track headers"
        />

        {/* Right Area: Track Canvas Lanes */}
        <div
          ref={scrollContainerRef}
          data-timeline-drop-zone
          {...insertDrop.handlers}
          onScroll={handleScroll}
          onPointerDown={(e) => {
            const target = e.target as HTMLElement | null;
            if (
              target &&
              (target.id?.startsWith("timeline-clip-") ||
                target.closest('[id^="timeline-clip-"]'))
            ) {
              return;
            }
            if (e.button === 0) {
              clearSelection();
              const rect = e.currentTarget.getBoundingClientRect();
              const position = e.clientX - rect.left + e.currentTarget.scrollLeft - 16;
              const { duration, fps, setIsPlaying } = usePlaybackStore.getState();
              setIsPlaying(false);
              playbackClock.seek(timelineTimeFromPosition(position, zoom, duration, fps));
            }
          }}
          onContextMenu={(e) => {
            // Right-click on empty timeline area
            const target = e.target as HTMLElement | null;
            if (
              target &&
              (target.id.startsWith("timeline-clip-") ||
                target.closest('[id^="timeline-clip-"]'))
            ) {
              return; // Clip right-click handled inside TimelineClipItem
            }
            e.preventDefault();
            const rect = scrollContainerRef.current?.getBoundingClientRect();
            const clickX = rect
              ? e.clientX -
                rect.left +
                (scrollContainerRef.current?.scrollLeft || 0) -
                16
              : 0;
            const pasteTime = Math.max(0, clickX / zoom);
            setTimelineContextMenu({ x: e.clientX, y: e.clientY, pasteTime });
          }}
          className="flex-1 overflow-auto relative h-full timeline-bottom-scrollbar"
        >
          {insertDrop.hover && (
            <div
              aria-hidden="true"
              className={cn("pointer-events-none absolute inset-y-0 z-50 w-0.5", insertDrop.hover.valid ? "bg-brand" : "bg-destructive")}
              style={{ left: 16 + insertDrop.hover.time * zoom }}
            />
          )}
          {insertDrop.isImporting && (
            <p role="status" className="pointer-events-none absolute bottom-2 right-3 z-50 rounded-md bg-studio-panel px-2 py-1 text-xs">
              Importing files…
            </p>
          )}
          {/* Track Lanes */}
          {tracks.length === 0 ? (
            <div className="flex h-full min-h-32 w-full items-center justify-center px-6 py-5 text-center">
              <div className="flex max-w-md flex-col items-center">
                <div className="mb-3 flex items-center gap-3">
                  <span aria-hidden="true" className="h-px w-6 bg-studio-fg/10" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-studio-muted/70">
                    Timeline
                  </p>
                  <span aria-hidden="true" className="h-px w-6 bg-studio-fg/10" />
                </div>
                <p className="text-xl font-medium leading-tight tracking-tight text-studio-fg/90 sm:text-2xl">
                  Start with your first clip
                </p>
                <p className="mt-3 max-w-xs text-xs leading-6 text-studio-muted">
                  Drag media, files, text, or shapes here, or add them from the library.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative flex h-fit w-full flex-col"
              style={{ marginTop: TRACK_TOP_GAP, minWidth: totalWidthPx || undefined }}
            >
              {tracks.map((track) => {
                const isDropTarget = Boolean(
                  clipDragPreview &&
                  !clipDragPreview.createTrack &&
                  clipDragPreview.targetTrackId === track.id,
                );

                return (
                  <TrackLane
                    key={track.id}
                    track={track}
                    trackHeight={trackHeight}
                    zoom={zoom}
                    totalWidthPx={totalWidthPx}
                    draggingClipId={clipDragPreview?.clipId}
                    reorderState={
                      activeTrackDragId === track.id
                        ? "active"
                        : overTrackDragId === track.id &&
                            overTrackDragId !== activeTrackDragId
                          ? "over"
                          : null
                    }
                    reorderDropPosition={trackDropPosition}
                    dropState={
                      isDropTarget
                        ? clipDragPreview?.valid
                          ? "valid"
                          : "invalid"
                        : null
                    }
                    onStartDragClip={handleStartDragClip}
                  />
                );
              })}

              <div
                aria-hidden={!clipDragPreview && !insertDrop.hover}
                style={{ height: clipDragPreview ? trackHeight : 28 }}
                className={cn(
                  "relative flex w-full items-center gap-2 border-t border-dashed border-transparent px-4 text-[11px] text-transparent",
                  (clipDragPreview || insertDrop.hover) && "border-studio-border text-studio-muted",
                  clipDragPreview?.createTrack && "bg-studio-hover/50 text-studio-fg",
                )}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Drop here to create a track
              </div>

              {clipDragPreview && (
                <div
                  style={{
                    left: `${16 + clipDragPreview.targetStart * zoom}px`,
                    top: `${clipDragPreview.targetTrackIndex * trackHeight + 4}px`,
                    width: `${Math.max(12, clipDragPreview.duration * zoom)}px`,
                    height: trackHeight - 8,
                  }}
                  className={cn(
                    "pointer-events-none absolute z-50 flex items-center justify-between overflow-hidden rounded-lg border-2 border-dashed px-2 shadow-xl backdrop-blur-sm",
                    clipDragPreview.valid
                      ? getDragClipColor(clipDragPreview.clipType)
                      : "border-destructive bg-destructive/20 text-destructive",
                  )}
                >
                  {clipDragPreview.thumbnailUrl && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-black/20"
                      style={{
                        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.35), transparent), url(${JSON.stringify(clipDragPreview.thumbnailUrl)})`,
                        backgroundSize: `auto, ${Math.max(30, Math.round((trackHeight - 8) * (clipDragPreview.aspectRatio ?? 16 / 9)))}px 100%`,
                        backgroundRepeat: "no-repeat, repeat-x",
                      }}
                    />
                  )}
                  <div className={cn(
                    "relative flex min-w-0 items-center gap-1.5",
                    clipDragPreview.thumbnailUrl && "[&>svg]:text-white/90",
                  )}>
                    {renderDragClipIcon(clipDragPreview.clipType)}
                    <span className={cn(
                      "truncate text-[11px] font-semibold text-studio-fg",
                      clipDragPreview.thumbnailUrl && "text-white drop-shadow-sm",
                    )}>
                      {clipDragPreview.clipName}
                    </span>
                  </div>
                  <span className={cn(
                    "relative ml-2 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-semibold leading-none shadow-sm",
                    !clipDragPreview.valid
                      ? "border-destructive/40 bg-studio-bg/95 text-destructive"
                      : clipDragPreview.createTrack
                        ? "border-studio-fg/15 bg-studio-fg text-studio-bg"
                        : "border-studio-border-strong bg-studio-bg/95 text-studio-fg",
                  )}>
                    {!clipDragPreview.valid ? (
                      <Ban aria-hidden="true" className="h-3 w-3" />
                    ) : clipDragPreview.createTrack ? (
                      <Plus aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <Move aria-hidden="true" className="h-3 w-3" />
                    )}
                    {clipDragPreview.createTrack
                      ? "New track"
                      : clipDragPreview.valid
                        ? "Move"
                        : "Not allowed"}
                  </span>
                </div>
              )}

              {/* Active Snapping Guideline */}
              {activeSnapLine !== null && (
                <div
                  style={{ left: `${16 + activeSnapLine * zoom}px` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-studio-fg z-40 pointer-events-none shadow-[0_0_6px_rgba(0,0,0,0.3)] dark:shadow-[0_0_6px_rgba(255,255,255,0.8)] -translate-x-1/2"
                />
              )}
            </div>
          )}
        </div>

        {timelineClipCount > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-30 overflow-hidden"
            style={{ left: showTrackHeaders ? trackHeaderWidth + 1 : 0 }}
          >
            <div
              className="absolute inset-y-0 w-px -translate-x-1/2 bg-studio-fg"
              style={{ left: playheadLeftPx }}
            />
          </div>
        )}
      </div>

      {timelineContextMenu && (
        <TimelineContextMenu
          x={timelineContextMenu.x}
          y={timelineContextMenu.y}
          pasteTime={timelineContextMenu.pasteTime}
          onClose={() => setTimelineContextMenu(null)}
        />
      )}
    </div>
  );
}
