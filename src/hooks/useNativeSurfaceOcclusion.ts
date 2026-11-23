import { useEffect } from "react";
import { useUIStore } from "@/store/uiStore";

/**
 * Declare that a DOM layer (modal, full-screen dialog, popover) may cover the
 * program preview while `active` is true.
 *
 * The desktop preview is a native GPU child surface layered *above* the
 * WebView, so DOM z-index cannot put anything on top of it. Registering an
 * overlay in `uiStore` makes the preview hide the native surface and draw
 * through the DOM presenter instead; unregistering re-shows it. Every
 * full-screen dialog that does not use the shared `Modal` primitive must call
 * this, otherwise the video frame is painted over the dialog.
 *
 * `id` must be unique per overlay source; registering is idempotent.
 */
export function useNativeSurfaceOcclusion(active: boolean, id: string): void {
  const registerOverlay = useUIStore((s) => s.registerOverlay);
  const unregisterOverlay = useUIStore((s) => s.unregisterOverlay);

  useEffect(() => {
    if (!active) return;
    registerOverlay(id);
    return () => unregisterOverlay(id);
  }, [active, id, registerOverlay, unregisterOverlay]);
}
