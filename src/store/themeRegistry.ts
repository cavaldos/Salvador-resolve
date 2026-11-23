/** Theme definitions, clip palettes, and runtime CSS composition. */
import {
  SALVADOR_LEGACY_COLOR_ALIASES,
  SALVADOR_SHADCN_COLOR_ALIASES,
  SALVADOR_THEME_SOURCE_ALIASES,
} from "@/constants/colors";
import type { ClipPalette, FontFamily, Theme, UiTheme } from "./settingsTypes";

export const UI_THEME_IDS: UiTheme[] = [
  "dark",
  "light",
];

export const CLIP_PALETTE_IDS: ClipPalette[] = [...UI_THEME_IDS];

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === "string" && (value === "dark" || value === "light");
}

export function isClipPalette(value: unknown): value is ClipPalette {
  return typeof value === "string" && (value === "dark" || value === "light");
}

// ─── Theme definitions ──────────────────────────────────────────────────────
// Each theme provides a complete set of CSS custom properties so that the
// entire editor UI updates consistently when switching.
const themes: Record<Exclude<Theme, "custom">, Record<string, string>> = {
  dark: {
    "--color-bg": "#101010",
    "--color-surface": "#1c1c1e",
    "--color-surface-raised": "#202022",
    "--color-surface-panel": "#1c1c1e",
    "--color-surface-floating": "#26262a",
    "--color-border": "#2a2a2c",
    "--color-border-soft": "#3a3a3e",
    "--color-accent": "#22c3e6",
    "--color-accent-soft": "#7ddcf0",
    "--color-text-primary": "#e6e6e6",
    "--color-text-muted": "#8a8a8e",
    "--color-danger": "#e26061",
    // Guides & Indicators
    "--color-guide-center": "#ff3b30",
    "--color-snap-guide-clip": "#10b981",
    "--color-handle": "#ffffff",
    "--color-handle-border": "rgba(0, 0, 0, 0.25)",
    // Timeline-specific colors
    "--color-timeline-bg": "#1c1c1e",
    "--color-timeline-track-bg": "#18181a",
    "--color-timeline-track-border": "#2a2a2c",
    "--color-timeline-track-hover": "#26262a",
    "--color-timeline-track-selected": "#1f3138",
    "--color-timeline-track-active": "#1c3a44",
    "--color-timeline-ruler-bg": "#202022",
    "--color-timeline-ruler-tick-major": "#5a5a5e",
    "--color-timeline-ruler-tick-minor": "#38383c",
    "--color-timeline-ruler-text": "#8a8a8e",
    "--color-timeline-toolbar-border": "#2a2a2c",
    "--color-timeline-toolbar-divider": "#3a3a3e",
    "--color-timeline-button-hover": "#2a2a2e",
    "--color-timeline-button-icon": "#a0a0a6",
    "--color-timeline-track-label": "#a0a0a6",
    "--color-timeline-track-name": "#e6e6e6",
    "--color-timeline-ghost-track-bg": "#1c1c1e",
    "--color-timeline-drop-indicator": "#22c3e6",
    "--color-timeline-drop-zone-text": "#8a8a8e",

    // shadcn compat
    "--background": "#101010",
    "--foreground": "#e6e6e6",
    "--card": "#1c1c1e",
    "--card-foreground": "#e6e6e6",
    "--popover": "#26262a",
    "--popover-foreground": "#e6e6e6",
    "--primary": "#22c3e6",
    "--primary-foreground": "#101010",
    "--secondary": "#202022",
    "--secondary-foreground": "#e6e6e6",
    "--muted": "#202022",
    "--muted-foreground": "#8a8a8e",
    "--accent": "#22c3e6",
    "--accent-foreground": "#101010",
    "--destructive": "#e26061",
    "--border": "#2a2a2c",
    "--input": "#141416",
    "--ring": "#22c3e6",
  },
  light: {
    "--color-bg": "#f4f6f8",
    "--color-surface": "#ffffff",
    "--color-surface-raised": "#e8ecf0",
    "--color-surface-panel": "#f4f6f8",
    "--color-surface-floating": "#ffffff",
    "--color-border": "#d0d8e0",
    "--color-border-soft": "#b0bcc8",
    "--color-accent": "#2a7d99",
    "--color-accent-soft": "#3f9fbc",
    "--color-text-primary": "#111827",
    "--color-text-muted": "#647585",
    "--color-danger": "#dc2626",
    // Guides & Indicators
    "--color-guide-center": "#ef4444",
    "--color-snap-guide-clip": "#059669",
    "--color-handle": "#111827",
    "--color-handle-border": "rgba(0, 0, 0, 0.12)",
    // Timeline-specific colors
    "--color-timeline-bg": "#e8ecf0",
    "--color-timeline-track-bg": "#dde4ec",
    "--color-timeline-track-border": "#c8d2de",
    "--color-timeline-track-hover": "#d4dce8",
    "--color-timeline-track-selected": "#c8d4e4",
    "--color-timeline-track-active": "#c0cede",
    "--color-timeline-ruler-bg": "#edf1f5",
    "--color-timeline-ruler-tick-major": "#8898a8",
    "--color-timeline-ruler-tick-minor": "#b0bcc8",
    "--color-timeline-ruler-text": "#647585",
    "--color-timeline-toolbar-border": "#d0d8e0",
    "--color-timeline-toolbar-divider": "#c0ccd8",
    "--color-timeline-button-hover": "#dde4ec",
    "--color-timeline-button-icon": "#48566a",
    "--color-timeline-track-label": "#48566a",
    "--color-timeline-track-name": "#111827",
    "--color-timeline-ghost-track-bg": "#e8ecf0",
    "--color-timeline-drop-indicator": "#2a7d99",
    "--color-timeline-drop-zone-text": "#647585",

    // shadcn compat
    "--background": "#f4f6f8",
    "--foreground": "#111827",
    "--card": "#ffffff",
    "--card-foreground": "#111827",
    "--popover": "#ffffff",
    "--popover-foreground": "#111827",
    "--primary": "#2a7d99",
    "--primary-foreground": "#ffffff",
    "--secondary": "#e8ecf0",
    "--secondary-foreground": "#111827",
    "--muted": "#e8ecf0",
    "--muted-foreground": "#647585",
    "--accent": "#2a7d99",
    "--accent-foreground": "#ffffff",
    "--destructive": "#dc2626",
    "--border": "#d0d8e0",
    "--input": "#e8ecf0",
    "--ring": "#2a7d99",
  },
};

