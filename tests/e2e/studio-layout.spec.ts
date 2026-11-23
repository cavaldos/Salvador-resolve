import { test, expect } from "@playwright/test";
import { installTauriMock } from "./mocks/tauriMock";

const SHOTS = process.env.STUDIO_SHOTS_DIR;

test.describe("Studio (CapCut-style) layout", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page, { recentProjects: [], defaultMediaDuration: 12.0 });
  });

  test("renders resource tabs, player, details and timeline; AI tab opens agent panel", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();

    for (const label of ["Media", "Audio", "Text", "Stickers", "Effects", "Transitions", "Captions", "AI"]) {
      await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Player", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-editor.png` });

    await page.getByRole("button", { name: "AI", exact: true }).first().click();
    await page.waitForTimeout(500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-ai-tab.png` });
    // The browser Tauri mock cannot produce native preview frames.
    expect(errors.filter((e) => !e.includes("Native preview returned"))).toEqual([]);
  });
});

test.describe("Studio layout panel resizing", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page, { recentProjects: [], defaultMediaDuration: 12.0 });
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    await expect(page.getByTestId("studio-resizer-left")).toBeVisible();
  });

  const widthOf = (page: import("@playwright/test").Page, side: "left" | "right") =>
    page.locator(`[data-studio-panel="${side}"]`).evaluate((el) => el.getBoundingClientRect().width);

  async function drag(page: import("@playwright/test").Page, testId: string, dx: number) {
    const handle = page.getByTestId(testId);
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  }

  test("dragging the gutters resizes the side panels; the player keeps a minimum width", async ({ page }) => {
    const left0 = await widthOf(page, "left");
    const right0 = await widthOf(page, "right");

    await drag(page, "studio-resizer-left", -120);
    expect(await widthOf(page, "left")).toBeCloseTo(left0 - 120, -1);

    await drag(page, "studio-resizer-right", -100); // dragging left widens the right panel
    expect(await widthOf(page, "right")).toBeCloseTo(right0 + 100, -1);

    // Dragging far past the limit clamps the side panel; the player stays >= 360px.
    await drag(page, "studio-resizer-left", 2000);
    const playerW = await page.getByText("Player", { exact: true }).first()
      .evaluate((el) => el.closest("[style*='min-width']")!.getBoundingClientRect().width);
    expect(playerW).toBeGreaterThanOrEqual(359);

    // Dragging below the minimum clamps to the minimum.
    await drag(page, "studio-resizer-left", -3000);
    expect(await widthOf(page, "left")).toBeCloseTo(280, -1);
  });

  test("sizes persist across reloads and double-click resets to the default", async ({ page }) => {
    const left0 = await widthOf(page, "left");
    await drag(page, "studio-resizer-left", -150);
    const resized = await widthOf(page, "left");
    expect(resized).toBeLessThan(left0 - 100);

    await page.reload();
    // Reloading mid-session correctly offers crash recovery; start fresh instead.
    const discard = page.getByRole("button", { name: "Discard" });
    const recoveryShown = await discard
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (recoveryShown) await discard.click();
    await page.getByRole("button", { name: "New Project" }).click();
    await expect(page.getByTestId("studio-resizer-left")).toBeVisible();
    expect(await widthOf(page, "left")).toBeCloseTo(resized, -1);

    await page.getByTestId("studio-resizer-left").dblclick();
    expect(await widthOf(page, "left")).toBeCloseTo(left0, -1);
  });
});

test.describe("Studio layout resize keeps the native preview surface out of the way", () => {
  test("a panel drag holds the layout-resize overlay and releases it on mouse up", async ({ page }) => {
    await installTauriMock(page, { recentProjects: [], defaultMediaDuration: 12.0 });
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    const handle = page.getByTestId("studio-resizer-right");
    await expect(handle).toBeVisible();

    const overlays = () =>
      page.evaluate(async () => {
        const { useUIStore } = await import("/src/store/uiStore.ts");
        return useUIStore.getState().activeOverlayIds as string[];
      });

    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 5 });
    expect(await overlays()).toContain("layout-resize");

    await page.mouse.up();
    await expect.poll(overlays).not.toContain("layout-resize");
  });
});

