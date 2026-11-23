import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  Home,
  Settings,
  PanelLeft,
  PanelRight,
  Smartphone,
  Keyboard,
  ChevronDown,
  Image as ImageIcon,
  Video as VideoIcon,
} from "lucide-react";
import { Button } from "../ui/Button";
import { useProjectStore } from "@/store/projectStore";
import { useUIStore } from "@/store/uiStore";
import { useSettingsStore } from "@/store/settingsStore";
import { platform } from "@/core/platform";
import { isMacOSPlatform } from "@/lib/platform/windowPlatform";
import { LayoutPresetMenu } from "./layout/LayoutPresetMenu";
import { hideNativeSurfaceWhenIdle } from "@/core/runtime/nativeSurfaceLifecycle";
import {
  forceRepaintNativeProgramPreview,
  wakeNativeProgramPreviewRenderLoop,
} from "@/core/preview/previewRepaintCoordinator";
import { useClickOutside } from "@/hooks";
import { useI18n } from "@/i18n";

// Lazy load ExportDialog
const ExportDialog = lazy(() =>
  import("../ui/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);

// Lazy load ThumbnailWorkspace
const ThumbnailWorkspace = lazy(() =>
  import("@/features/creator-thumbnails/ThumbnailWorkspace").then((m) => ({
    default: m.ThumbnailWorkspace,
  })),
);

interface TopBarProps {
  onRequestClose?: () => void;
}

const TopBarComponent: React.FC<TopBarProps> = ({ onRequestClose }) => {
  const { t } = useI18n();
  const projectName = useProjectStore((s) => s.project?.name);
  const isDirty = useProjectStore((s) => s.isDirty);
  const updateProject = useProjectStore((s) => s.updateProject);
  const openSettingsModal = useUIStore((s) => s.openSettingsModal);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(() => Date.now());
  const wasDirtyRef = useRef(false);
  useEffect(() => {
    if (wasDirtyRef.current && !isDirty) setLastSavedAt(Date.now());
    wasDirtyRef.current = isDirty;
  }, [isDirty]);
  const lastSavedLabel = new Date(lastSavedAt).toLocaleTimeString([], {
    hour12: false,
  });
  const commitRename = () => {
    const next = nameDraft.trim();
    if (next && next !== projectName) updateProject({ name: next });
    setIsRenaming(false);
  };
  const closeProject = useProjectStore((s) => s.closeProject);
  const toggleSettingsModal = useUIStore((s) => s.toggleSettingsModal);
  const toggleTransferModal = useUIStore((s) => s.toggleTransferModal);
  const registerOverlay = useUIStore((s) => s.registerOverlay);
  const unregisterOverlay = useUIStore((s) => s.unregisterOverlay);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const propertiesPanelCollapsed = useSettingsStore(
    (s) => s.propertiesPanelCollapsed,
  );
  const setPropertiesPanelCollapsed = useSettingsStore(
    (s) => s.setPropertiesPanelCollapsed,
  );
  const [showExportDialog, setShowExportDialog] = useState(false);
  const showThumbnailWorkspace = useUIStore((s) => s.showThumbnailWorkspace);
  const setShowThumbnailWorkspace = useUIStore(
    (s) => s.setShowThumbnailWorkspace,
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const showSettingsModal = useUIStore((s) => s.showSettingsModal);
  const showTransferModal = useUIStore((s) => s.showTransferModal);
  const exportButtonGroupRef = useRef<HTMLDivElement>(null);
  const exportMenuPanelRef = useRef<HTMLDivElement>(null);

  const openExportMenu = useCallback(() => {
    if (exportButtonGroupRef.current) {
      const rect = exportButtonGroupRef.current.getBoundingClientRect();
      setExportMenuPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setShowExportMenu(true);
  }, []);

  const closeExportMenu = useCallback(() => {
    setShowExportMenu(false);
    setExportMenuPos(null);
  }, []);

  useClickOutside([exportButtonGroupRef, exportMenuPanelRef], closeExportMenu, {
    enabled: showExportMenu,
  });

  const hasLocalTopBarOverlay = Boolean(
    showExportDialog ||
    showThumbnailWorkspace ||
    showExportMenu,
  );

  useEffect(() => {
    if (hasLocalTopBarOverlay) {
      registerOverlay("topbar-overlay");
    } else {
      unregisterOverlay("topbar-overlay");
    }
    return () => {
      unregisterOverlay("topbar-overlay");
    };
  }, [hasLocalTopBarOverlay, registerOverlay, unregisterOverlay]);

  const hasOpenTopBarOverlay = Boolean(
    hasLocalTopBarOverlay ||
    showSettingsModal ||
    showTransferModal,
  );

  useEffect(() => {
    if (hasOpenTopBarOverlay) {
      void hideNativeSurfaceWhenIdle().catch(() => undefined);
    } else {
      forceRepaintNativeProgramPreview();
      // Wake the RAF loop so the native surface re-engages after the overlay
      // closes. No-op when the loop is already running during active playback.
      wakeNativeProgramPreviewRenderLoop();
    }
  }, [hasOpenTopBarOverlay]);

  const handleClose = () => {
    if (onRequestClose) {
      onRequestClose();
    } else {
      closeProject();
    }
  };

  const isMacNativeWindow = platform.type === "tauri" && isMacOSPlatform();

  return (
    <>
      {/* data-tauri-drag-region="deep": the three grid columns fill the whole
          bar, so a bare attribute (which only matches direct clicks on this
          element) left almost no draggable area. "deep" lets any non-clickable
          descendant move the window; buttons/inputs still block drag.
          The native menu/title bar owns window controls. This is the editor's
          document-command row: identity stays left, commands stay right, and
          neither competes with native chrome for horizontal space.
          z-topbar elevates this bar's backdrop-blur stacking context above
          the editor body so dropdowns (layout presets, export menu) render
          on top of editor panels instead of behind them. */}
      <div
        data-testid="editor-topbar"
        className="h-9 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border-default/80 bg-surface-app px-2 select-none z-topbar"
        data-tauri-drag-region="deep"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className={`flex min-w-0 items-center gap-2 ${isMacNativeWindow ? "pl-[76px]" : "pl-0"}`}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            title={t("project.backHome")}
            aria-label={t("project.backHome")}
            className="text-text-muted hover:text-text-primary hover:bg-surface-hover"
            style={
              {
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <Home className="w-4 h-4" />
          </Button>
          <span
            data-testid="autosave-status"
            className="truncate text-[11px] text-text-muted tabular-nums"
          >
            {isDirty
              ? t("topbar.unsavedChanges")
              : t("topbar.autoSaved", { time: lastSavedLabel })}
          </span>
        </div>

        <div
          className="min-w-0 flex items-center justify-center"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isRenaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setIsRenaming(false);
              }}
              className="w-56 px-2 py-0.5 text-xs font-semibold text-center bg-surface-input border border-accent-primary rounded-md text-text-primary outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(projectName || "");
                setIsRenaming(true);
              }}
              className="max-w-[320px] truncate text-xs font-semibold text-text-primary px-2 py-0.5 rounded hover:bg-surface-hover cursor-pointer"
              title={t("topbar.renameProject")}
            >
              {projectName || t("common.labels.untitledProject")}
            </button>
          )}
        </div>

        {/* Fixed command cluster: its own row and shrink-0 keep action buttons
            aligned regardless of title length or native window state. */}
        <div
          className="flex items-center gap-1 justify-end min-w-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={
              sidebarCollapsed
                ? t("topbar.expandMedia")
                : t("topbar.collapseMedia")
            }
            aria-label={
              sidebarCollapsed
                ? t("topbar.expandMedia")
                : t("topbar.collapseMedia")
            }
            className={`transition-colors ${!sidebarCollapsed ? "text-accent-primary bg-accent-primary/10" : "text-text-muted hover:text-text-primary hover:bg-surface-hover"}`}
            style={
              {
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setPropertiesPanelCollapsed(!propertiesPanelCollapsed)
            }
            title={
              propertiesPanelCollapsed
                ? t("topbar.expandProperties")
                : t("topbar.collapseProperties")
            }
            aria-label={
              propertiesPanelCollapsed
                ? t("topbar.expandProperties")
                : t("topbar.collapseProperties")
            }
            className={`transition-colors ${!propertiesPanelCollapsed ? "text-accent-primary bg-accent-primary/10" : "text-text-muted hover:text-text-primary hover:bg-surface-hover"}`}
            style={
              {
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <PanelRight className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-3.5 bg-border-default/60 mx-0.5" />

          <LayoutPresetMenu />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTransferModal}
            title={t("topbar.phoneTransfer")}
            aria-label={t("topbar.phoneTransfer")}
            className="text-text-muted hover:text-text-primary hover:bg-surface-hover"
            style={
              {
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <Smartphone className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openSettingsModal("shortcuts")}
            title={t("topbar.shortcuts")}
            aria-label={t("topbar.shortcuts")}
            className="h-6 px-2 text-[11px] gap-1 text-text-muted hover:text-text-primary hover:bg-surface-hover"
          >
            <Keyboard className="w-3.5 h-3.5" />
            {t("topbar.shortcuts")}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSettingsModal}
            title={t("settings.modal.title")}
            aria-label={t("settings.modal.title")}
            className="text-text-muted hover:text-text-primary hover:bg-surface-hover"
            style={
              {
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>

          {/* Export & Thumbnail Dropdown */}
          <div
            className="inline-flex items-center"
            ref={exportButtonGroupRef}
          >
            <div className="flex items-center rounded-md bg-accent-primary text-[#041014] shadow-xs overflow-hidden">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                className="text-xs h-6 px-3 rounded-none bg-accent-primary hover:bg-accent-primary/90 text-[#041014] font-semibold"
                style={
                  {
                    WebkitAppRegion: "no-drag",
                    cursor: "pointer",
                  } as React.CSSProperties
                }
                title={t("export.video")}
                aria-label={t("export.video")}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                {t("common.actions.export")}
              </Button>
              <Button
                variant="default"
                size="icon-sm"
                onClick={() => (showExportMenu ? closeExportMenu() : openExportMenu())}
                className="h-6 w-5 px-0 rounded-none bg-accent-primary hover:bg-accent-primary/90 text-white border-l border-white/20"
                style={
                  {
                    WebkitAppRegion: "no-drag",
                    cursor: "pointer",
                  } as React.CSSProperties
                }
                title={t("common.actions.moreOptions")}
                aria-label={t("common.actions.moreOptions")}
              >
                <ChevronDown className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Export menu portal — renders above native GPU surface */}
          {showExportMenu && exportMenuPos && typeof document !== "undefined" &&
            createPortal(
              <>
                {/* Backdrop to catch outside clicks */}
                <div
                  className="fixed inset-0 z-dropdown-overlay"
                  onClick={closeExportMenu}
                  onPointerDown={closeExportMenu}
                  aria-hidden="true"
                />
                <div
                  ref={exportMenuPanelRef}
                  className="fixed z-dropdown-panel w-60 rounded-xl bg-surface-floating border border-border-default shadow-2xl p-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    top: exportMenuPos.top,
                    right: exportMenuPos.right,
                    WebkitAppRegion: "no-drag",
                  } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => {
                      closeExportMenu();
                      setShowExportDialog(true);
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <VideoIcon className="w-4 h-4 text-accent-primary mt-0.5 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text-primary">
                        {t("export.menu.videoTitle")}
                      </span>
                      <span className="text-[10px] text-text-muted leading-tight mt-0.5">
                        {t("export.menu.videoDesc")}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      closeExportMenu();
                      setShowThumbnailWorkspace(true);
                    }}
                    className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-status-warning mt-0.5 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                        {t("export.menu.thumbTitle")}
                        <span className="text-[9px] px-1 py-0.2 rounded bg-status-warning/15 text-status-warning font-mono font-bold">
                          {t("common.labels.new")}
                        </span>
                      </span>
                      <span className="text-[10px] text-text-muted leading-tight mt-0.5">
                        {t("export.menu.thumbDesc")}
                      </span>
                    </div>
                  </button>
                </div>
              </>,
              document.body,
            )
          }
        </div>
      </div>

      {/* Export Dialog */}
      {showExportDialog && (
        <Suspense fallback={null}>
          <ExportDialog
            isOpen={showExportDialog}
            onClose={() => setShowExportDialog(false)}
          />
        </Suspense>
      )}

      {/* Thumbnail Generator Workspace */}
      {showThumbnailWorkspace && (
        <Suspense fallback={null}>
          <ThumbnailWorkspace
            isOpen={showThumbnailWorkspace}
            onClose={() => setShowThumbnailWorkspace(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export const TopBar = React.memo(TopBarComponent);