// ─── Independent theme registries ──────────────────────────────────────────
// UI themes own the application chrome and timeline structure. Clip palettes
// own only clip/fill/waveform colours. The runtime always composes one UI
// registry entry with one clip registry entry; no theme can overwrite the
// other layer's roles.
export const CLIP_PALETTE_TOKEN_KEYS = [
  "--color-timeline-clip-video",
  "--color-timeline-clip-video-border",
  "--color-timeline-clip-invalid",
  "--color-timeline-clip-audio",
  "--color-timeline-clip-audio-border",
  "--color-timeline-clip-image",
  "--color-timeline-clip-text",
  "--color-timeline-clip-caption",
  "--color-timeline-clip-title",
  "--color-timeline-clip-effect",
  "--color-timeline-clip-compound",
  "--color-timeline-clip-sticker",
  "--color-timeline-clip-fg",
  "--color-timeline-clip-muted-fg",
  "--color-timeline-clip-audio-wave",
  "--color-timeline-clip-envelope-fill",
  "--color-timeline-clip-envelope-line",
  "--color-timeline-clip-duration",
  "--color-timeline-filmstrip-bg",
  "--color-timeline-filmstrip-empty",
  "--color-timeline-filmstrip-border",
  "--color-timeline-filmstrip-overlay",
  "--color-timeline-filmstrip-overlay-soft",
  "--color-timeline-clip-badge-bg",
  "--color-timeline-clip-metadata-bg",
  "--color-timeline-clip-metadata-border",
  "--color-timeline-clip-waveform-bg",
  "--color-timeline-clip-waveform-border",
  "--color-timeline-clip-control-bg",
  "--color-timeline-clip-control-border",
  "--color-timeline-clip-control-shadow",
  "--color-timeline-clip-keyframe-bg",
  "--color-timeline-clip-keyframe-border",
  "--color-timeline-clip-keyframe-shadow",
  "--color-timeline-clip-volume-line",
  "--color-timeline-clip-volume-shadow",
  "--color-timeline-clip-tooltip-bg",
  "--color-timeline-clip-tooltip-border",
  "--color-timeline-clip-tooltip-text",
  "--color-timeline-clip-drag-shadow",
  "--color-timeline-clip-drag-border",
] as const;

