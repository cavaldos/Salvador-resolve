import React, { useState, useEffect } from "react";
import type { TimelineClip, Track } from "@/modules/editor/types";
import type { MediaAsset } from "@/modules/projects/types";
import { TimelineFilmstrip } from "./TimelineFilmstrip";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { useProjectStore } from "@/modules/projects";
import { db } from "@/modules/core/db/database";
import { objectUrlManager } from "@/modules/core/db/object-url-manager";
import {
  ContextMenu,
  type ContextMenuItemData,
} from "@/shared/components/ui/ContextMenu";
import { useClipboardStore } from "@/modules/editor/store/useClipboardStore";
import { usePlaybackStore } from "@/modules/editor/store/usePlaybackStore";
import { WaveformCanvas } from "@/modules/editor/features/audio/components/WaveformCanvas";
import { detachAudioFromVideo } from "@/modules/editor/features/audio/utils/detachAudio";
import { resolveMediaAssetBlob } from "@/modules/core/storage/media-source-service";
import { extractAudioPeaks } from "@/modules/editor/features/audio/utils/audio-peaks";
import { getVideoWaveform } from "@/modules/editor/features/audio/utils/video-waveform";
import { getTimelineGapBefore } from "@/modules/editor/utils/timeline-utils";
import { formatTimecode } from "../utils/ruler-utils";
import {
  FileVideo,
  Image as ImageIcon,
  Music,
  Type,
  Shapes,
  AlertCircle,
  Scissors,
  Copy,
  Trash2,
  Volume2,
  VolumeX,
  Unlink,
  Clipboard,
  MoveLeft,
  ArrowUp,
  ArrowDown,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

export interface ClipDragAppearance {
  thumbnailUrl: string | null;
  aspectRatio: number;
}

export interface TimelineClipItemProps {
  clip: TimelineClip;
  track: Track;
  zoom: number; // Px per second
  trackHeight: number;
  isDragging?: boolean;
  onStartDrag: (
    clip: TimelineClip,
    mode: "move" | "trim-start" | "trim-end",
    e: React.PointerEvent,
    appearance?: ClipDragAppearance,
  ) => void;
}

export function TimelineClipItem({
  clip,
  track,
  zoom,
  trackHeight,
  isDragging = false,
  onStartDrag,
}: TimelineClipItemProps) {
  const { selectedClipIds, toggleClipSelection } = useEditorUIStore();
  const { splitClip, duplicateClips, deleteClips, updateClip } =
    useProjectStore();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [videoAsset, setVideoAsset] = useState<MediaAsset | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const [assetDuration, setAssetDuration] = useState<number>(10);
  const [assetAspectRatio, setAssetAspectRatio] = useState<number>(16 / 9);
  const [isMissingAsset, setIsMissingAsset] = useState(false);

  const isSelected = selectedClipIds.includes(clip.id);
  const widthPx = Math.max(12, clip.timelineDuration * zoom);
  const leftPx = 16 + clip.timelineStart * zoom;
  const durationLabel = `${clip.timelineDuration.toFixed(1)}s`;
  const fps = usePlaybackStore((state) => state.fps);
  // Only display seconds duration when clip has enough width to prevent overlapping labels
  const showDuration = widthPx >= 75;
  const showStatusDetails = widthPx >= 150;

  const frameHeight = trackHeight - 8;
  const hasVideoWaveform = clip.type === "video" && Boolean(waveformPeaks);
  const filmstripHeight = frameHeight - 18 - (hasVideoWaveform ? 12 : 0);
  const frameWidth = Math.min(98, Math.max(54, Math.round(filmstripHeight * assetAspectRatio)));
  const sourceDuration = clip.timelineDuration * (clip.speed || 1);

  useEffect(() => {
    let isMounted = true;

    async function checkAsset() {
      if (clip.assetId) {
        const asset = await db.assets.get(clip.assetId);
        if (!asset) {
          if (isMounted) setIsMissingAsset(true);
          return;
        }

        if (isMounted) {
          setAssetDuration(asset.duration || 10);
          if (asset.width && asset.height && asset.height > 0) {
            setAssetAspectRatio(asset.width / asset.height);
          }
          if (asset.type !== "video" && asset.waveformPeaks && asset.waveformPeaks.length > 0) {
            setWaveformPeaks(asset.waveformPeaks);
          } else if (asset.type !== "video" && asset.waveformStatus === "deferred") {
            setWaveformPeaks(Array.from({ length: 80 }, () => 0.18));
          }
        }

        if (asset.type === "video") {
          if (isMounted) setVideoAsset(asset);
          void getVideoWaveform(asset).then((peaks) => {
            if (isMounted) setWaveformPeaks(peaks.length ? peaks : null);
          });
        } else if (clip.type === "audio") {
          const existingPeaks = asset.waveformPeaks;
          const isOldResolution = !existingPeaks || existingPeaks.length < 800;
          const isQuietOrFlat =
            existingPeaks &&
            (existingPeaks.every((p) => p < 0.22) ||
              existingPeaks.slice(0, 30).every((p) => Math.abs(p - existingPeaks[0]) < 0.03));
          const needsUpgrade = isOldResolution || isQuietOrFlat;

          if (needsUpgrade) {
            resolveMediaAssetBlob(asset)
              .then(async (blob) => {
                const freshPeaks = await extractAudioPeaks(blob);
                if (freshPeaks && freshPeaks.length > 0 && isMounted) {
                  setWaveformPeaks(freshPeaks);
                  void db.assets
                    .update(asset.id, {
                      waveformPeaks: freshPeaks,
                      waveformStatus: "ready",
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          }
        }

        if (asset.thumbnailBlobId) {
          const cached = objectUrlManager.getUrl(asset.thumbnailBlobId);
          if (cached) {
            if (isMounted) setThumbUrl(cached);
            return;
          }

          const thumbRecord = await db.thumbnails.get(asset.thumbnailBlobId);
          if (thumbRecord && isMounted) {
            const url = objectUrlManager.createUrl(
              asset.thumbnailBlobId,
              thumbRecord.blob,
            );
            setThumbUrl(url);
          }
        }
      }
    }

    void checkAsset().catch(() => {
      if (isMounted) setIsMissingAsset(true);
    });

    return () => {
      isMounted = false;
    };
  }, [clip.assetId, clip.type]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (track.locked) return;
    e.preventDefault();
    e.stopPropagation();
    toggleClipSelection(clip.id, e.shiftKey);
    onStartDrag(clip, "move", e, {
      thumbnailUrl: thumbUrl,
      aspectRatio: assetAspectRatio,
    });
  };


  const renderIcon = () => {
    switch (clip.type) {
      case "video":
        return <FileVideo className="h-3 w-3 shrink-0" />;
      case "image":
        return <ImageIcon className="h-3 w-3 shrink-0" />;
      case "audio":
        return <Music className="h-3 w-3 shrink-0" />;
      case "text":
        return <Type className="h-3 w-3 shrink-0" />;
      case "overlay":
        return <Shapes className="h-3 w-3 shrink-0" />;
    }
  };

  const isAudioMuted = track.muted || clip.audio?.muted;

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { selectedClipIds, setSelectedClipIds } = useEditorUIStore.getState();
    if (!selectedClipIds.includes(clip.id)) {
      setSelectedClipIds([clip.id]);
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const clipMenuItems: ContextMenuItemData[] = [
    {
      id: "cut",
      label: "Cut",
      icon: <Scissors className="h-3.5 w-3.5" />,
      shortcut: "⌘X",
      onClick: () => {
        useClipboardStore.getState().cutSelectedClips([clip.id]);
      },
    },
    {
      id: "copy",
      label: "Copy",
      icon: <Copy className="h-3.5 w-3.5" />,
      shortcut: "⌘C",
      onClick: () => {
        useClipboardStore.getState().copySelectedClips([clip.id]);
      },
    },
    {
      id: "paste-after",
      label: "Paste after",
      icon: <Clipboard className="h-3.5 w-3.5" />,
      shortcut: "⌘V",
      disabled: useClipboardStore.getState().clipboardClips.length === 0,
      onClick: () => {
        useClipboardStore
          .getState()
          .pasteClips(track.id, clip.timelineStart + clip.timelineDuration);
      },
    },
    {
      id: "duplicate",
      label: "Duplicate",
      icon: <Copy className="h-3.5 w-3.5" />,
      shortcut: "⌘D",
      onClick: () => duplicateClips([clip.id]),
    },
    { id: "div-1", label: "", isDivider: true, onClick: () => {} },
    {
      id: "split",
      label: "Split",
      icon: <Scissors className="h-3.5 w-3.5" />,
      shortcut: "S",
      onClick: () => {
        const playhead = usePlaybackStore.getState().playhead;
        splitClip(clip.id, playhead);
      },
    },
    {
      id: "move-playhead",
      label: "Move to playhead",
      icon: <MoveLeft className="h-3.5 w-3.5" />,
      onClick: () => {
        const playhead = usePlaybackStore.getState().playhead;
        updateClip(clip.id, { timelineStart: playhead });
      },
    },
    { id: "div-2", label: "", isDivider: true, onClick: () => {} },
    ...(clip.type !== "audio"
      ? [
          {
            id: "bring-forward",
            label: "Bring forward",
            icon: <ArrowUp className="h-3.5 w-3.5" />,
            onClick: () => {
              const tracks =
                useProjectStore.getState().currentProject?.tracks || [];
              const idx = tracks.findIndex((t) => t.id === track.id);
              if (idx >= 0 && idx < tracks.length - 1) {
                useProjectStore.getState().reorderTracks(idx, idx + 1);
              }
            },
          },
          {
            id: "bring-backward",
            label: "Send backward",
            icon: <ArrowDown className="h-3.5 w-3.5" />,
            onClick: () => {
              const tracks =
                useProjectStore.getState().currentProject?.tracks || [];
              const idx = tracks.findIndex((t) => t.id === track.id);
              if (idx > 0) {
                useProjectStore.getState().reorderTracks(idx, idx - 1);
              }
            },
          },
        ]
      : []),
    {
      id: "lock",
      label: track.locked ? "Unlock" : "Lock",
      icon: <Lock className="h-3.5 w-3.5" />,
      onClick: () => {
        useProjectStore.setState((state) => {
          if (state.currentProject) {
            const t = state.currentProject.tracks.find(
              (x) => x.id === track.id,
            );
            if (t) t.locked = !t.locked;
          }
        });
      },
    },
    {
      id: "hide-mute",
      label:
        clip.type === "audio" || clip.audio
          ? clip.audio?.muted
            ? "Unmute"
            : "Mute"
          : track.hidden
            ? "Show"
            : "Hide",
      icon:
        clip.type === "audio" || clip.audio ? (
          clip.audio?.muted ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )
        ) : track.hidden ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        ),
      onClick: () => {
        if (clip.type === "audio" || clip.audio) {
          updateClip(clip.id, {
            audio: {
              ...clip.audio,
              volume: clip.audio?.volume ?? 1,
              fadeIn: 0,
              fadeOut: 0,
              muted: !clip.audio?.muted,
            },
          });
        } else {
          useProjectStore.setState((state) => {
            if (state.currentProject) {
              const t = state.currentProject.tracks.find(
                (x) => x.id === track.id,
              );
              if (t) t.hidden = !t.hidden;
            }
          });
        }
      },
    },
    ...(clip.type === "video"
      ? [
          {
            id: "detach-audio",
            label: "Detach audio",
            icon: <Unlink className="h-3.5 w-3.5 text-white/90" />,
            disabled: track.locked || Boolean(clip.audio?.muted),
            onClick: () => void detachAudioFromVideo(clip.id),
          },
        ]
      : []),
    {
      id: "close-gap",
      label: "Close gap before clip",
      disabled: !getTimelineGapBefore(track, clip),
      onClick: () => useProjectStore.getState().closeGapBeforeClip(clip.id),
    },
    {
      id: "ripple-delete",
      label: "Ripple delete on this track",
      disabled: track.locked,
      onClick: () => deleteClips([clip.id], { ripple: true }),
    },
    { id: "div-3", label: "", isDivider: true, onClick: () => {} },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      icon: <Trash2 className="h-3.5 w-3.5 text-destructive" />,
      shortcut: "Del",
      onClick: () => deleteClips([clip.id]),
    },
  ];

  return (
    <>
      <div
        id={`timeline-clip-${clip.id}`}
        style={{
          position: "absolute",
          left: `${leftPx}px`,
          width: `${widthPx}px`,
          top: "4px",
          height: frameHeight,
        }}
        title={`${clip.name} • ${durationLabel}`}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        className={cn(
          "group relative flex touch-none items-center justify-between overflow-hidden rounded-[5px] border text-studio-fg select-none cursor-grab active:cursor-grabbing transition-[opacity,box-shadow,border-color,background-color]",
          clip.type === "video" || clip.type === "image" ? "bg-teal-950" : "bg-studio-panel-raised",
          isSelected
            ? "border-studio-fg ring-1 ring-studio-fg shadow-md"
            : "border-studio-border hover:border-studio-border-strong",
          isDragging && "opacity-40 ring-2 ring-studio-fg/60",
          track.locked && "opacity-60 cursor-not-allowed",
        )}
      >
        {/* Left Trim Handle */}
        {!track.locked && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDrag(clip, "trim-start", e);
            }}
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-studio-fg/80 z-30 transition-colors opacity-0 group-hover:opacity-100"
            title="Trim clip start"
          />
        )}

        {(clip.type === "video" || clip.type === "image") && (
          <TimelineFilmstrip
            videoAsset={clip.type === "video" && videoAsset?.id === clip.assetId ? videoAsset : null}
            poster={thumbUrl}
            sourceStart={clip.sourceStart}
            sourceDuration={sourceDuration}
            width={widthPx}
            tileWidth={frameWidth}
            hasWaveform={hasVideoWaveform}
          />
        )}

        {(clip.type === "audio" || clip.type === "video") && waveformPeaks && (
          <div
            data-waveform={clip.type}
            className={cn("pointer-events-none absolute inset-x-0 bottom-0", clip.type === "video" ? "z-[1] h-3 border-t border-teal-700/50 bg-teal-200/60 dark:bg-teal-950" : "top-0 z-0 px-2 py-1")}
          >
            <WaveformCanvas
              peaks={waveformPeaks}
              sourceStart={clip.sourceStart}
              sourceDuration={sourceDuration}
              totalAssetDuration={assetDuration}
              isMuted={isAudioMuted}
              width={Math.max(10, widthPx - (clip.type === "video" ? 2 : 16))}
            />
          </div>
        )}

        {/* Text Clip Content Label */}
        {clip.type === "text" && widthPx >= 28 && (
          <div className="z-10 absolute inset-y-0 left-2 right-10 flex items-center gap-1.5 pointer-events-none select-none">
            <Type className="h-3 w-3 shrink-0 text-studio-muted" />
            <span className="truncate text-xs font-medium text-studio-fg tracking-tight">
              “{clip.textStyle?.text || clip.name}”
            </span>
          </div>
        )}

        {/* Audio Clip Content Label */}
        {clip.type === "audio" && widthPx >= 28 && (
          <div className="z-10 absolute top-1 left-2 flex min-w-0 max-w-[calc(100%-48px)] items-center gap-1.5 pointer-events-none select-none leading-none">
            <Music className="h-3 w-3 shrink-0 text-studio-muted" />
            <span className="truncate text-[10px] font-medium text-studio-fg tracking-tight">
              {clip.name}
            </span>
            {showStatusDetails && isAudioMuted && (
              <span className="flex items-center gap-0.5 rounded bg-destructive/90 px-1 py-0.5 text-[8px] font-bold text-white shadow-xs leading-none">
                <VolumeX className="h-2.5 w-2.5" /> Muted
              </span>
            )}
          </div>
        )}

        {/* Video, Image, Overlay Clip Content Label */}
        {clip.type !== "text" && clip.type !== "audio" && widthPx >= 28 && (
          <div className="z-10 absolute inset-x-0 top-0 flex h-[18px] min-w-0 items-center gap-1.5 bg-[#204f53] px-1.5 pointer-events-none select-none leading-none">
            {clip.type !== "video" && clip.type !== "image" && renderIcon()}
            <span className="truncate text-[11px] font-medium leading-none text-white">
              {clip.name}
            </span>
            {showDuration && (
              <span className="shrink-0 rounded-sm bg-white/10 px-1 font-mono text-[10px] tabular-nums text-white/90">
                {formatTimecode(clip.timelineDuration, fps, true)}
              </span>
            )}
            {showStatusDetails && isAudioMuted && clip.type === "video" && (
              <span title="Audio muted" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                <VolumeX className="h-2.5 w-2.5 shrink-0 text-white/80" />
              </span>
            )}
            {showStatusDetails && isMissingAsset && (
              <span
                className="flex items-center gap-0.5 rounded bg-destructive/90 px-1 py-0.5 text-[8px] font-bold text-white shadow-xs leading-none"
                title="Missing asset file"
              >
                <AlertCircle className="h-2 w-2" /> Missing
              </span>
            )}
          </div>
        )}

        {/* Duration Label in Bottom Right (No box effect, only when width is sufficient) */}
        {(clip.type === "text" || clip.type === "audio") && showDuration && (
          <span className="z-10 absolute bottom-1 right-2 font-mono text-[8.5px] font-medium text-studio-muted/80 pointer-events-none select-none leading-none">
            {durationLabel}
          </span>
        )}
        {clip.type !== "video" && clip.type !== "image" && clip.type !== "text" && clip.type !== "audio" && showDuration && (
          <span className="z-10 absolute bottom-1 right-2 font-mono text-[8.5px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none select-none leading-none">
            {durationLabel}
          </span>
        )}

        {/* Right Trim Handle */}
        {!track.locked && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDrag(clip, "trim-end", e);
            }}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-studio-fg/80 z-30 transition-colors opacity-0 group-hover:opacity-100"
            title="Trim clip end"
          />
        )}
      </div>

      {contextMenuPos && (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          items={clipMenuItems}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </>
  );
}
