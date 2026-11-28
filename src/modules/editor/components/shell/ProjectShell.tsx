import React, { lazy, Suspense, useEffect, useState } from "react";
import { ProjectTopBar } from "../header/ProjectTopBar";
import { ProjectToolRail } from "../rail/ProjectToolRail";
import { InspectorDockButton } from "../panels/InspectorDockButton";
import { maximumTimelineHeight } from "./workspaceLayouts";
import { InspectorPanel } from "@/modules/editor/features/inspector/components/InspectorPanel";
import { useProjectStore } from "@/modules/projects";
import { ContextualPanel } from "../panels/ContextualPanel";
import { PreviewStage } from "../stage/PreviewStage";
import { TimelineShell } from "../timeline/TimelineShell";
import { ResizableDivider } from "@/shared/components/layout/ResizableDivider";
import { KeyboardShortcutsModal } from "../modals/KeyboardShortcutsModal";
import { useKeyboardShortcuts } from "@/modules/editor/commands/useKeyboardShortcuts";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";

import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { useExportStore } from "@/modules/editor/store/useExportStore";

const ExportModal = lazy(() =>
  import("@/modules/editor/features/export/components/ExportModal").then(
    (mod) => ({ default: mod.ExportModal }),
  ),
);

const MEDIA_RAIL_WIDTH = 66;
const WORKSPACE_CHROME_WIDTH = MEDIA_RAIL_WIDTH + 20 + 12;

function maximumLeftPanelWidth(
  viewportWidth: number,
  hasRightInspector: boolean,
  rightPanelWidth: number,
) {
  // Reserve the rail, outer spacing, dividers, and space for the live preview.
  const availableWidth = hasRightInspector
    ? viewportWidth - rightPanelWidth - WORKSPACE_CHROME_WIDTH - 240
    : Infinity;
  return Math.max(
    350,
    Math.min(560, Math.floor(viewportWidth * 0.4), availableWidth),
  );
}

function maximumRightPanelWidth(viewportWidth: number, leftPanelWidth: number) {
  const availableWidth = viewportWidth - leftPanelWidth - WORKSPACE_CHROME_WIDTH - 240;
  return Math.max(320, Math.min(480, Math.floor(availableWidth)));
}

