/**
 * Regression: a native-surface configure that gets superseded by another
 * request used to end the sync loop without retrying. After a panel resize the
 * native GPU surface then stayed at the old rectangle (overlapping neighbouring
 * panels) until some unrelated resize happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const geometryQueue: Array<{ widthPhysical: number }> = [];
const configureCalls: number[] = [];
let configureImpl: (width: number) => Promise<unknown>;

vi.mock("@/lib/platform/tauri", () => ({
  isTauriRuntime: () => true,
  getNativeGpuStatus: vi.fn(async () => ({ state: "ready", available: true, surfaceAvailable: true })),
  listenForGpuReady: vi.fn(async () => () => undefined),
  listenForGpuFailed: vi.fn(async () => () => undefined),
  markGpuAwaited: vi.fn(async () => undefined),
  onNativePreviewWindowMoved: vi.fn(async () => () => undefined),
  getNativePreviewSurfaceGeometry: vi.fn(async () => {
    const next = geometryQueue.length > 1 ? geometryQueue.shift()! : geometryQueue[0];
    return { xPhysical: 0, yPhysical: 0, heightPhysical: 600, devicePixelRatio: 2, ...next };
  }),
}));

vi.mock("@/lib/platform/nativeCore", () => ({ EMBEDDED_PREVIEW_ONLY: false }));

vi.mock("@/core/runtime/nativeSurfaceLifecycle", () => ({
  claimNativeSurfaceReadiness: vi.fn(() => ({ token: 1 })),
  markNativeSurfaceReady: vi.fn(),
  failNativeSurfaceReadiness: vi.fn(),
  releaseNativeSurfaceReadiness: vi.fn(),
  releaseNativeSurface: vi.fn(async () => undefined),
  isNativeSurfaceRequestSuperseded: (e: unknown) =>
    e instanceof Error && e.message === "Native surface geometry request was superseded",
  configureNativeSurface: vi.fn(async (_projectId: string, geometry: { widthPhysical: number }) => {
    configureCalls.push(geometry.widthPhysical);
    return configureImpl(geometry.widthPhysical);
  }),
}));

vi.mock("@/core/runtime/AppLifecycleCoordinator", () => ({
  appLifecycleCoordinator: { onForegroundWakeup: () => () => undefined },
}));
vi.mock("@/core/playback/playbackTrace", () => ({ tracePlayback: vi.fn() }));

import {
  useNativeSurfaceController,
  MAX_SUPERSEDED_RETRIES,
} from "../useNativeSurfaceController";

const superseded = () => new Error("Native surface geometry request was superseded");
const fakeClock = { state: "paused", subscribe: () => () => undefined } as never;

function mountController() {
  const onSurfaceReady = vi.fn();
  const hook = renderHook(() =>
    useNativeSurfaceController({
      projectId: "project-1",
      clock: fakeClock,
      viewportReady: true,
      onSurfaceReady,
    }),
  );
  act(() => hook.result.current.targetCallback(document.createElement("div")));
  return { hook, onSurfaceReady };
}

describe("useNativeSurfaceController superseded configure", () => {
  beforeEach(() => {
    geometryQueue.length = 0;
    configureCalls.length = 0;
  });

  it("retries after being superseded and applies the latest geometry", async () => {
    // First measurement is the pre-resize width; by the retry the panel has
    // settled at its new width.
    geometryQueue.push({ widthPhysical: 1200 }, { widthPhysical: 900 });
    let calls = 0;
    configureImpl = async () => {
      calls += 1;
      if (calls === 1) throw superseded();
      return { ok: true };
    };

    const { hook, onSurfaceReady } = mountController();

    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(configureCalls).toEqual([1200, 900]);
    expect(onSurfaceReady).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBeNull();
  });

  it("gives up after a bounded number of consecutive supersessions without erroring", async () => {
    geometryQueue.push({ widthPhysical: 1000 });
    configureImpl = async () => {
      throw superseded();
    };

    const { hook } = mountController();

    await waitFor(() => expect(configureCalls.length).toBe(MAX_SUPERSEDED_RETRIES + 1));
    // Give any (incorrect) further retries a chance to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(configureCalls.length).toBe(MAX_SUPERSEDED_RETRIES + 1);
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });
});