export type ClipPaletteToken = (typeof CLIP_PALETTE_TOKEN_KEYS)[number];
export type ClipPaletteTokens = Record<ClipPaletteToken, string>;

const CLIP_TOKEN_KEYS = new Set([
  ...CLIP_PALETTE_TOKEN_KEYS,
  // Strip the removed names from custom/v1 theme objects during migration.
  "--color-video-clip",
  "--color-audio-clip",
  "--color-text-clip",
]);

function withoutClipTokens(colors: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(colors).filter(
      ([property]) => !CLIP_TOKEN_KEYS.has(property),
    ),
  );
}

/** Canonical UI chrome registry. */
export const UI_THEMES: Record<
  UiTheme,
  Record<string, string>
> = Object.fromEntries(
  UI_THEME_IDS.map((theme) => [theme, withoutClipTokens(themes[theme])]),
) as Record<UiTheme, Record<string, string>>;

/**
 * Canonical clip palette registry — one entry per UI theme.
 *
 * To change a clip colour for a theme, edit the matching block below.
 * Every role consumed by a clip component is declared in
 * CLIP_PALETTE_TOKEN_KEYS and must be supplied by every palette below. The
 * old --color-video-clip / --color-audio-clip / --color-text-clip aliases are
 * intentionally not palette entries; they are runtime aliases only.
 */
