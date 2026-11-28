import { isTauri } from "@tauri-apps/api/core";

export const macWindowHeaderProps =
  isTauri() && /\bMacintosh\b/.test(navigator.userAgent)
    ? {
        "data-tauri-drag-region": "deep",
        // Keep app controls clear of the native close, minimize and zoom buttons.
        style: { paddingLeft: 80 },
      }
    : undefined;
