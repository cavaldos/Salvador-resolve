import { describe, expect, it } from "vitest";
import {
  getFitSequencePixelsPerSecond,
  getScrollLeftToRevealTime,
  getTimelineLaneContentX,
  timelinePixelToTime,
  timelineTimeToPixel,
  TIMELINE_CLIP_START_OFFSET_PX,
  TIMELINE_TRACK_LABEL_WIDTH_PX,
} from "../timelineViewport";

// Container widths are expressed relative to the label column so the lane
// itself stays 1000px wide regardless of the header width.
const CONTAINER_WIDTH = 1000 + TIMELINE_TRACK_LABEL_WIDTH_PX;

describe("timeline viewport editing helpers", () => {
  it("keeps the timeline origin inside the deliberate label gap", () => {
    expect(timelineTimeToPixel(0, 100)).toBe(20);
    expect(timelinePixelToTime(20, 100)).toBe(0);
    expect(getTimelineLaneContentX(TIMELINE_TRACK_LABEL_WIDTH_PX + TIMELINE_CLIP_START_OFFSET_PX, 0, 0, true)).toBe(0);
  });

  it("fits the full sequence into the lane after subtracting labels", () => {
    expect(getFitSequencePixelsPerSecond(CONTAINER_WIDTH, 100, true)).toBe(9.8);
    expect(getFitSequencePixelsPerSecond(CONTAINER_WIDTH, 10_000, true)).toBe(0.098);
  });

  it("clamps extremely long sequence fit to the supported overview floor", () => {
    expect(getFitSequencePixelsPerSecond(CONTAINER_WIDTH, 10_000_000, true)).toBeCloseTo(0.0001, 8);
  });

  it("keeps visible edit points still and reveals offscreen edit points", () => {
    expect(
      getScrollLeftToRevealTime({
        time: 7,
        currentScrollLeft: 500,
        containerWidth: CONTAINER_WIDTH,
        pixelsPerSecond: 100,
        viewportEndSeconds: 100,
        hasClips: true,
      }),
    ).toBe(500);

    expect(
      getScrollLeftToRevealTime({
        time: 50,
        currentScrollLeft: 0,
        containerWidth: CONTAINER_WIDTH,
        pixelsPerSecond: 100,
        viewportEndSeconds: 100,
        hasClips: true,
      }),
    ).toBe(4170);
  });
});
