import React, { useEffect, useRef, useState } from "react";
import {
  AlignCenterVertical,
  ArrowLeftRight,
  ChevronDown,
  Crop,
  FlipHorizontal2,
  Gauge,
  Link2,
  Magnet,
  Maximize2,
  MonitorPlay,
  MoreHorizontal,
  MousePointer2,
  RotateCw,
  Scissors,
  Snowflake,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ToolbarUndoIcon,
  ToolbarRedoIcon,
  ToolbarDeleteLeftIcon,
  ToolbarDeleteRightIcon,
  ToolbarSplitIcon,
  ToolbarDeleteIcon,
  ToolbarDuplicateIcon,
  ToolbarCloseGapIcon,
} from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useTimelineStore } from "@/store/timelineStore";
import { useUIStore } from "@/store/uiStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { DEFAULT_SRP_CONFIG, SpatialTier } from "@/lib/renderEngine/types";
import {
  clampTimelineZoom,
  formatCadenceSeconds,
  getSrpTierForZoom,
  getTimelineTemporalDetail,
  getTimelineZoomMax,
  getZoomFromRatio,
  getZoomRatio,
  snapTimelineZoomToTierAnchors,
  TIMELINE_TIER_LABELS,
  TIMELINE_ZOOM_MAX,
  TIMELINE_ZOOM_MIN,
  TIMELINE_ZOOM_STEP,
} from "@/lib/timeline/timelineZoom";
import { useClipCommands, useTimelineCommands } from "@/core/commands";
import {
  focusCropControls,
  mirrorSelectedClips,
  rotateSelectedClips90,
} from "@/core/commands/clipQuickActions";
import {
  useAnchoredTimelineZoom,
  usePreviewQualityCapabilities,
} from "@/hooks";
import type { TimelineZoomAnchor } from "@/hooks/timeline/useAnchoredTimelineZoom";
import { VoiceoverRecorderButton } from "./VoiceoverRecorderButton";
import { timelineZoomTelemetry } from "@/lib/timeline/timelineZoomTelemetry";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useNativeSurfaceOcclusion } from "@/hooks/useNativeSurfaceOcclusion";

const ZOOM_THUMB_SIZE_PX = 12;
const ZOOM_RAIL_WIDTH_PX = 112; // w-28

const TIER_BAND_CLASS: Record<SpatialTier, string> = {
  [SpatialTier.L0]: "bg-accent-primary/20",
  [SpatialTier.L1]: "bg-accent-primary/35",
  [SpatialTier.L2]: "bg-accent-primary/50",
  [SpatialTier.L3]: "bg-accent-primary/70",
};

