import { describe, it, expect, vi } from "vitest";
import { defineTool, zod as z, type ToolDefinition } from "@salvador/tools";
import { executeEditorTool } from "../runTool";

const execSpy = vi.fn(async (a: { n: number }) => ({ summary: `ran ${a.n}`, data: { n: a.n } }));
const tools = [
  defineTool({ name: "look", description: "", kind: "inspect", input: z.object({}), execute: async () => ({ summary: "ok" }) }),
  defineTool({ name: "risky", description: "", kind: "edit", input: z.object({ n: z.number() }), execute: execSpy }),
  defineTool({ name: "boom", description: "", kind: "edit", input: z.object({}), execute: async () => { throw new Error("kaput"); } }),
] as unknown as ToolDefinition[];
const ask = { default: "allow" as const, tools: { risky: "ask" as const } };

describe("executeEditorTool", () => {
  it("rejects unknown tools", async () => {
    expect(await executeEditorTool(tools, "nope", {})).toEqual({ ok: false, error: "unknown tool nope" });
  });

  it("validates input BEFORE asking for approval", async () => {
    const approve = vi.fn(async () => true);
    const r = await executeEditorTool(tools, "risky", { n: "x" }, { permissions: ask, approve });
    expect(r.ok).toBe(false);
    expect(approve).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("ask + denied (or no approver) never executes", async () => {
    execSpy.mockClear();
    const denied = await executeEditorTool(tools, "risky", { n: 1 }, { permissions: ask, approve: async () => false });
    expect(denied).toMatchObject({ ok: false, denied: true });
    const noApprover = await executeEditorTool(tools, "risky", { n: 1 }, { permissions: ask });
    expect(noApprover).toMatchObject({ ok: false, denied: true });
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("ask + approved executes with parsed args", async () => {
    const approve = vi.fn(async () => true);
    const r = await executeEditorTool(tools, "risky", { n: 2 }, { permissions: ask, approve });
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ name: "risky" }), { n: 2 });
    expect(r).toEqual({ ok: true, result: { summary: "ran 2", data: { n: 2 } } });
  });

  it("deny policy blocks non-inspect tools but inspect stays allowed", async () => {
    expect(await executeEditorTool(tools, "risky", { n: 1 }, { permissions: { default: "deny" } })).toMatchObject({ ok: false, denied: true });
    expect(await executeEditorTool(tools, "look", {}, { permissions: { default: "deny" } })).toMatchObject({ ok: true });
  });

  it("turns thrown errors into a failed outcome", async () => {
    expect(await executeEditorTool(tools, "boom", {})).toEqual({ ok: false, error: "kaput" });
  });
});