export const CLIP_PALETTES: Record<ClipPalette, ClipPaletteTokens> = {
  /** Dark — graphite navy video, deep green audio */
  dark: {
    "--color-timeline-clip-video": "#1f4f57",
    "--color-timeline-clip-video-border": "rgba(90, 184, 200, 0.46)",
    "--color-timeline-clip-invalid": "#e26061",
    "--color-timeline-clip-audio": "#0c3336",
    "--color-timeline-clip-audio-border": "rgba(79, 189, 138, 0.48)",
    "--color-timeline-clip-text": "#e1eef1",
    "--color-timeline-clip-duration": "#b8d2da",
    "--color-timeline-filmstrip-bg": "rgba(14, 39, 48, 0.42)",
    "--color-timeline-filmstrip-empty": "rgba(14, 39, 48, 0.62)",
    "--color-timeline-filmstrip-border": "rgba(0, 0, 0, 0.2)",
    "--color-timeline-clip-image": "#173745",
    "--color-timeline-clip-caption": "#5b3b2e",
    "--color-timeline-clip-title": "#173745",
    "--color-timeline-clip-effect": "#5b3b2e",
    "--color-timeline-clip-compound": "#173745",
    "--color-timeline-clip-sticker": "#5b3b2e",
    "--color-timeline-clip-fg": "#f7e7df",
    "--color-timeline-clip-muted-fg": "#b8d2da",
    "--color-timeline-clip-audio-wave": "#4cc3c9",
    "--color-timeline-clip-envelope-fill": "rgba(14, 39, 48, 0.95)",
    "--color-timeline-clip-envelope-line": "rgba(184, 210, 218, 0.72)",
    "--color-timeline-filmstrip-overlay": "rgba(0, 0, 0, 0.10)",
    "--color-timeline-filmstrip-overlay-soft": "rgba(0, 0, 0, 0.08)",
    "--color-timeline-clip-badge-bg": "rgba(0, 0, 0, 0.30)",
    "--color-timeline-clip-metadata-bg": "#1f4f57",
    "--color-timeline-clip-metadata-border": "rgba(90, 184, 200, 0.46)",
    "--color-timeline-clip-waveform-bg": "#2a6a73",
    "--color-timeline-clip-waveform-border": "rgba(79, 189, 138, 0.48)",
    "--color-timeline-clip-control-bg": "#f7e7df",
    "--color-timeline-clip-control-border": "#173745",
    "--color-timeline-clip-control-shadow": "0 1px 3px rgba(0, 0, 0, 0.75)",
    "--color-timeline-clip-keyframe-bg": "#287a5c",
    "--color-timeline-clip-keyframe-border": "#f7e7df",
    "--color-timeline-clip-keyframe-shadow": "0 1px 3px rgba(0, 0, 0, 0.55)",
    "--color-timeline-clip-volume-line": "#f7e7df",
    "--color-timeline-clip-volume-shadow": "0 0 3px rgba(247, 231, 223, 0.35)",
    "--color-timeline-clip-tooltip-bg": "rgba(14, 39, 48, 0.62)",
    "--color-timeline-clip-tooltip-border": "rgba(79, 189, 138, 0.48)",
    "--color-timeline-clip-tooltip-text": "#b8d2da",
    "--color-timeline-clip-drag-shadow": "0 8px 32px rgba(0, 0, 0, 0.60)",
    "--color-timeline-clip-drag-border": "rgba(247, 231, 223, 0.20)",
  },

  /** Light — sky blue video, mint audio */
  light: {
    "--color-timeline-clip-video": "#b3d9ed",
    "--color-timeline-clip-video-border": "rgba(42, 125, 153, 0.5)",
    "--color-timeline-clip-invalid": "#dc2626",
    "--color-timeline-clip-audio": "#b3e8d0",
    "--color-timeline-clip-audio-border": "rgba(42, 170, 120, 0.5)",
    "--color-timeline-clip-text": "#111827",
    "--color-timeline-clip-duration": "#2a7d99",
    "--color-timeline-filmstrip-bg": "rgba(176, 188, 200, 0.42)",
    "--color-timeline-filmstrip-empty": "rgba(176, 188, 200, 0.62)",
    "--color-timeline-filmstrip-border": "rgba(0, 0, 0, 0.1)",
    "--color-timeline-clip-image": "#b3d9ed",
    "--color-timeline-clip-caption": "#dfc3b0",
    "--color-timeline-clip-title": "#b3d9ed",
    "--color-timeline-clip-effect": "#dfc3b0",
    "--color-timeline-clip-compound": "#b3d9ed",
    "--color-timeline-clip-sticker": "#dfc3b0",
    "--color-timeline-clip-fg": "#111827",
    "--color-timeline-clip-muted-fg": "#2a7d99",
    "--color-timeline-clip-audio-wave": "#059669",
    "--color-timeline-clip-envelope-fill": "rgba(176, 188, 200, 0.95)",
    "--color-timeline-clip-envelope-line": "rgba(42, 125, 153, 0.72)",
    "--color-timeline-filmstrip-overlay": "rgba(0, 0, 0, 0.05)",
    "--color-timeline-filmstrip-overlay-soft": "rgba(0, 0, 0, 0.04)",
    "--color-timeline-clip-badge-bg": "rgba(0, 0, 0, 0.12)",
    "--color-timeline-clip-metadata-bg": "rgba(176, 188, 200, 0.42)",
    "--color-timeline-clip-metadata-border": "rgba(42, 125, 153, 0.5)",
    "--color-timeline-clip-waveform-bg": "rgba(42, 170, 120, 0.15)",
    "--color-timeline-clip-waveform-border": "rgba(42, 170, 120, 0.5)",
    "--color-timeline-clip-control-bg": "#111827",
    "--color-timeline-clip-control-border": "#b3d9ed",
    "--color-timeline-clip-control-shadow": "0 1px 3px rgba(0, 0, 0, 0.25)",
    "--color-timeline-clip-keyframe-bg": "#059669",
    "--color-timeline-clip-keyframe-border": "#111827",
    "--color-timeline-clip-keyframe-shadow": "0 1px 3px rgba(0, 0, 0, 0.20)",
    "--color-timeline-clip-volume-line": "#111827",
    "--color-timeline-clip-volume-shadow": "0 0 3px rgba(17, 24, 39, 0.20)",
    "--color-timeline-clip-tooltip-bg": "rgba(176, 188, 200, 0.92)",
    "--color-timeline-clip-tooltip-border": "rgba(42, 170, 120, 0.5)",
    "--color-timeline-clip-tooltip-text": "#2a7d99",
    "--color-timeline-clip-drag-shadow": "0 8px 32px rgba(0, 0, 0, 0.20)",
    "--color-timeline-clip-drag-border": "rgba(17, 24, 39, 0.12)",
  },
};

