import assert from "node:assert/strict";
import test from "node:test";
import { saveDesktopExport } from "../src/modules/editor/features/export/services/desktop-export-save.ts";

function mockInvoke(t, invoke) {
  globalThis.window = { __TAURI_INTERNALS__: { invoke } };
  t.after(() => delete globalThis.window);
}

test("a canceled native picker does not send any export bytes", async (t) => {
  mockInvoke(t, async (cmd, args) => {
    assert.equal(cmd, "begin_export_save");
    assert.deepEqual(args, { name: "test.webm", size: 3 });
    return null;
  });
  assert.equal(await saveDesktopExport(new Blob(["123"]), "test.webm"), null);
});

test("a large export sends ordered binary chunks, then commits the same job", async (t) => {
  const firstChunk = new Uint8Array(1024 * 1024).fill(3);
  const lastChunk = new Uint8Array([5, 8]);
  const expected = [firstChunk, lastChunk];
  mockInvoke(t, async (cmd, args, options) => {
    if (cmd === "begin_export_save") {
      assert.deepEqual(args, { name: "test.mp4", size: 1024 * 1024 + 2 });
      return "job";
    }
    if (cmd === "write_export_chunk") {
      assert.equal(options.headers["cutnora-export-id"], "job");
      assert.deepEqual(new Uint8Array(args), expected.shift());
      return;
    }
    assert.equal(cmd, "finish_export_save");
    assert.deepEqual(args, { id: "job" });
    assert.equal(expected.length, 0);
    return "remuxed";
  });
  assert.equal(
    await saveDesktopExport(new Blob([firstChunk, lastChunk]), "test.mp4"),
    "remuxed",
  );
});

test("a rejected write aborts its job without committing it", async (t) => {
  const calls = [];
  mockInvoke(t, async (cmd, args) => {
    calls.push(cmd);
    if (cmd === "begin_export_save") return "job";
    if (cmd === "write_export_chunk") throw new Error("Disk is full");
    assert.deepEqual(args, { id: "job" });
  });
  await assert.rejects(
    saveDesktopExport(new Blob(["123"]), "test.webm"),
    /Disk is full/,
  );
  assert.deepEqual(calls, [
    "begin_export_save",
    "write_export_chunk",
    "abort_export_save",
  ]);
});