const TimelineToolbarComponent: React.FC = () => {
  const { t } = useI18n();
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const pixelsPerSecond = useTimelineStore((s) => s.pixelsPerSecond);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const rippleEditEnabled = useTimelineStore((s) => s.rippleEditEnabled);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const toggleRippleEdit = useTimelineStore((s) => s.toggleRippleEdit);
  const toggleSnapEnabled = useTimelineStore((s) => s.toggleSnapEnabled);

  const historyState = useHistoryStore((s) => s.state);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const proxyEditingEnabled = useSettingsStore((s) => s.proxyEditingEnabled);
  const {
    previewQuality,
    setPreviewQuality,
    currentOption,
    tierOptions,
    gpuName,
    is4kProject,
    isHardwareLimited,
  } = usePreviewQualityCapabilities();
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const zoomRailRef = useRef<HTMLDivElement>(null);
  const zoomGestureAnchorRef = useRef<TimelineZoomAnchor | null>(null);
  const zoomDragRafRef = useRef<number | null>(null);
  const pendingZoomClientXRef = useRef<number | null>(null);
  const { captureZoomAnchor, applyZoomLevel, zoomByStep, fitSequence } =
    useAnchoredTimelineZoom();
  const {
    resolvedCommands: resolvedClipCommands,
    executeCommand: executeClipCommand,
  } = useClipCommands(null);
  const {
    resolvedCommands: resolvedTimelineCommands,
    executeCommand: executeTimelineCommand,
  } = useTimelineCommands(null, 0);

  const getClipCommand = (id: string) =>
    resolvedClipCommands.find((item) => item.command.id === id);
  const getTimelineCommand = (id: string) =>
    resolvedTimelineCommands.find((item) => item.command.id === id);

  const frameRate = useProjectStore((s) => s.project?.frameRate ?? 30);
  const maxZoom = getTimelineZoomMax(frameRate);
  const zoomRatio = getZoomRatio(zoomLevel, frameRate);
  const zoomProgress = zoomRatio * 100;
  const zoomThumbLeftPx =
    ZOOM_THUMB_SIZE_PX / 2 +
    zoomRatio * (ZOOM_RAIL_WIDTH_PX - ZOOM_THUMB_SIZE_PX);
  const currentSrpTier = getSrpTierForZoom(zoomLevel);
  const currentTierLabel = TIMELINE_TIER_LABELS[currentSrpTier];
  const temporalDetail = getTimelineTemporalDetail(pixelsPerSecond);
  const cadenceLabel = formatCadenceSeconds(temporalDetail.baseInterval);
  const hasTimelineContent = tracks.length > 0 || clips.length > 0;

  const tierSegments = React.useMemo(() => {
    return (
      [SpatialTier.L0, SpatialTier.L1, SpatialTier.L2, SpatialTier.L3] as const
    ).map((tier) => {
      const boundary = DEFAULT_SRP_CONFIG[tier];
      const tierMax =
        tier === SpatialTier.L3
          ? Math.max(boundary.max, maxZoom)
          : boundary.max;
      const left = getZoomRatio(boundary.min, frameRate) * 100;
      const width =
        (getZoomRatio(tierMax, frameRate) -
          getZoomRatio(boundary.min, frameRate)) *
        100;
      return { tier, left, width };
    });
  }, [frameRate, maxZoom]);

  const snapZoom = (value: number) => {
    const stepped = Number(
      (Math.round(value / TIMELINE_ZOOM_STEP) * TIMELINE_ZOOM_STEP).toFixed(2),
    );
    return snapTimelineZoomToTierAnchors(
      stepped,
      DEFAULT_SRP_CONFIG,
      frameRate,
    );
  };

  const setZoomFromClientX = (clientX: number) => {
    if (!hasTimelineContent) return;
    const rail = zoomRailRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const inset = ZOOM_THUMB_SIZE_PX / 2;
    const usableWidth = Math.max(1, rect.width - ZOOM_THUMB_SIZE_PX);
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - rect.left - inset) / usableWidth),
    );
    applyZoomLevel(
      clampTimelineZoom(
        snapZoom(getZoomFromRatio(ratio, frameRate)),
        frameRate,
      ),
      zoomGestureAnchorRef.current,
    );
  };

  const flushZoomDrag = () => {
    if (zoomDragRafRef.current !== null) {
      cancelAnimationFrame(zoomDragRafRef.current);
      zoomDragRafRef.current = null;
    }
    const clientX = pendingZoomClientXRef.current;
    pendingZoomClientXRef.current = null;
    if (clientX !== null) setZoomFromClientX(clientX);
  };

  const queueZoomDrag = (clientX: number) => {
    pendingZoomClientXRef.current = clientX;
    if (zoomDragRafRef.current === null) {
      zoomDragRafRef.current = requestAnimationFrame(() => {
        zoomDragRafRef.current = null;
        const nextClientX = pendingZoomClientXRef.current;
        pendingZoomClientXRef.current = null;
        if (nextClientX !== null) setZoomFromClientX(nextClientX);
      });
    }
  };

  useEffect(
    () => () => {
      if (zoomDragRafRef.current !== null)
        cancelAnimationFrame(zoomDragRafRef.current);
      zoomDragRafRef.current = null;
      pendingZoomClientXRef.current = null;
    },
    [],
  );

  const handleZoomPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasTimelineContent) return;
    timelineZoomTelemetry.beginGesture("slider", pixelsPerSecond);
    e.currentTarget.setPointerCapture(e.pointerId);
    zoomGestureAnchorRef.current = captureZoomAnchor();
    setZoomFromClientX(e.clientX);
  };

  const handleZoomPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasTimelineContent) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    queueZoomDrag(e.clientX);
  };

  const handleZoomPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasTimelineContent) return;
    flushZoomDrag();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    zoomGestureAnchorRef.current = null;
    timelineZoomTelemetry.endGesture(
      useTimelineStore.getState().pixelsPerSecond,
    );
  };

  const handleZoomPointerCancel = () => {
    if (zoomDragRafRef.current !== null)
      cancelAnimationFrame(zoomDragRafRef.current);
    zoomDragRafRef.current = null;
    pendingZoomClientXRef.current = null;
    zoomGestureAnchorRef.current = null;
    timelineZoomTelemetry.endGesture(
      useTimelineStore.getState().pixelsPerSecond,
    );
  };

  const handleZoomKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasTimelineContent) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      zoomByStep(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      zoomByStep(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      timelineZoomTelemetry.beginGesture("keyboard", pixelsPerSecond);
      applyZoomLevel(TIMELINE_ZOOM_MIN, captureZoomAnchor());
      timelineZoomTelemetry.endGesture(
        useTimelineStore.getState().pixelsPerSecond,
      );
    } else if (e.key === "End") {
      e.preventDefault();
      timelineZoomTelemetry.beginGesture("keyboard", pixelsPerSecond);
      applyZoomLevel(maxZoom, captureZoomAnchor());
      timelineZoomTelemetry.endGesture(
        useTimelineStore.getState().pixelsPerSecond,
      );
    }
  };

  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const timelineTool = useUIStore((s) => s.timelineTool);
  const setTimelineTool = useUIStore((s) => s.setTimelineTool);
  const linkageEnabled = useSettingsStore((s) => s.timelineLinkageEnabled);
  const setLinkageEnabled = useSettingsStore((s) => s.setTimelineLinkageEnabled);
  const hasSelection = selectedClipIds.length > 0;
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const iconBtn =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-(--ds-radius-sm) text-text-muted transition-colors cursor-pointer hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:pointer-events-auto disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-text-muted";
  const toggleOn =
    "bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 hover:text-accent-primary";
  const iconCls = "h-4 w-4";

  const Tool = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );

  const Sep = () => (
    <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border-default" />
  );

  const ActionButton = ({
    label,
    onClick,
    disabled,
    children,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <Tool label={label}>
      <button
        type="button"
        className={iconBtn}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {children}
      </button>
    </Tool>
  );

  const ToggleButton = ({
    label,
    pressed,
    onClick,
    children,
  }: {
    label: string;
    pressed: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <Tool label={label}>
      <button
        type="button"
        className={cn(iconBtn, pressed && toggleOn)}
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={label}
      >
        {children}
      </button>
    </Tool>
  );

  const menuItem =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-text-muted transition-colors cursor-pointer hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted";

  useNativeSurfaceOcclusion(
    showQualityMenu || showToolMenu || showMoreMenu,
    "timeline-toolbar-menu",
  );
  const closeMenus = () => {
    setShowToolMenu(false);
    setShowMoreMenu(false);
  };

  const moreItem = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      className={menuItem}
      disabled={disabled}
      onClick={() => {
        onClick();
        closeMenus();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const selectLabel = t("timeline.tools.select");
  const bladeLabel = t("timeline.tools.blade");
  const ToolIcon = timelineTool === "blade" ? Scissors : MousePointer2;

  return (
    <TooltipProvider>
      <div
        data-timeline-interactive="true"
        data-testid="timeline-toolbar"
        className="border-b border-timeline-toolbar-border flex h-10 items-center gap-0.5 px-2"
      >
        {/* ── Left group ─────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5">
          <div className="relative flex items-center">
            <Tool label={timelineTool === "blade" ? bladeLabel : selectLabel}>
              <button
                type="button"
                className={cn(iconBtn, "w-7", timelineTool === "blade" && toggleOn)}
                onClick={() =>
                  setTimelineTool(timelineTool === "blade" ? "select" : "blade")
                }
                aria-pressed={timelineTool === "blade"}
                aria-label={timelineTool === "blade" ? bladeLabel : selectLabel}
              >
                <ToolIcon className={iconCls} />
              </button>
            </Tool>
            <Tool label={t("timeline.tools.toolMenu")}>
              <button
                type="button"
                className={cn(iconBtn, "w-4")}
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowToolMenu((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={showToolMenu}
                aria-label={t("timeline.tools.toolMenu")}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </Tool>
            {showToolMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMenus} />
                <div
                  role="menu"
                  className="absolute left-0 top-full z-[220] mt-1.5 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-floating py-1 shadow-xl"
                >
                  {moreItem(
                    selectLabel,
                    () => setTimelineTool("select"),
                    false,
                    <MousePointer2 className="h-3.5 w-3.5" />,
                  )}
                  {moreItem(
                    bladeLabel,
                    () => setTimelineTool("blade"),
                    false,
                    <Scissors className="h-3.5 w-3.5" />,
                  )}
                </div>
              </>
            )}
          </div>

          <Sep />

          <ActionButton
            label={`${t("common.actions.undo")} (Cmd+Z)`}
            onClick={undo}
            disabled={!historyState.canUndo}
          >
            <ToolbarUndoIcon size="1rem" className={iconCls} />
          </ActionButton>
          <ActionButton
            label={`${t("common.actions.redo")} (Cmd+Shift+Z)`}
            onClick={redo}
            disabled={!historyState.canRedo}
          >
            <ToolbarRedoIcon size="1rem" className={iconCls} />
          </ActionButton>

          <Sep />

          <ActionButton
            label={t("timeline.tools.splitAtPlayhead")}
            onClick={() => executeClipCommand("clip.splitAtPlayhead")}
            disabled={!getClipCommand("clip.splitAtPlayhead")?.isEnabled}
          >
            <ToolbarSplitIcon size="1rem" className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.clips.deleteLeft")}
            onClick={() => executeClipCommand("clip.trimStartToPlayhead")}
            disabled={!getClipCommand("clip.trimStartToPlayhead")?.isEnabled}
          >
            <ToolbarDeleteLeftIcon size="1rem" className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.clips.deleteRight")}
            onClick={() => executeClipCommand("clip.trimEndToPlayhead")}
            disabled={!getClipCommand("clip.trimEndToPlayhead")?.isEnabled}
          >
            <ToolbarDeleteRightIcon size="1rem" className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.clips.deleteSelected")}
            onClick={() => executeClipCommand("clip.rippleDelete")}
            disabled={!getClipCommand("clip.rippleDelete")?.isEnabled}
          >
            <ToolbarDeleteIcon size="1rem" className={iconCls} />
          </ActionButton>

          <Sep />

          <ActionButton
            label={t("timeline.tools.freezeFrame")}
            onClick={() => executeClipCommand("clip.freezeFrame")}
            disabled={!getClipCommand("clip.freezeFrame")?.isEnabled}
          >
            <Snowflake className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.tools.mirror")}
            onClick={mirrorSelectedClips}
            disabled={!hasSelection}
          >
            <FlipHorizontal2 className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.tools.rotate")}
            onClick={rotateSelectedClips90}
            disabled={!hasSelection}
          >
            <RotateCw className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.tools.crop")}
            onClick={focusCropControls}
            disabled={!hasSelection}
          >
            <Crop className={iconCls} />
          </ActionButton>

          <div className="relative flex items-center">
            <Tool label={t("timeline.tools.more")}>
              <button
                type="button"
                className={iconBtn}
                onClick={() => {
                  setShowToolMenu(false);
                  setShowMoreMenu((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={showMoreMenu}
                aria-label={t("timeline.tools.more")}
              >
                <MoreHorizontal className={iconCls} />
              </button>
            </Tool>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={closeMenus} />
                <div
                  role="menu"
                  data-testid="timeline-more-menu"
                  className="absolute left-0 top-full z-[220] mt-1.5 min-w-[230px] overflow-hidden rounded-lg border border-border bg-surface-floating py-1 shadow-xl"
                >
                  {moreItem(
                    t("timeline.clips.duplicateSelected"),
                    () => executeClipCommand("clip.duplicate"),
                    !getClipCommand("clip.duplicate")?.isEnabled,
                    <ToolbarDuplicateIcon size="0.875rem" className="h-3.5 w-3.5" />,
                  )}
                  {moreItem(
                    t("timeline.tools.closeGaps"),
                    () => executeTimelineCommand("timeline.closeAllGaps"),
                    !getTimelineCommand("timeline.closeAllGaps")?.isEnabled,
                    <ToolbarCloseGapIcon size="0.875rem" className="h-3.5 w-3.5" />,
                  )}
                  {getClipCommand("clip.swap")?.isVisible &&
                    moreItem(
                      t("timeline.tools.swapClips"),
                      () => executeClipCommand("clip.swap"),
                      !getClipCommand("clip.swap")?.isEnabled,
                      <ArrowLeftRight className="h-3.5 w-3.5" />,
                    )}
                  {moreItem(
                    t("timeline.tools.speedHalf"),
                    () => executeClipCommand("clip.setSpeedHalf"),
                    !getClipCommand("clip.setSpeedHalf")?.isEnabled,
                    <Gauge className="h-3.5 w-3.5" />,
                  )}
                  {moreItem(
                    t("timeline.tools.speedNormal"),
                    () => executeClipCommand("clip.setSpeedNormal"),
                    !getClipCommand("clip.setSpeedNormal")?.isEnabled,
                    <Gauge className="h-3.5 w-3.5" />,
                  )}
                  {moreItem(
                    t("timeline.tools.speedDouble"),
                    () => executeClipCommand("clip.setSpeed2x"),
                    !getClipCommand("clip.setSpeed2x")?.isEnabled,
                    <Gauge className="h-3.5 w-3.5" />,
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right group ────────────────────────────────────────── */}
        <div className="ml-auto flex items-center gap-0.5">
          {proxyEditingEnabled && (
            <span className="mr-1 flex shrink-0 items-center gap-1 rounded-full border border-status-warning/30 bg-status-warning/15 px-2 py-0.5 text-[10px] font-semibold text-status-warning">
              <Zap className="h-3 w-3" />
              {t("timeline.toolbar.proxyMode")}
            </span>
          )}

          <VoiceoverRecorderButton className={iconBtn} />

          <Sep />

          <ToggleButton
            label={t("timeline.tools.mainTrackMagnet")}
            pressed={rippleEditEnabled}
            onClick={toggleRippleEdit}
          >
            <Magnet className={iconCls} />
          </ToggleButton>
          <ToggleButton
            label={t("timeline.tools.autoSnapping")}
            pressed={snapEnabled}
            onClick={toggleSnapEnabled}
          >
            <AlignCenterVertical className={iconCls} />
          </ToggleButton>
          <ToggleButton
            label={t("timeline.tools.linkage")}
            pressed={linkageEnabled}
            onClick={() => setLinkageEnabled(!linkageEnabled)}
          >
            <Link2 className={iconCls} />
          </ToggleButton>

          {/* Preview quality quick picker (compact icon menu) */}
          <div className="relative flex items-center">
            <Tool label={t("timeline.tools.previewQuality", { quality: currentOption.label })}>
              <button
                type="button"
                onClick={() => setShowQualityMenu((v) => !v)}
                className={cn(
                  iconBtn,
                  "relative",
                  isHardwareLimited && "text-amber-400 hover:text-amber-300",
                )}
                aria-label={t("timeline.tools.previewQuality", { quality: currentOption.label })}
                title={
                  isHardwareLimited
                    ? `Preview resolution: ${currentOption.label} (${currentOption.hardwareLimitReason})`
                    : `Preview resolution: ${currentOption.label} (does not affect final export)`
                }
              >
                <MonitorPlay className={iconCls} />
                {isHardwareLimited && (
                  <span
                    className="absolute right-0.5 top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                    title="GPU limited"
                  />
                )}
              </button>
            </Tool>
            {showQualityMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowQualityMenu(false)}
                />
                <div
                  data-testid="preview-quality-menu"
                  className="absolute top-full right-0 mt-1.5 z-[220] bg-surface-floating border border-border rounded-lg shadow-xl overflow-hidden min-w-[210px] py-1"
                >
                  {tierOptions.map((tier) => (
                    <button
                      key={tier.value}
                      onClick={() => {
                        setPreviewQuality(tier.value);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-[11px] text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        previewQuality === tier.value
                          ? "text-accent-primary bg-accent-primary/10 font-semibold"
                          : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              tier.isHardwareLimited ? "text-text-primary" : ""
                            }
                          >
                            {tier.label}
                          </span>
                          {tier.isHardwareLimited && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0"
                              title={tier.hardwareLimitReason}
                            >
                              Limited by GPU
                            </span>
                          )}
                          {tier.isRecommended && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-accent-primary/15 text-accent-primary border border-accent-primary/25 shrink-0">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted mt-0.5">
                          {tier.resolutionLabel}
                          {tier.isHardwareLimited ? " · Auto-downscaled" : ""}
                        </span>
                      </div>
                      {previewQuality === tier.value && (
                        <span className="text-accent text-xs">✓</span>
                      )}
                    </button>
                  ))}
                  {gpuName && (
                    <div className="px-3 py-1.5 mt-1 border-t border-border-default text-[9.5px] text-text-muted flex items-center justify-between bg-surface-elevated/20">
                      <span className="truncate max-w-[140px]" title={gpuName}>
                        {gpuName}
                      </span>
                      {isHardwareLimited && (
                        <span className="text-amber-400 font-medium shrink-0">
                          {is4kProject ? "4K downscaled" : "GPU constrained"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <Sep />

          <ActionButton
            label={t("timeline.tools.fitSequence")}
            onClick={fitSequence}
            disabled={!hasTimelineContent}
          >
            <Maximize2 className={iconCls} />
          </ActionButton>
          <ActionButton
            label={t("timeline.tools.zoomOutTimeline")}
            onClick={() => zoomByStep(-1)}
            disabled={!hasTimelineContent || zoomLevel <= TIMELINE_ZOOM_MIN}
          >
            <ZoomOut className={iconCls} />
          </ActionButton>
            <div
              ref={zoomRailRef}
              role="slider"
              tabIndex={hasTimelineContent ? 0 : -1}
              aria-disabled={!hasTimelineContent}
              aria-label={t("timeline.tools.zoomTimeline")}
              aria-valuemin={TIMELINE_ZOOM_MIN}
              aria-valuemax={maxZoom}
              aria-valuenow={zoomLevel}
              aria-valuetext={`${zoomLevel.toFixed(2)} times, ${currentTierLabel}, ${temporalDetail.label}, ${cadenceLabel} samples`}
              onPointerDown={handleZoomPointerDown}
              onPointerMove={handleZoomPointerMove}
              onPointerUp={handleZoomPointerUp}
              onPointerCancel={handleZoomPointerCancel}
              onLostPointerCapture={handleZoomPointerCancel}
              onKeyDown={handleZoomKeyDown}
              className={`group relative flex h-6 w-28 items-center rounded-full outline-none ${hasTimelineContent ? "cursor-pointer touch-none" : "cursor-not-allowed opacity-40"} focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
            >
              <div className="relative mx-[8px] h-[5px] w-full overflow-hidden rounded-full bg-surface-raised shadow-inner">
                {tierSegments.map(({ tier, left, width }) => (
                  <div
                    key={tier}
                    aria-hidden
                    className={`absolute top-0 h-full ${TIER_BAND_CLASS[tier]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                ))}
                <div
                  className="relative h-full rounded-full bg-accent-primary shadow-[0_0_16px_var(--salvador-accent-glow)]"
                  style={{ width: `${zoomProgress}%` }}
                />
              </div>
              <div
                data-testid="timeline-zoom-thumb"
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface"
                style={{ left: `${zoomThumbLeftPx}px` }}
              />
            </div>

          <ActionButton
            label={t("timeline.tools.zoomInTimeline")}
            onClick={() => zoomByStep(1)}
            disabled={!hasTimelineContent || zoomLevel >= maxZoom}
          >
            <ZoomIn className={iconCls} />
          </ActionButton>
        </div>
      </div>
    </TooltipProvider>
  );
};

export const TimelineToolbar = React.memo(TimelineToolbarComponent);
