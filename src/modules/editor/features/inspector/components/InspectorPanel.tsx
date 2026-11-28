import { useEffect, type ReactNode } from "react";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { useProjectStore } from "@/modules/projects";
import { ProjectPanel } from "@/shared/components/layout/ProjectPanel";
import {
  Tabs,
  TabList,
  TabTrigger,
  TabContent,
} from "@/shared/components/ui/Tabs";
import { Slider } from "@/shared/components/ui/Slider";
import { TransformTab } from "./TransformTab";
import { AdjustTab } from "./AdjustTab";
import { AnimationTab } from "./AnimationTab";
import { AudioTab } from "./AudioTab";
import { SpeedTab } from "./SpeedTab";
import { TimeTab } from "./TimeTab";
import { CanvasSettingsPanel } from "./CanvasSettingsPanel";
import { TextInspectorTab } from "@/modules/editor/features/text";
import { ElementInspectorTab } from "@/modules/editor/features/elements";
import { cn } from "@/shared/utils/cn";
import { Trash2, Layers, Clock } from "lucide-react";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import type { TimelineClip } from "@/modules/editor/types";

function getValidTabsForClip(clip: TimelineClip): string[] {
  const isVisual =
    clip.type === "video" || clip.type === "image" || clip.type === "overlay";
  const hasAudio = clip.type === "video" || clip.type === "audio";
  const isText = clip.type === "text";
  const isElement = clip.type === "overlay";

  const tabs: string[] = [];
  if (isText) tabs.push("text");
  if (isElement) tabs.push("element");
  if (clip.type !== "audio" && clip.type !== "text") tabs.push("transform");
  if (hasAudio) tabs.push("audio", "speed");
  if (isVisual) tabs.push("animation", "adjust");
  tabs.push("time");
  return tabs;
}

function getDefaultTabForClip(clip: TimelineClip): string {
  if (clip.type === "text") return "text";
  if (clip.type === "overlay") return "element";
  if (clip.type === "audio") return "audio";
  return "transform";
}

const tabLabels: Record<string, string> = {
  text: "Text",
  element: "Shape",
  transform: "Video",
  audio: "Audio",
  speed: "Speed",
  animation: "Animation",
  adjust: "Adjust",
  time: "Time",
};

