/**
 * Architecture guard: the native GPU preview is a child surface layered above
 * the WebView, so any full-screen DOM layer must tell the preview to step aside
 * (shared `Modal`, `useNativeSurfaceOcclusion`, `registerOverlay`, or
 * `hideNativeSurfaceWhenIdle`). Otherwise the video is painted over the dialog
 * (regression: "Save changes before closing?" dialog covered by the preview).
 */
import { describe, it, expect } from "vitest";

// Raw sources of every component, keyed by "/src/...". Vite resolves this at
// transform time, so no Node fs types are needed in the app tsconfig.
const SOURCES = import.meta.glob<string>(
  ["/src/**/*.tsx", "!/src/**/__tests__/**"],
  { query: "?raw", import: "default", eager: true },
);

// Layers that can never be shown together with the editor's program preview.
const ALLOWED = new Set<string>([
  // Rendered only inside the Settings modal, which already occludes the surface.
  "src/components/settings/WhisperSettings.tsx",
]);

const PROTECTED = [
  /useNativeSurfaceOcclusion\(/,
  /registerOverlay\(/,
  /hideNativeSurfaceWhenIdle\(/,
  /from "@\/components\/ui\/primitives\/Modal"|from "\.\/Modal"|from "\.\.\/primitives\/Modal"/,
];


describe("native surface occlusion coverage", () => {
  it("every full-screen DOM layer occludes the native preview surface", () => {
    const files = Object.entries(SOURCES);
    expect(files.length).toBeGreaterThan(100); // the glob really scanned src/
    const offenders = files
      .filter(([, source]) => source.includes("fixed inset-0"))
      .map(([path, source]) => [path.replace(/^\//, ""), source] as const)
      .filter(([rel]) => rel !== "src/components/ui/primitives/Modal.tsx" && !ALLOWED.has(rel))
      .filter(([, source]) => !PROTECTED.some((re) => re.test(source)))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });
});