export const CLIP_PALETTE_META: Record<
  ClipPalette,
  { name: string; description: string }
> = {
  dark: { name: "Dark", description: "Teal video and green audio" },
  light: { name: "Light", description: "Sky blue video and mint audio" },
};

/** Human-readable metadata for each theme (used by SettingsModal) */
export const THEME_META: Record<Theme, { name: string; description: string }> =
  {
    dark: { name: "Dark", description: "Classic dark mode" },
    light: { name: "Light", description: "Clean light mode" },
    custom: { name: "Custom", description: "Your custom theme" },
  };

/** Returns the raw theme color tokens for a given theme (for live previews) */
export function getThemeColors(
  t: Theme,
  customColors?: Record<string, string> | null,
  clipPalette: ClipPalette = t === "custom" ? "dark" : (t as ClipPalette),
): Record<string, string> {
  const uiColors =
    t === "custom" && customColors
      ? withoutClipTokens(customColors)
      : UI_THEMES[t === "custom" ? "dark" : t] || UI_THEMES.dark;
  return { ...uiColors, ...(CLIP_PALETTES[clipPalette] || CLIP_PALETTES.dark) };
}

export function getClipPaletteColors(
  palette: ClipPalette,
): Record<string, string> {
  return CLIP_PALETTES[palette] || CLIP_PALETTES.dark;
}

/** Get all color variable names exposed by the theme editor. */
export function getThemeColorKeys(): string[] {
  return Object.keys(UI_THEMES.dark);
}

/** Get a base theme to start customization from. */
export function getBaseThemeForCustomization(
  baseTheme: Exclude<Theme, "custom">,
): Record<string, string> {
  return { ...UI_THEMES[baseTheme] };
}

// Font family definitions
const fontFamilies: Record<FontFamily, string> = {
  inter: '"Inter Variable", sans-serif',
  montserrat: '"Montserrat Variable", sans-serif',
  geist: '"Geist Variable", sans-serif',
  outfit: '"Outfit Variable", sans-serif',
  roboto: '"Roboto Variable", sans-serif',
  "space-grotesk": '"Space Grotesk Variable", sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
};

export const FONT_META: Record<FontFamily, { name: string; stack: string }> = {
  inter: { name: "Inter", stack: fontFamilies.inter },
  montserrat: { name: "Montserrat", stack: fontFamilies.montserrat },
  geist: { name: "Geist", stack: fontFamilies.geist },
  outfit: { name: "Outfit", stack: fontFamilies.outfit },
  roboto: { name: "Roboto", stack: fontFamilies.roboto },
  "space-grotesk": {
    name: "Space Grotesk",
    stack: fontFamilies["space-grotesk"],
  },
  system: { name: "System", stack: fontFamilies.system },
  mono: { name: "Mono", stack: fontFamilies.mono },
};