export function ProjectShell() {
  const clipInspectorSide = useEditorUIStore(
    (state) => state.clipInspectorSide,
  );
  const setSelectedClipIds = useEditorUIStore(
    (state) => state.setSelectedClipIds,
  );
  const currentProjectId = useProjectStore((state) => state.currentProject?.id);
  const workspaceLayout = useEditorUIStore((state) => state.workspaceLayout);
  const isInspectorCollapsed = useEditorUIStore(
    (state) => state.isInspectorCollapsed,
  );
  const showRightInspector =
    !isInspectorCollapsed && clipInspectorSide === "right";
  const playerLeft = workspaceLayout === "tall-player-left";
  const playerRight = workspaceLayout === "tall-player-right";
  const tallPlayer = playerLeft || playerRight;
  const isLeftSidebarCollapsed = useEditorUIStore(
    (state) => state.isLeftSidebarCollapsed,
  );
  const leftPanelWidth = useEditorUIStore((state) => state.leftPanelWidth);
  const rightPanelWidth = useEditorUIStore((state) => state.rightPanelWidth);
  const setLeftPanelWidth = useEditorUIStore(
    (state) => state.setLeftPanelWidth,
  );
  const setRightPanelWidth = useEditorUIStore(
    (state) => state.setRightPanelWidth,
  );
  const timelineHeight = useEditorUIStore((state) => state.timelineHeight);
  const setTimelineHeight = useEditorUIStore(
    (state) => state.setTimelineHeight,
  );
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const isExportModalOpen = useExportStore((state) => state.isExportModalOpen);

  useKeyboardShortcuts(() => setIsShortcutsOpen(true));

  useEffect(() => {
    const project = useProjectStore.getState().currentProject;
    if (!project) return;

    const clipIds = new Set(
      project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
    );
    const currentSelection = useEditorUIStore.getState().selectedClipIds;
    const validSelection = currentSelection.filter((id) => clipIds.has(id));
    if (validSelection.length !== currentSelection.length) {
      setSelectedClipIds(validSelection);
    }
  }, [currentProjectId, setSelectedClipIds]);

  useEffect(() => {
    const clampPanelToViewport = () => {
      const maximumWidth = maximumLeftPanelWidth(
        window.innerWidth,
        showRightInspector,
        rightPanelWidth,
      );
      const currentWidth = useEditorUIStore.getState().leftPanelWidth;
      if (currentWidth > maximumWidth) {
        setLeftPanelWidth(maximumWidth);
      }
      const maximumRightWidth = maximumRightPanelWidth(
        window.innerWidth,
        isLeftSidebarCollapsed ? 0 : useEditorUIStore.getState().leftPanelWidth,
      );
      if (rightPanelWidth > maximumRightWidth) {
        setRightPanelWidth(maximumRightWidth);
      }
      const maxHeight = maximumTimelineHeight(
        workspaceLayout,
        window.innerHeight,
      );
      if (useEditorUIStore.getState().timelineHeight > maxHeight)
        setTimelineHeight(maxHeight);
    };

    clampPanelToViewport();
    window.addEventListener("resize", clampPanelToViewport, { passive: true });
    return () => window.removeEventListener("resize", clampPanelToViewport);
  }, [
    leftPanelWidth,
    rightPanelWidth,
    setLeftPanelWidth,
    setRightPanelWidth,
    showRightInspector,
    isLeftSidebarCollapsed,
    setTimelineHeight,
    workspaceLayout,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const exportPhase = useExportStore.getState().exportPhase;
      if (exportPhase === "rendering" || exportPhase === "converting") {
        e.preventDefault();
        e.returnValue =
          "An export is currently in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleWidthResize = (delta: number) => {
    const currentWidth = useEditorUIStore.getState().leftPanelWidth;
    const responsiveMaximum = maximumLeftPanelWidth(
      window.innerWidth,
      showRightInspector,
      useEditorUIStore.getState().rightPanelWidth,
    );
    const newWidth = Math.min(
      responsiveMaximum,
      Math.max(350, currentWidth + delta),
    );
    setLeftPanelWidth(newWidth);
  };

  const handleRightWidthResize = (delta: number) => {
    const currentWidth = useEditorUIStore.getState().rightPanelWidth;
    const maximumWidth = maximumRightPanelWidth(
      window.innerWidth,
      isLeftSidebarCollapsed ? 0 : useEditorUIStore.getState().leftPanelWidth,
    );
    setRightPanelWidth(
      Math.min(maximumWidth, Math.max(320, currentWidth - delta)),
    );
  };

  const handleHeightResize = (delta: number) => {
    const currentHeight = useEditorUIStore.getState().timelineHeight;
    const responsiveMaximum = maximumTimelineHeight(
      workspaceLayout,
      window.innerHeight,
    );
    const newHeight = Math.min(
      responsiveMaximum,
      Math.max(120, currentHeight - delta),
    );
    setTimelineHeight(newHeight);
  };

  const handleCornerResize = (deltaX: number, deltaY: number) => {
    const currentWidth = useEditorUIStore.getState().leftPanelWidth;
    const currentHeight = useEditorUIStore.getState().timelineHeight;

    const responsiveMaximumWidth = maximumLeftPanelWidth(
      window.innerWidth,
      showRightInspector,
      useEditorUIStore.getState().rightPanelWidth,
    );
    const newWidth = Math.min(
      responsiveMaximumWidth,
      Math.max(350, currentWidth + deltaX),
    );

    const responsiveMaximumHeight = maximumTimelineHeight(
      workspaceLayout,
      window.innerHeight,
    );
    const newHeight = Math.min(
      responsiveMaximumHeight,
      Math.max(120, currentHeight - deltaY),
    );

    setLeftPanelWidth(newWidth);
    setTimelineHeight(newHeight);
  };

  const handleRightCornerResize = (deltaX: number, deltaY: number) => {
    const currentWidth = useEditorUIStore.getState().rightPanelWidth;
    const currentHeight = useEditorUIStore.getState().timelineHeight;
    const maximumWidth = maximumRightPanelWidth(
      window.innerWidth,
      isLeftSidebarCollapsed ? 0 : useEditorUIStore.getState().leftPanelWidth,
    );
    const maximumHeight = maximumTimelineHeight(
      workspaceLayout,
      window.innerHeight,
    );

    setRightPanelWidth(
      Math.min(maximumWidth, Math.max(320, currentWidth - deltaX)),
    );
    setTimelineHeight(
      Math.min(maximumHeight, Math.max(120, currentHeight - deltaY)),
    );
  };

  const mediaWidth = isLeftSidebarCollapsed
    ? "0px"
    : `${leftPanelWidth + MEDIA_RAIL_WIDTH}px`;
  const propsWidth = showRightInspector ? `${rightPanelWidth}px` : "0px";
  const mediaDivider =
    !isLeftSidebarCollapsed && (!tallPlayer || showRightInspector);
  const leftGap = mediaDivider ? "6px" : "0px";
  const rightGap = showRightInspector && !tallPlayer ? "6px" : "0px";
  const previewWidth = "minmax(0, 1fr)";
  // Grid placement changes without remounting the program monitor or timeline.
  const dockWidth =
    isLeftSidebarCollapsed && !showRightInspector
      ? "minmax(0, 1fr)"
      : mediaWidth;
  let gridTemplateColumns = `${mediaWidth} ${leftGap} ${previewWidth} ${rightGap} ${propsWidth}`;
  let gridTemplateAreas =
    '"media left preview right props" "split split split split split" "timeline timeline timeline timeline timeline"';
  if (playerLeft) {
    gridTemplateColumns = `${previewWidth} 6px ${dockWidth} ${leftGap} ${propsWidth}`;
    gridTemplateAreas =
      '"preview . media left props" "preview . split split split" "preview . timeline timeline timeline"';
  } else if (playerRight) {
    gridTemplateColumns = `${dockWidth} ${leftGap} ${propsWidth} 6px ${previewWidth}`;
    gridTemplateAreas =
      '"media left props . preview" "split split split . preview" "timeline timeline timeline . preview"';
  }

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-studio-bg text-studio-fg select-none">
      <ProjectTopBar onOpenHelp={() => setIsShortcutsOpen(true)} />

      <div
        data-workspace-layout={workspaceLayout}
        className="relative grid min-h-0 flex-1 overflow-hidden px-2.5 pb-2.5 pt-1.5"
        style={{
          gridTemplateColumns,
          gridTemplateAreas,
          gridTemplateRows: `minmax(0, 1fr) 6px ${timelineHeight}px`,
        }}
      >
        <div
          data-studio-sidebar
          style={{ gridArea: "media" }}
          className={`min-w-0 overflow-hidden rounded-md border border-studio-border bg-studio-panel shadow-xs ${isLeftSidebarCollapsed ? "hidden" : "flex"}`}
        >
          <ProjectToolRail />
          <div className="min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary
              fallbackTitle="Panel Error"
              fallbackMessage="Contextual panel encountered an error."
            >
              <ContextualPanel
                canvasOnly={
                  clipInspectorSide === "right" || isInspectorCollapsed
                }
                inspectorDockAction={
                  clipInspectorSide === "left" && !isInspectorCollapsed ? (
                    <InspectorDockButton />
                  ) : undefined
                }
              />
            </ErrorBoundary>
          </div>
        </div>
        {mediaDivider && (
          <ResizableDivider
            style={{ gridArea: "left" }}
            orientation="vertical"
            onResize={handleWidthResize}
            hasCornerHandle
            onCornerResize={handleCornerResize}
          />
        )}

        <div
          data-workspace-preview
          style={{ gridArea: "preview" }}
          className="min-w-0 overflow-hidden rounded-md border border-studio-border bg-studio-panel shadow-xs"
        >
          <ErrorBoundary
            fallbackTitle="Stage Preview Error"
            fallbackMessage="Stage failed to render preview frame."
          >
            <PreviewStage />
          </ErrorBoundary>
        </div>
        {showRightInspector && (
          <>
            {!tallPlayer && (
              <ResizableDivider
                style={{ gridArea: "right" }}
                orientation="vertical"
                aria-label="Resize Clip Properties panel"
                aria-valuemin={320}
                aria-valuemax={maximumRightPanelWidth(
                  window.innerWidth,
                  isLeftSidebarCollapsed ? 0 : leftPanelWidth,
                )}
                aria-valuenow={rightPanelWidth}
                onResize={handleRightWidthResize}
                hasCornerHandle
                onCornerResize={handleRightCornerResize}
              />
            )}
            <aside
              aria-label="Clip Properties"
              style={{ gridArea: "props" }}
              className="min-w-0 overflow-hidden rounded-md border border-studio-border bg-studio-panel shadow-xs"
            >
              <ErrorBoundary fallbackTitle="Clip Properties Error">
                <InspectorPanel
                  view="clip"
                  dockAction={
                    isLeftSidebarCollapsed ? undefined : <InspectorDockButton />
                  }
                />
              </ErrorBoundary>
            </aside>
          </>
        )}

        <ResizableDivider
          style={{ gridArea: "split" }}
          orientation="horizontal"
          onResize={handleHeightResize}
        />

        <div
          data-workspace-timeline
          style={{ gridArea: "timeline" }}
          className="min-w-0 overflow-hidden rounded-md border border-studio-border bg-studio-panel shadow-xs"
        >
          <ErrorBoundary
            fallbackTitle="Timeline Error"
            fallbackMessage="Multitrack timeline encountered an error."
          >
            <TimelineShell />
          </ErrorBoundary>
        </div>
      </div>

      {/* Global Modals & Notifications */}
      {isExportModalOpen && (
        <ErrorBoundary fallbackTitle="Export Error">
          <Suspense fallback={null}>
            <ExportModal />
          </Suspense>
        </ErrorBoundary>
      )}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}

export const StudioShell = ProjectShell;
