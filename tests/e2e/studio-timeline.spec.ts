import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./mocks/tauriMock";

const SHOTS = process.env.STUDIO_SHOTS_DIR;

async function openEditorWithClips(page: Page) {
  await installTauriMock(page, { recentProjects: [], defaultMediaDuration: 80 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.locator('[data-testid="program-preview-canvas"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(async () => {
    const { useProjectStore } = await import("/src/store/projectStore.ts");
    const s = useProjectStore.getState();
    return Boolean(s.project && !s.projectInitialization);
  }, undefined, { timeout: 15_000 });
  await page.evaluate(async () => {
    const { useTimelineStore } = await import("/src/store/timelineStore.ts");
    const { useProjectStore } = await import("/src/store/projectStore.ts");
    useProjectStore.getState().addMediaAsset({
      id: "asset-a",
      name: "sample_clip.mp4",
      path: "/mock/media/sample_clip.mp4",
      type: "video",
      duration: 79.6,
      size: 1024 * 1024,
      audioChannels: 2,
      hasAudio: true,
      streams: [
        { type: "video", codec: "h264", width: 1920, height: 1080 },
        { type: "audio", codec: "aac", channels: 2, sampleRate: 48000 },
      ],
    } as any);
    const tl = useTimelineStore.getState();
    const trackId = tl.ensureTrackForType("video", "asset-a");
    tl.addClip({
      id: "clip-main", kind: "video", trackId, mediaId: "asset-a",
      startTime: 0, duration: 79.6, trimIn: 0, trimOut: 79.6,
      x: 0, y: 0, width: 1920, height: 1080, opacity: 1, rotation: 0, aspectRatioLocked: true,
    } as any);
    const overlayTrack = useTimelineStore.getState().addTrack("video");
    useTimelineStore.getState().addClip({
      id: "clip-overlay", kind: "video", trackId: overlayTrack, mediaId: "asset-a",
      startTime: 15, duration: 60, trimIn: 0, trimOut: 60,
      x: 0, y: 0, width: 1920, height: 1080, opacity: 1, rotation: 0, aspectRatioLocked: true,
    } as any);
  });
}

test.describe("Studio timeline", () => {
  test("renders a clip with the CapCut-style timeline chrome", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
    await openEditorWithClips(page);
    await page.waitForTimeout(1500);
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/studio-timeline.png` });
      // boundingBox() auto-waits for the element, so only ask when it exists.
      const rootLocator = page.locator('[data-studio-timeline="true"], [data-timeline-root="true"]').first();
      const box = (await rootLocator.count()) > 0 ? await rootLocator.boundingBox() : null;
      if (box) await page.screenshot({ path: `${SHOTS}/studio-timeline-crop.png`, clip: box });
    }
    // The store may assign its own ids, so resolve the main-track clip (t=0) from the store.
    const mainId = await page.evaluate(async () => {
      const { useTimelineStore } = await import("/src/store/timelineStore.ts");
      return useTimelineStore.getState().clips.find((c: any) => c.startTime === 0)!.id as string;
    });
    const mainClip = page.locator(`[data-clip-id="${mainId}"]`);
    await expect(mainClip).toBeVisible();
    await expect(mainClip.getByText("sample_clip.mp4")).toBeVisible();
    await expect(mainClip.getByTestId("clip-duration-chip")).toHaveText("00:01:19:18");
    await expect(page.getByTestId("track-cover-tile")).toBeVisible();

    // Toolbar buttons exist by accessible name.
    const toolbar = page.getByTestId("timeline-toolbar");
    for (const name of [
      "Select", "Choose tool", "Undo (Cmd+Z)", "Redo (Cmd+Shift+Z)", "Split at playhead",
      "Delete left at playhead (Q)", "Delete right at playhead (W)", "Delete selected clip(s)",
      "Freeze frame", "Mirror (flip horizontal)", "Rotate 90°", "Crop", "More actions",
      "Record voiceover at playhead", "Main track magnet (ripple edit)", "Auto snapping",
      "Linkage (link video and audio)", "Fit sequence (Shift+Z)", "Zoom out timeline", "Zoom in timeline",
    ]) {
      await expect(toolbar.getByRole("button", { name, exact: true }), name).toBeVisible();
    }
    await expect(toolbar.getByRole("button", { name: "Mirror (flip horizontal)" })).toBeDisabled();

    // Mirror on a selected clip flips it; undo reverts it.
    const flipState = () => page.evaluate(async (id) => {
      const { useTimelineStore } = await import("/src/store/timelineStore.ts");
      return useTimelineStore.getState().clips.find((c: any) => c.id === id)!.width;
    }, mainId);
    expect(await flipState()).toBe(1920);
    await mainClip.click({ position: { x: 200, y: 20 } });
    await expect(mainClip).toHaveAttribute("data-clip-selected", "true");
    await page.screenshot({ path: `${SHOTS ?? "test-results"}/studio-timeline-selected.png` });
    await toolbar.getByRole("button", { name: "Mirror (flip horizontal)" }).click();
    expect(await flipState()).toBe(-1920);
    await toolbar.getByRole("button", { name: "Undo (Cmd+Z)" }).click();
    expect(await flipState()).toBe(1920);
    expect(errors.filter((e) => !e.includes("Native preview returned"))).toEqual([]);
  });
});
