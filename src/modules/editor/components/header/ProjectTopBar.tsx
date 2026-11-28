import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  Home,
  Image,
  Keyboard,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Settings,
  Undo2,
  Video,
  Wrench,
} from "lucide-react";
import { autosaveService, useProjectStore } from "@/modules/projects";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { useExportStore } from "@/modules/editor/store/useExportStore";
import { historyManager } from "@/modules/editor/store/useHistoryStore";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import { Button } from "@/shared/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/shared/components/ui/DropdownMenu";
import { IconButton } from "@/shared/components/ui/IconButton";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { macWindowHeaderProps } from "@/shared/utils/mac-window-header";
import { useToastStore } from "@/shared/components/ui/Toast/useToastStore";
import { WorkspaceLayoutMenu } from "./WorkspaceLayoutMenu";

export interface ProjectTopBarProps {
  onOpenHelp?: () => void;
}

export function ProjectTopBar({ onOpenHelp }: ProjectTopBarProps) {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isCreatingThumbnail, setIsCreatingThumbnail] = useState(false);
  const [saveStatus, setSaveStatus] = useState(() =>
    autosaveService.getStatus(),
  );
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement === document.documentElement,
  );
  const projectName = useProjectStore(
    (state) => state.currentProject?.name ?? "Untitled video",
  );
  const hasClips = useProjectStore(
    (state) =>
      state.currentProject?.tracks.some((track) => track.clips.length > 0) ??
      false,
  );
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const mediaHidden = useEditorUIStore((state) => state.isLeftSidebarCollapsed);
  const inspectorHidden = useEditorUIStore(
    (state) => state.isInspectorCollapsed,
  );
  const setMediaHidden = useEditorUIStore(
    (state) => state.setLeftSidebarCollapsed,
  );
  const setInspectorHidden = useEditorUIStore(
    (state) => state.setInspectorCollapsed,
  );
  const openExport = useExportStore((state) => state.setExportModalOpen);
  const toast = useToastStore((state) => state.showToast);

  useEffect(() => autosaveService.subscribe(setSaveStatus), []);
  useEffect(() => {
    const sync = () =>
      setIsFullscreen(document.fullscreenElement === document.documentElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const navigateFromEditor = async (href: string) => {
    if (isNavigating || isCreatingThumbnail) return;
    setIsNavigating(true);
    try {
      const project = useProjectStore.getState().currentProject;
      if (project) {
        autosaveService.scheduleSave(project, 0);
        await autosaveService.executeSave();
        if (autosaveService.getStatus() === "error") return;
      }
      navigate(href);
    } catch {
      toast("Could not leave the editor. Please try again.", "error");
    } finally {
      setIsNavigating(false);
    }
  };

  const commitRename = () => {
    setNameInput(null);
    const name = nameInput?.trim();
    const project = useProjectStore.getState().currentProject;
    if (!name || !project || name === project.name) return;
    useProjectStore.setState((state) => {
      if (state.currentProject) state.currentProject.name = name;
    });
    const updatedProject = useProjectStore.getState().currentProject;
    if (updatedProject) autosaveService.scheduleSave(updatedProject);
  };

  const repairProject = async () => {
    setIsRepairing(true);
    try {
      const fixed = await useProjectStore.getState().repairProjectReferences();
      toast(
        fixed > 0
          ? `Repaired ${fixed} project reference(s)`
          : "All project references are healthy",
        "success",
      );
    } catch {
      toast("Failed to scan project references", "error");
    } finally {
      setIsRepairing(false);
    }
  };

  const createThumbnail = async () => {
    const project = useProjectStore.getState().currentProject;
    if (!project || isCreatingThumbnail) return;
    const playback = usePlaybackStore.getState();
    playback.setIsPlaying(false);
    setIsCreatingThumbnail(true);
    try {
      const { exportThumbnail } =
        await import("@/modules/editor/features/export/services/export-thumbnail");
      if (await exportThumbnail(project, playback.playhead))
        toast("Thumbnail saved", "success");
    } catch (error) {
      toast(
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Could not save the thumbnail.",
        "error",
      );
    } finally {
      setIsCreatingThumbnail(false);
    }
  };

  const exportDisabled = !hasClips || isCreatingThumbnail;
  const leavingDisabled = isNavigating || isCreatingThumbnail;

  return (
    <header {...macWindowHeaderProps} className="grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-studio-border bg-studio-topbar px-2.5 text-studio-fg select-none">
      <div className="flex min-w-0 items-center gap-0.5">
        <IconButton
          label="Back to Projects"
          size="sm"
          variant="ghost"
          disabled={leavingDisabled}
          onClick={() => void navigateFromEditor("/projects")}
        >
          <Home className="size-4" />
        </IconButton>
        <span
          aria-live="polite"
          className="mx-1.5 flex items-center gap-1 whitespace-nowrap text-[11px] text-studio-muted"
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving…
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="size-3" /> Autosaved
            </>
          ) : saveStatus === "error" ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" /> Save error
            </span>
          ) : (
            "Autosave on"
          )}
        </span>
        <IconButton
          label="Undo (Ctrl+Z)"
          size="sm"
          variant="ghost"
          disabled={!historyManager.canUndo()}
          onClick={undo}
        >
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton
          label="Redo (Ctrl+Y)"
          size="sm"
          variant="ghost"
          disabled={!historyManager.canRedo()}
          onClick={redo}
        >
          <Redo2 className="size-4" />
        </IconButton>
      </div>

      {nameInput !== null ? (
        <input
          autoFocus
          aria-label="Project name"
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename();
            if (event.key === "Escape") setNameInput(null);
          }}
          className="h-7 w-32 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-center text-xs font-semibold xl:w-56"
        />
      ) : (
        <button
          type="button"
          title="Rename project"
          onClick={() => setNameInput(projectName)}
          className="max-w-32 truncate rounded-md px-2 py-1 text-xs font-semibold hover:bg-studio-hover xl:max-w-56"
        >
          {projectName}
        </button>
      )}

      <div className="flex min-w-0 items-center justify-end gap-0.5">
        <IconButton
          label={mediaHidden ? "Show Media panel" : "Hide Media panel"}
          aria-pressed={!mediaHidden}
          size="sm"
          variant="ghost"
          className="aria-pressed:bg-studio-hover aria-pressed:text-studio-fg"
          onClick={() => setMediaHidden(!mediaHidden)}
        >
          <PanelLeft className="size-4" />
        </IconButton>
        <IconButton
          label={inspectorHidden ? "Show Inspector" : "Hide Inspector"}
          aria-pressed={!inspectorHidden}
          size="sm"
          variant="ghost"
          className="aria-pressed:bg-studio-hover aria-pressed:text-studio-fg"
          onClick={() => setInspectorHidden(!inspectorHidden)}
        >
          <PanelRight className="size-4" />
        </IconButton>
        <span
          aria-hidden="true"
          className="mx-1 h-4 w-px shrink-0 bg-studio-border"
        />
        <WorkspaceLayoutMenu />
        {onOpenHelp && (
          <IconButton
            label="Keyboard shortcuts"
            size="sm"
            variant="ghost"
            onClick={onOpenHelp}
          >
            <Keyboard className="size-4" />
          </IconButton>
        )}
        <ThemeToggle variant="ghost" />
        <DropdownMenu
          align="right"
          keyboardNavigation
          trigger={(open) => (
            <IconButton
              label="Editor settings"
              size="sm"
              variant="ghost"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <Settings className="size-4" />
            </IconButton>
          )}
        >
          <DropdownMenuItem
            disabled={leavingDisabled}
            onClick={() => void navigateFromEditor("/projects/new")}
          >
            <Plus className="size-4" /> New project
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const action = isFullscreen
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              void action.catch(() =>
                toast("Fullscreen is unavailable.", "error"),
              );
            }}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}{" "}
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRepairing}
            onClick={() => void repairProject()}
          >
            <Wrench className="size-4" /> Scan &amp; repair references
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={leavingDisabled}
            onClick={() => void navigateFromEditor("/")}
          >
            <LogOut className="size-4" /> Exit editor
          </DropdownMenuItem>
        </DropdownMenu>
        <div className="ml-1 flex shrink-0 items-center">
          <Button
            type="button"
            size="sm"
            disabled={exportDisabled}
            onClick={() => openExport(true)}
            aria-label="Export Video"
            title={
              hasClips
                ? "Export Video"
                : "Add clips to the timeline before exporting"
            }
            className="h-7 rounded-r-none px-2.5 font-semibold"
          >
            <Download className="size-3.5" /> Export
          </Button>
          <DropdownMenu
            align="right"
            keyboardNavigation
            className="w-60"
            trigger={(open) => (
              <Button
                type="button"
                size="sm"
                aria-label="Export options"
                aria-haspopup="menu"
                aria-expanded={open}
                title="Export options"
                className="h-7 rounded-l-none border-l border-brand-contrast/25 px-1.5"
              >
                {isCreatingThumbnail ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </Button>
            )}
          >
            <DropdownMenuItem
              disabled={exportDisabled}
              onClick={() => openExport(true)}
            >
              <Video className="size-4 shrink-0 text-studio-muted" />
              <span>
                Export Video{" "}
                <small className="block font-normal text-studio-muted">
                  Render your timeline as MP4 or WebM
                </small>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportDisabled}
              onClick={() => void createThumbnail()}
            >
              <Image className="size-4 shrink-0 text-studio-muted" />
              <span>
                Create Thumbnail{" "}
                <small className="block font-normal text-studio-muted">
                  Save the current playhead frame as PNG
                </small>
              </span>
            </DropdownMenuItem>
            {!hasClips && (
              <p className="px-2.5 py-1 text-[11px] text-studio-muted">
                Add clips to the timeline first
              </p>
            )}
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export const StudioTopBar = ProjectTopBar;
export type StudioTopBarProps = ProjectTopBarProps;