export function applyTheme(
  theme: UiTheme | Theme,
  clipPalette: ClipPalette | Record<string, string> | null = "dark",
  customColors?: Record<string, string> | null,
) {
  const root = document.documentElement;
  const mode: "dark" | "light" = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", mode);
  // Accept the old applyTheme(theme, customColors) shape for external callers
  // while all internal callers use the explicit three-layer arguments.
  if (typeof clipPalette === "object") {
    customColors = clipPalette;
    clipPalette = "dark";
  }

  const uiTheme = theme === "custom" ? "dark" : theme;
  const uiColors =
    theme === "custom" && customColors
      ? withoutClipTokens(customColors)
      : UI_THEMES[uiTheme] || UI_THEMES.dark;
  const clipColors =
    CLIP_PALETTES[clipPalette as ClipPalette] || CLIP_PALETTES.dark;
  const themeColors = { ...uiColors, ...clipColors };

  Object.entries(themeColors).forEach(([property, value]) => {
    // Palette source names live in CLIP_PALETTES only. Runtime consumers use
    // the canonical --salvador-clip-* variables written by clipColorMap below.
    if (
      CLIP_PALETTE_TOKEN_KEYS.includes(
        property as (typeof CLIP_PALETTE_TOKEN_KEYS)[number],
      )
    ) {
      return;
    }

    const sourceProperty =
      SALVADOR_THEME_SOURCE_ALIASES[
        property as keyof typeof SALVADOR_THEME_SOURCE_ALIASES
      ];

    if (sourceProperty) {
      root.style.setProperty(sourceProperty, value);
      // Preserve the old public variable name as an alias. It is never a
      // second palette value and keeps older call sites compatible.
      root.style.setProperty(property, `var(${sourceProperty})`);
      return;
    }

    root.style.setProperty(property, value);
  });

  // Promote the active palette's explicit clip roles into the canonical
  // runtime variables consumed by CSS and timeline components. This is the
  // only conversion from palette config names to runtime names.
  const clipColorMap: Array<[string, string]> = [
    ["--color-timeline-clip-video", "--salvador-clip-video-bg"],
    ["--color-timeline-clip-video-border", "--salvador-clip-video-border"],
    ["--color-timeline-clip-invalid", "--salvador-clip-invalid"],
    ["--color-timeline-clip-audio", "--salvador-clip-audio-bg"],
    ["--color-timeline-clip-audio-border", "--salvador-clip-audio-border"],
    ["--color-timeline-clip-image", "--salvador-clip-image-bg"],
    ["--color-timeline-clip-text", "--salvador-clip-text-bg"],
    ["--color-timeline-clip-caption", "--salvador-clip-caption-bg"],
    ["--color-timeline-clip-title", "--salvador-clip-title-bg"],
    ["--color-timeline-clip-effect", "--salvador-clip-effect-bg"],
    ["--color-timeline-clip-compound", "--salvador-clip-compound-bg"],
    ["--color-timeline-clip-sticker", "--salvador-clip-sticker-bg"],
    ["--color-timeline-clip-fg", "--salvador-clip-fg"],
    ["--color-timeline-clip-muted-fg", "--salvador-clip-muted-fg"],
    ["--color-timeline-clip-audio-wave", "--salvador-clip-audio-wave"],
    ["--color-timeline-clip-envelope-fill", "--salvador-clip-envelope-fill"],
    ["--color-timeline-clip-envelope-line", "--salvador-clip-envelope-line"],
    ["--color-timeline-clip-duration", "--salvador-clip-duration"],
    ["--color-timeline-filmstrip-bg", "--salvador-clip-filmstrip-bg"],
    ["--color-timeline-filmstrip-empty", "--salvador-clip-filmstrip-empty"],
    ["--color-timeline-filmstrip-border", "--salvador-clip-filmstrip-border"],
    ["--color-timeline-filmstrip-overlay", "--salvador-clip-filmstrip-overlay"],
    [
      "--color-timeline-filmstrip-overlay-soft",
      "--salvador-clip-filmstrip-overlay-soft",
    ],
    ["--color-timeline-clip-badge-bg", "--salvador-clip-badge-bg"],
    ["--color-timeline-clip-metadata-bg", "--salvador-clip-metadata-bg"],
    ["--color-timeline-clip-metadata-border", "--salvador-clip-metadata-border"],
    ["--color-timeline-clip-waveform-bg", "--salvador-clip-waveform-bg"],
    ["--color-timeline-clip-waveform-border", "--salvador-clip-waveform-border"],
    ["--color-timeline-clip-control-bg", "--salvador-clip-control-bg"],
    ["--color-timeline-clip-control-border", "--salvador-clip-control-border"],
    ["--color-timeline-clip-control-shadow", "--salvador-clip-control-shadow"],
    ["--color-timeline-clip-keyframe-bg", "--salvador-clip-keyframe-bg"],
    ["--color-timeline-clip-keyframe-border", "--salvador-clip-keyframe-border"],
    ["--color-timeline-clip-keyframe-shadow", "--salvador-clip-keyframe-shadow"],
    ["--color-timeline-clip-volume-line", "--salvador-clip-volume-line"],
    ["--color-timeline-clip-volume-shadow", "--salvador-clip-volume-shadow"],
    ["--color-timeline-clip-tooltip-bg", "--salvador-clip-tooltip-bg"],
    ["--color-timeline-clip-tooltip-border", "--salvador-clip-tooltip-border"],
    ["--color-timeline-clip-tooltip-text", "--salvador-clip-tooltip-text"],
    ["--color-timeline-clip-drag-shadow", "--salvador-clip-drag-shadow"],
    ["--color-timeline-clip-drag-border", "--salvador-clip-drag-border"],
  ];
  clipColorMap.forEach(([sourceVar, canonicalVar]) => {
    const value = clipColors[sourceVar as keyof typeof clipColors]?.trim();
    if (value) root.style.setProperty(canonicalVar, value);
  });

  // Remove any source-token styles left by an older runtime so there can
  // never be two live values for the same clip role.
  CLIP_PALETTE_TOKEN_KEYS.forEach((property) =>
    root.style.removeProperty(property),
  );

  // Keep legacy names available to older consumers (read-only aliases that
  // point back to the canonical vars so they stay in sync with the theme).
  Object.entries(SALVADOR_LEGACY_COLOR_ALIASES).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
  Object.entries(SALVADOR_SHADCN_COLOR_ALIASES).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

export function applyFontFamily(fontFamily: FontFamily) {
  const root = document.documentElement;
  const fontStack = fontFamilies[fontFamily] || fontFamilies.inter;
  root.style.setProperty("--font-sans", fontStack);
  root.style.fontFamily = fontStack;
  if (document.body) {
    document.body.style.fontFamily = fontStack;
  }
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.style.fontFamily = fontStack;
  }
}

