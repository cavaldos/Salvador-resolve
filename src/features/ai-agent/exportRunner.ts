/**
 * Headless export entry used by the AI agent's `start_export` tool.
 *
 * Mirrors the export flow in `components/ui/modals/ExportDialog.tsx`
 * (native zero-copy path first, compositor fallback second) and reports
 * through `useExportStore`, without needing the dialog to be mounted.
 */
import { platform } from "@/core/platform";
import { useProjectStore } from "@/store/projectStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useExportStore } from "@/store/exportStore";
import {
  PRESET_CONFIGS,
  PRESET_ORDER,
  getQualityTierForPreset,
  type ExportPreset,
} from "@/lib/export/exportPresets";
import { resolveExportDimensions } from "@/lib/export/exportDimensions";

export const EXPORT_PRESET_IDS = PRESET_ORDER as readonly ExportPreset[];

export interface ExportOutcome {
  outputPath: string;
  totalFrames: number;
  totalTimeMs: number;
  cancelled: boolean;
}

/** Ask the user for an output path via the native save dialog. */
export async function pickExportPath(preset: ExportPreset): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const cfg = PRESET_CONFIGS[preset];
  const ext = cfg.codecValue === "prores" ? "mov" : cfg.codecValue === "gif" ? "gif" : cfg.codecValue === "vp9" ? "webm" : "mp4";
  const name = useProjectStore.getState().project?.name || "video";
  const path = await save({
    defaultPath: `${name}.${ext}`,
    filters: [{ name: "Video", extensions: [ext] }],
  });
  return path ?? null;
}

export async function runExport(preset: ExportPreset, outputPath: string): Promise<ExportOutcome> {
  const project = useProjectStore.getState().project;
  if (!project) throw new Error("no project is open");
  const cfg = PRESET_CONFIGS[preset];
  if (!cfg) throw new Error(`unknown export preset ${preset}`);

  const { clips, tracks, transitions, epoch, getTimelineEndTime } = useTimelineStore.getState();
  const mediaAssets = useProjectStore.getState().mediaAssets;
  const endTime = getTimelineEndTime();
  if (endTime <= 0) throw new Error("timeline is empty");

  const { width, height } = resolveExportDimensions(project.canvasWidth || 1920, project.canvasHeight || 1080, getQualityTierForPreset(preset));
  const exp = useExportStore.getState();
  exp.setPresetId(preset);
  exp.startExporting(outputPath);

  const controller = new AbortController();
  exp.setCancelFn(async () => controller.abort());

  const base = {
    clips,
    tracks,
    transitions,
    assets: mediaAssets,
    project,
    startTime: 0,
    endTime,
    outputPath,
    width,
    height,
    frameRate: project.frameRate,
    codec: cfg.codecValue as never,
    preset: cfg.preset,
    crf: cfg.crf,
    pixelFormat: cfg.pixelFormat as never,
  };
  const onProgress = (p: {
    currentFrame: number;
    totalFrames: number;
    progress: number;
    fps?: number;
    rtf?: number;
    etaSeconds: number;
  }) => useExportStore.getState().setProgress(p as never);

  try {
    if (platform.isTauri()) {
      const { analyzeNativeTimelineExport, runNativeTimelineExport } = await import("@/lib/export/nativeTimelineExport");
      const eligibility = analyzeNativeTimelineExport(base as never);
      if (eligibility.eligible) {
        const r = await runNativeTimelineExport(eligibility.plan, {
          signal: controller.signal,
          onProgress,
          onSessionReady: (cancel: () => Promise<void>) => useExportStore.getState().setCancelFn(cancel),
        });
        useExportStore.getState().setPhase(r.cancelled ? "idle" : "complete");
        return { outputPath, totalFrames: r.completedFrames, totalTimeMs: r.totalTimeMs, cancelled: !!r.cancelled };
      }
    }
    const { exportVideo } = await import("@/lib/export/videoExport");
    const r = await exportVideo({
      ...base,
      epoch,
      signal: controller.signal,
      directGpuPipe: platform.isTauri(),
      onProgress,
      onSessionReady: (cancel: () => Promise<void>) => useExportStore.getState().setCancelFn(cancel),
    } as never);
    useExportStore.getState().setPhase(r.cancelled ? "idle" : "complete");
    return { outputPath, totalFrames: r.totalFrames, totalTimeMs: r.totalTimeMs, cancelled: !!r.cancelled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useExportStore.getState().setError(msg);
    throw err;
  } finally {
    useExportStore.getState().setCancelFn(null);
  }
}
