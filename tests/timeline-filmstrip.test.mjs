import assert from "node:assert/strict";
import test from "node:test";
import { getFilmstripFrameIndex, getFilmstripSampleTimes } from "../src/modules/editor/features/timeline/utils/timeline-filmstrip.ts";

test("filmstrip samples the trimmed source range without seeking to the exact end", () => {
  assert.deepEqual(getFilmstripSampleTimes(10, 18, 4), [11, 13, 15, 17]);
  assert.deepEqual(getFilmstripSampleTimes(0, 0.5, 1), [0.25]);
});

test("thumbnail tiles map to the nearest sampled segment as zoom changes", () => {
  assert.deepEqual([0, 1, 2].map((tile) => getFilmstripFrameIndex(tile, 3, 4)), [0, 2, 3]);
  assert.equal(getFilmstripFrameIndex(0, 1, 0), -1);
});