export function getFontFamilyWebStack(fontFamily: FontFamily): string {
  switch (fontFamily) {
    case "inter":
      return "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "montserrat":
      return "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "geist":
      return "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "outfit":
      return "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "roboto":
      return "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "space-grotesk":
      return "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case "mono":
      return "'JetBrains Mono', 'Fira Code', Consolas, monospace";
    case "system":
    default:
      return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  }
}

/**
 * Extracts live theme colors from the editor's CSS custom properties
 * to synchronize with the mobile web hub page.
 */
export function extractEditorThemeColors(activeFontFamily?: FontFamily): Record<string, string> {
  const font =
    activeFontFamily ||
    (typeof localStorage !== "undefined"
      ? (JSON.parse(localStorage.getItem("salvador-settings") || "{}")?.state
          ?.fontFamily as FontFamily)
      : "inter") ||
    "inter";
  const webFontStack = getFontFamilyWebStack(font);

  if (typeof window === "undefined") {
    return {
      bg: "#0b0e12",
      card: "#12171d",
      cardInner: "#1a2028",
      border: "#27313b",
      accent: "#5ab8d4",
      accentHover: "#86cde0",
      text: "#edf2f4",
      textMuted: "#788991",
      success: "#4fbd8a",
      danger: "#e26061",
      fontFamily: webFontStack,
      fontFamilyName: font,
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const getProp = (keys: string[], fallback: string) => {
    for (const k of keys) {
      const v = cs.getPropertyValue(k).trim();
      if (v) return v;
    }
    return fallback;
  };
  return {
    bg: getProp(["--salvador-theme-bg", "--color-bg", "--background"], "#0b0e12"),
    card: getProp(["--salvador-theme-surface", "--color-surface", "--card"], "#12171d"),
    cardInner: getProp(["--salvador-theme-surface-raised", "--color-surface-raised"], "#1a2028"),
    border: getProp(["--salvador-theme-border", "--color-border", "--border"], "#27313b"),
    accent: getProp(["--salvador-theme-accent", "--color-accent", "--primary"], "#5ab8d4"),
    accentHover: getProp(["--salvador-theme-accent-soft", "--color-accent-soft"], "#86cde0"),
    text: getProp(["--salvador-theme-text-primary", "--color-text-primary", "--foreground"], "#edf2f4"),
    textMuted: getProp(["--salvador-theme-text-muted", "--color-text-muted", "--muted-foreground"], "#788991"),
    success: getProp(["--salvador-status-success", "--color-snap-guide-clip"], "#4fbd8a"),
    danger: getProp(["--salvador-theme-danger", "--color-danger", "--destructive"], "#e26061"),
    fontFamily: webFontStack,
    fontFamilyName: font,
  };
}

/**
 * Pushes live editor theme colors to the background transfer service,
 * updating the mobile phone Web Hub page.
 */
export async function syncThemeToTransferService(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const theme = extractEditorThemeColors();
    await invoke("update_transfer_theme", { theme });
  } catch (_err) {
    // transfer service might not be running yet, which is expected
  }
}
