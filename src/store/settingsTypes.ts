/** The two supported appearance modes. */
export type ColorMode = "dark" | "light";
/**
 * Runtime theme identifier.
 * "custom" kept for backward compat with persisted localStorage data.
 */
export type Theme = ColorMode | "custom";
/** Alias for the UI chrome layer — always a ColorMode. */
export type UiTheme = ColorMode;
/** Alias for the clip colour layer — always a ColorMode. */
export type ClipPalette = ColorMode;

export type FontFamily =
  | "inter"
  | "montserrat"
  | "geist"
  | "outfit"
  | "roboto"
  | "space-grotesk"
  | "system"
  | "mono";
export const SUPPORTED_FRAME_RATES = [
  23.976, 24, 25, 29.97, 30, 50, 60,
] as const;
export type FrameRate = (typeof SUPPORTED_FRAME_RATES)[number];

export function isValidFrameRate(v: unknown): v is FrameRate {
  return SUPPORTED_FRAME_RATES.includes(v as FrameRate);
}
export type PreviewQuality = "full" | "high" | "medium" | "low";
export type LayoutPreset =
  | "studio"
  | "default"
  | "tall-player-right"
  | "tall-player-left"
  | "timeline-focus"
  | "dual-player"
  | "cinema-preview"
  | "vertical-shorts"
  | "inspector-focus";

export interface SettingsStore {
  // Appearance
  uiTheme: UiTheme;
  clipPalette: ClipPalette;
  theme: Theme;
  fontFamily: FontFamily;
  customTheme: Record<string, string> | null;
  setUiTheme: (theme: UiTheme) => void;
  setClipPalette: (palette: ClipPalette) => void;
  setTheme: (theme: Theme) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  setCustomTheme: (colors: Record<string, string>) => void;
  resetCustomTheme: () => void;
  // Editor
  snapToGrid: boolean;
  autoSave: boolean;
  defaultFrameRate: FrameRate;
  previewQuality: PreviewQuality;
  setSnapToGrid: (v: boolean) => void;
  setAutoSave: (v: boolean) => void;
  setDefaultFrameRate: (v: FrameRate) => void;
  setPreviewQuality: (v: PreviewQuality) => void;
  // Performance
  proxyEditingEnabled: boolean;
  autoClearCacheOnProjectClose: boolean;
  setProxyEditingEnabled: (v: boolean) => void;
  /** Link video and audio: selecting a clip also selects its linked audio clip. */
  timelineLinkageEnabled: boolean;
  setTimelineLinkageEnabled: (v: boolean) => void;
  setAutoClearCacheOnProjectClose: (v: boolean) => void;
  // Layout persistence (replaces anonymous localStorage keys)
  layoutPreset: LayoutPreset;
  sidebarWidth: number;
  propertiesPanelWidth: number;
  tallPlayerWidth: number;
  /** Studio layout: resource panel width in px (null = viewport default). */
  studioLeftWidth: number | null;
  /** Studio layout: details panel width in px (null = viewport default). */
  studioRightWidth: number | null;
  sidebarCollapsed: boolean;
  propertiesPanelCollapsed: boolean;
  timelineHeight: number;
  setLayoutPreset: (v: LayoutPreset) => void;
  setSidebarWidth: (v: number) => void;
  setPropertiesPanelWidth: (v: number) => void;
  setTallPlayerWidth: (v: number) => void;
  setStudioLeftWidth: (v: number | null) => void;
  setStudioRightWidth: (v: number | null) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setPropertiesPanelCollapsed: (v: boolean) => void;
  setTimelineHeight: (v: number) => void;
  // Local Transfer Save Directory
  transferSaveDirectory: string | null;
  setTransferSaveDirectory: (v: string | null) => void;
}
