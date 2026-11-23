/**
 * Canonical semantic color references for code that needs to coordinate with
 * the CSS design system. Theme palettes are applied by settingsStore; UI and
 * canvas-adjacent code should consume these roles instead of inventing a new
 * color locally.
 */
export const SALVADOR_COLOR_TOKENS = {
  surface: {
    app: "var(--salvador-surface-app)",
    workspace: "var(--salvador-surface-workspace)",
    panel: "var(--salvador-surface-panel)",
    elevated: "var(--salvador-surface-elevated)",
    floating: "var(--salvador-surface-floating)",
    input: "var(--salvador-surface-input)",
  },
  text: {
    primary: "var(--salvador-text-primary)",
    secondary: "var(--salvador-text-secondary)",
    tertiary: "var(--salvador-text-tertiary)",
    disabled: "var(--salvador-text-disabled)",
  },
  border: {
    subtle: "var(--salvador-border-subtle)",
    default: "var(--salvador-border-default)",
    strong: "var(--salvador-border-strong)",
  },
  interaction: {
    hover: "var(--salvador-interaction-hover)",
    active: "var(--salvador-interaction-active)",
    selected: "var(--salvador-interaction-selected)",
    focus: "var(--salvador-interaction-focus)",
  },
  status: {
    success: "var(--salvador-status-success)",
    warning: "var(--salvador-status-warning)",
    error: "var(--salvador-status-error)",
    info: "var(--salvador-status-info)",
  },
  editor: {
    playhead: "var(--salvador-editor-playhead)",
    selection: "var(--salvador-editor-selection)",
    snap: "var(--salvador-editor-snap)",
    drop: "var(--salvador-editor-drop)",
  },
  clip: {
    video: "var(--salvador-clip-video-bg)",
    audio: "var(--salvador-clip-audio-bg)",
    image: "var(--salvador-clip-image-bg)",
    text: "var(--salvador-clip-text-bg)",
    effect: "var(--salvador-clip-effect-bg)",
    compound: "var(--salvador-clip-compound-bg)",
    sticker: "var(--salvador-clip-sticker-bg)",
    foreground: "var(--salvador-clip-fg)",
    audioWave: "var(--salvador-clip-audio-wave)",
  },
} as const;

/**
 * The only bridge from persisted/theme-editor names to the runtime palette.
 * Keeping this map here prevents CSS, React, and the theme editor from each
 * creating a different interpretation of the same color.
 */
export const SALVADOR_THEME_SOURCE_ALIASES = {
  "--color-bg": "--salvador-theme-bg",
  "--color-surface": "--salvador-theme-surface",
  "--color-surface-raised": "--salvador-theme-surface-raised",
  "--color-surface-panel": "--salvador-theme-surface-panel",
  "--color-surface-floating": "--salvador-theme-surface-floating",
  "--color-border": "--salvador-theme-border",
  "--color-border-soft": "--salvador-theme-border-soft",
  "--color-accent": "--salvador-theme-accent",
  "--color-accent-soft": "--salvador-theme-accent-soft",
  "--color-text-primary": "--salvador-theme-text-primary",
  "--color-text-muted": "--salvador-theme-text-muted",
  "--color-danger": "--salvador-theme-danger",
} as const;

/** Legacy clip names resolve to the active canonical clip palette. */
export const SALVADOR_LEGACY_COLOR_ALIASES = {
  "--color-video-clip": "var(--salvador-clip-video-bg)",
  "--color-audio-clip": "var(--salvador-clip-audio-bg)",
  "--color-text-clip": "var(--salvador-clip-text-bg)",
} as const;

/** shadcn compatibility names are aliases into the same semantic roles. */
export const SALVADOR_SHADCN_COLOR_ALIASES = {
  "--background": "var(--salvador-surface-app)",
  "--foreground": "var(--salvador-text-primary)",
  "--card": "var(--salvador-surface-panel)",
  "--card-foreground": "var(--salvador-text-primary)",
  "--popover": "var(--salvador-surface-floating)",
  "--popover-foreground": "var(--salvador-text-primary)",
  "--primary": "var(--salvador-interaction-focus)",
  "--primary-foreground": "var(--salvador-surface-app)",
  "--secondary": "var(--salvador-surface-elevated)",
  "--secondary-foreground": "var(--salvador-text-primary)",
  "--muted": "var(--salvador-surface-elevated)",
  "--muted-foreground": "var(--salvador-text-secondary)",
  "--accent": "var(--salvador-interaction-focus)",
  "--accent-foreground": "var(--salvador-surface-app)",
  "--destructive": "var(--salvador-status-error)",
  "--destructive-foreground": "var(--salvador-text-primary)",
  "--border": "var(--salvador-border-default)",
  "--input": "var(--salvador-surface-input)",
  "--ring": "var(--salvador-interaction-focus)",
} as const;

/** Backwards-compatible semantic names for older consumers. */
export const COLORS = {
  BG: SALVADOR_COLOR_TOKENS.surface.app,
  RAIL: SALVADOR_COLOR_TOKENS.surface.panel,
  BORDER: SALVADOR_COLOR_TOKENS.border.default,
  ACCENT: SALVADOR_COLOR_TOKENS.interaction.focus,
  TEXT_ORANGE: SALVADOR_COLOR_TOKENS.status.warning,
  VIDEO_TEAL: SALVADOR_COLOR_TOKENS.clip.video,
  WHITE: SALVADOR_COLOR_TOKENS.text.primary,
} as const;