export function InspectorPanel({
  view,
  dockAction,
  sidebarAction,
}: {
  view?: "clip" | "canvas";
  dockAction?: ReactNode;
  sidebarAction?: ReactNode;
} = {}) {
  const selectedClipIds = useEditorUIStore((state) => state.selectedClipIds);
  const clearSelection = useEditorUIStore((state) => state.clearSelection);
  const activeInspectorTab = useEditorUIStore(
    (state) => state.activeInspectorTab,
  );
  const setActiveInspectorTab = useEditorUIStore(
    (state) => state.setActiveInspectorTab,
  );
  const inspectorMode = useEditorUIStore((state) => state.inspectorMode);
  const setInspectorMode = useEditorUIStore((state) => state.setInspectorMode);
  const currentProject = useProjectStore((state) => state.currentProject);
  const deleteClips = useProjectStore((state) => state.deleteClips);
  const updateClip = useProjectStore((state) => state.updateClip);

  // When selected clip changes, automatically switch to clip inspector mode and seek playhead
  useEffect(() => {
    if (selectedClipIds.length > 0) {
      setInspectorMode("clip");
      const clips =
        useProjectStore
          .getState()
          .currentProject?.tracks.flatMap((t) => t.clips) || [];
      const firstClip = clips.find((c) => selectedClipIds.includes(c.id));
      if (firstClip) {
        const validTabs = getValidTabsForClip(firstClip);
        const currentTab = useEditorUIStore.getState().activeInspectorTab;
        if (!validTabs.includes(currentTab)) {
          setActiveInspectorTab(getDefaultTabForClip(firstClip));
        }

        // Auto-seek playhead to selected clip start if playhead is out of bounds
        const playhead = usePlaybackStore.getState().playhead;
        const clipEnd = firstClip.timelineStart + firstClip.timelineDuration;
        if (playhead < firstClip.timelineStart || playhead >= clipEnd) {
          usePlaybackStore.getState().setPlayhead(firstClip.timelineStart);
        }
      }
    }
  }, [selectedClipIds, setInspectorMode, setActiveInspectorTab]);

  if (!currentProject) return null;

  // Single clip selection
  const selectedClips = currentProject.tracks
    .flatMap((t) => t.clips)
    .filter((c) => selectedClipIds.includes(c.id));

  if (view === "clip" && selectedClips.length === 0) {
    return (
      <ProjectPanel
        title="Clip Properties"
        className="h-full w-full"
        actions={dockAction}
      >
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-2 text-sm font-medium text-studio-fg">
            No clip selected
          </div>
          <p className="max-w-52 text-xs leading-relaxed text-studio-muted">
            Select a clip on the canvas or timeline to see its properties here.
          </p>
        </div>
      </ProjectPanel>
    );
  }

  if (
    view === "canvas" ||
    selectedClips.length === 0 ||
    (!view && inspectorMode === "canvas")
  ) {
    return (
      <ProjectPanel
        title="Canvas Settings"
        className="h-full w-full"
        actions={
          <>
            {!view && selectedClips.length > 0 && (
              <button
                type="button"
                onClick={() => setInspectorMode("clip")}
                className="h-7 cursor-pointer rounded-lg border border-studio-border bg-studio-panel-raised/60 px-2.5 text-[11px] font-medium text-studio-fg transition-colors hover:bg-studio-hover"
              >
                Clip Properties
              </button>
            )}
            {sidebarAction}
          </>
        }
      >
        <div className="h-full w-full overflow-y-auto p-3 no-scrollbar">
          <CanvasSettingsPanel />
        </div>
      </ProjectPanel>
    );
  }

  const clipActions = (
    <>
      {view !== "clip" && (
        <button
          type="button"
          onClick={() => setInspectorMode("canvas")}
          className="h-7 cursor-pointer whitespace-nowrap rounded-lg border border-studio-border bg-studio-panel-raised/60 px-2.5 text-[11px] font-medium text-studio-fg transition-colors hover:border-studio-border-strong hover:bg-studio-hover"
        >
          Canvas Settings
        </button>
      )}
      {dockAction}
      {sidebarAction}
    </>
  );
  const clipPanelClass = cn("h-full w-full rounded-lg", view === "clip" && "lg:min-w-0");

  // Multi-selection inspector
  if (selectedClips.length > 1) {
    const handleMultiOpacityChange = (opacity: number) => {
      selectedClips.forEach((c) => {
        updateClip(c.id, {
          transform: {
            ...c.transform,
            opacity,
          },
        });
      });
    };

    const handleMultiDelete = () => {
      deleteClips(selectedClipIds);
      clearSelection();
    };

    return (
      <ProjectPanel
        title={`${selectedClips.length} Clips Selected`}
        actions={clipActions}
        className={clipPanelClass}
      >
        <div className="flex h-full w-full flex-col text-xs text-studio-fg p-3 overflow-y-auto no-scrollbar select-none">
          <div className="py-2.5 border-b border-studio-border flex items-center gap-2 text-studio-muted">
            <Layers className="h-3.5 w-3.5 text-studio-muted shrink-0" />
            <span>Multi-selection ({selectedClips.length} clips)</span>
          </div>

          {/* Group Opacity Slider */}
          <div className="py-2.5 border-b border-studio-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-studio-muted font-medium">Group Opacity</span>
              <span className="font-mono text-xs text-studio-muted">Mixed</span>
            </div>
            <Slider
              value={1}
              min={0}
              max={1}
              step={0.01}
              onValueChange={handleMultiOpacityChange}
            />
          </div>

          {/* Group Delete Action */}
          <button
            type="button"
            onClick={handleMultiDelete}
            className="mt-3 h-7 w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete {selectedClips.length} Clips
          </button>
        </div>
      </ProjectPanel>
    );
  }

  const clip = selectedClips[0];
  const availableTabs = getValidTabsForClip(clip);
  const defaultTab = getDefaultTabForClip(clip);
  const activeTab = availableTabs.includes(activeInspectorTab) ? activeInspectorTab : defaultTab;

  return (
    <ProjectPanel title={clip.name} actions={clipActions} className={clipPanelClass}>
      <Tabs
        defaultValue={defaultTab}
        value={activeTab}
        onValueChange={setActiveInspectorTab}
        variant="line"
        className="flex h-full min-h-0 flex-col"
      >
        <TabList aria-label="Clip properties" className="app-custom-scrollbar shrink-0 gap-0 overflow-x-auto px-1">
          {availableTabs.map((tab) => (
            <TabTrigger
              key={tab}
              value={tab}
              aria-label={tabLabels[tab]}
              title={tab === "time" ? "Time" : undefined}
              className={cn(
                "min-h-9 shrink-0 px-1.5 text-xs text-studio-fg after:hidden hover:bg-studio-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-500 data-[state=active]:text-cyan-700 dark:data-[state=active]:text-cyan-300",
                tab === "time" && "flex-none px-2",
              )}
            >
              {tab === "time" ? <Clock className="size-3.5" aria-hidden="true" /> : tabLabels[tab]}
            </TabTrigger>
          ))}
        </TabList>

        <TabContent value={activeTab} className="mt-0 min-h-0 flex-1 overflow-hidden">
          {activeTab === "transform" && <TransformTab key={clip.id} clip={clip} />}
          {activeTab === "audio" && <AudioTab key={clip.id} clip={clip} />}
          {activeTab === "speed" && <SpeedTab key={clip.id} clip={clip} />}
          {activeTab === "animation" && <AnimationTab key={clip.id} />}
          {activeTab === "adjust" && <AdjustTab key={clip.id} clip={clip} />}
          {(activeTab === "text" || activeTab === "element" || activeTab === "time") && (
            <div className="app-custom-scrollbar h-full overflow-y-auto p-3">
              {activeTab === "text" && <TextInspectorTab clip={clip} />}
              {activeTab === "element" && <ElementInspectorTab clip={clip} />}
              {activeTab === "time" && <TimeTab clip={clip} />}
            </div>
          )}
        </TabContent>
      </Tabs>
    </ProjectPanel>
  );
}
