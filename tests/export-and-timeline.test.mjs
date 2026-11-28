import assert from "node:assert/strict";
import test from "node:test";
import { getExportDimensions, parseExportBitrate } from "../src/modules/editor/features/export/services/export-settings.ts";
import { deleteClipsFromTracks, getTimelineGapBefore } from "../src/modules/editor/utils/timeline-utils.ts";
import { acceptsTimelineInsert } from "../src/modules/editor/features/timeline/utils/timeline-insert-drag.ts";
import { timelineTimeFromPosition } from "../src/modules/editor/features/timeline/utils/ruler-utils.ts";

const dimensions = (width, height, preset) => getExportDimensions({ settings: { width, height } }, preset);

test("export presets preserve orientation and fit wide canvases inside 4K", () => {
  assert.deepEqual(dimensions(1920, 1080, "480p"), { width: 854, height: 480 });
  assert.deepEqual(dimensions(1080, 1920, "1440p"), { width: 1440, height: 2560 });
  assert.deepEqual(dimensions(2520, 1080, "4K"), { width: 3840, height: 1646 });
});

test("manual export bitrate is validated and converted to bits per second", () => {
  assert.equal(parseExportBitrate("7.25"), 7_250_000);
  assert.equal(parseExportBitrate(""), undefined);
  assert.equal(parseExportBitrate("NaN"), undefined);
  assert.equal(parseExportBitrate("0.09"), undefined);
  assert.equal(parseExportBitrate("201"), undefined);
});

const clip = (id, timelineStart, timelineDuration) => ({ id, timelineStart, timelineDuration });

test("ripple delete closes removed sections on affected tracks, retaining unrelated gaps and locked clips", () => {
  const tracks = [
    { clips: [clip("a", 0, 2), clip("b", 2, 3), clip("c", 6, 1), clip("d", 7, 2)] },
    { locked: true, clips: [clip("locked", 0, 2)] },
    { clips: [clip("other", 5, 4)] },
  ];
  const result = deleteClipsFromTracks(tracks, ["b", "c", "locked"], true);
  assert.deepEqual(result[0].clips, [clip("a", 0, 2), clip("d", 3, 2)]);
  assert.equal(result[1], tracks[1]);
  assert.equal(result[2], tracks[2]);
  assert.equal(getTimelineGapBefore(result[0], result[0].clips[1]), 1);
});

test("timeline pointer seeking clamps to the project and snaps to frames", () => {
  assert.equal(timelineTimeFromPosition(-20, 50, 10, 30), 0);
  assert.equal(timelineTimeFromPosition(63, 50, 10, 30), 38 / 30);
  assert.equal(timelineTimeFromPosition(1000, 50, 10, 30), 10);
});

test("timeline drops respect track types and locks", () => {
  assert.equal(acceptsTimelineInsert({ type: "overlay" }, "image"), true);
  assert.equal(acceptsTimelineInsert({ type: "video" }, "audio"), false);
  assert.equal(acceptsTimelineInsert({ type: "audio", locked: true }, "audio"), false);
});
