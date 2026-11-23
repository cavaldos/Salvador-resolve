import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNativeSurfaceOcclusion } from "../useNativeSurfaceOcclusion";
import { useUIStore } from "@/store/uiStore";

const ids = () => useUIStore.getState().activeOverlayIds;

describe("useNativeSurfaceOcclusion", () => {
  beforeEach(() => useUIStore.setState({ activeOverlayIds: [] }));

  it("registers the overlay only while active and releases it when inactive", () => {
    const { rerender } = renderHook(({ active }) => useNativeSurfaceOcclusion(active, "dlg"), {
      initialProps: { active: false },
    });
    expect(ids()).toEqual([]);
    rerender({ active: true });
    expect(ids()).toEqual(["dlg"]);
    rerender({ active: false });
    expect(ids()).toEqual([]);
  });

  it("releases the overlay when the owning component unmounts while open", () => {
    const { unmount } = renderHook(() => useNativeSurfaceOcclusion(true, "dlg"));
    expect(ids()).toEqual(["dlg"]);
    unmount();
    expect(ids()).toEqual([]);
  });

  it("keeps other overlays registered", () => {
    useUIStore.setState({ activeOverlayIds: ["topbar-overlay"] });
    const { unmount } = renderHook(() => useNativeSurfaceOcclusion(true, "dlg"));
    expect(ids()).toEqual(["topbar-overlay", "dlg"]);
    unmount();
    expect(ids()).toEqual(["topbar-overlay"]);
  });
});
