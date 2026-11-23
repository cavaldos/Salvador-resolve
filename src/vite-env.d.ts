/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Native wgpu surface preview is enabled by default.
   * Set to "0" to force WebView IPC bridge mode (EMBEDDED_PREVIEW_ONLY=true).
   * See src/lib/platform/nativeCore.ts.
   *
   * Usage:
   *   VITE_SALVADOR_NATIVE_SURFACE=0 pnpm tauri dev (force bridge)
   */
  readonly VITE_SALVADOR_NATIVE_SURFACE?: "0" | "1";
  readonly VITE_SALVADOR_EMBEDDED_PREVIEW_ONLY?: "1";

  /** Salvador API key for backend requests. */
  readonly VITE_SALVADOR_API_KEY?: string;

  /** Optional body segmentation runtime override (mediapipe | onnx | heuristic). */
  readonly VITE_SALVADOR_BODY_SEGMENTATION_RUNTIME?: string;
  readonly VITE_SALVADOR_BODY_SEGMENTATION_RUNTIME_SCRIPT_URL?: string;
  readonly VITE_SALVADOR_BODY_SEGMENTATION_MODEL_URL?: string;
  readonly VITE_SALVADOR_BODY_SEGMENTATION_WASM_BASE_URL?: string;

  /** Enable the native preview push bridge (experimental). Set to "1". */
  readonly VITE_SALVADOR_PREVIEW_PUSH_BRIDGE?: "1";

  /** Detached native preview window (dev harness only, not for Tauri runtime). */
  readonly VITE_SALVADOR_NATIVE_PREVIEW_ONLY?: "1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
