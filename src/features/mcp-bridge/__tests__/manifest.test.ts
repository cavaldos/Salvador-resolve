import { describe, it, expect } from "vitest";
import { EDITOR_TOOLS, DEFAULT_PERMISSIONS, LONG_RUNNING_TOOLS } from "@/features/ai-agent/tools";
import { resolvePermission } from "@salvador/agent";
import { buildManifest, permissionsForPolicy, toMcpResult, toolsForPolicy } from "../manifest";
import { buildClientSnippets, mcpUrl } from "../clientConfigs";

const askDefaults = { ...DEFAULT_PERMISSIONS.tools } as Record<string, "ask">;

describe("buildManifest", () => {
  it("exposes every editor tool with an object input schema and no $schema key", () => {
    const m = buildManifest(EDITOR_TOOLS, "ask", LONG_RUNNING_TOOLS);
    expect(m.map((t) => t.name)).toEqual(EDITOR_TOOLS.map((t) => t.name));
    for (const t of m) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema).not.toHaveProperty("$schema");
      expect(t.description.length).toBeGreaterThan(0);
    }
    const trim = m.find((t) => t.name === "trim_clip")!;
    expect((trim.inputSchema.required as string[])).toContain("clipId");
  });

  it("flags read-only and long-running tools", () => {
    const m = buildManifest(EDITOR_TOOLS, "ask", LONG_RUNNING_TOOLS);
    expect(m.find((t) => t.name === "list_clips")).toMatchObject({ readOnly: true, longRunning: false });
    expect(m.find((t) => t.name === "start_export")).toMatchObject({ readOnly: false, longRunning: true });
    expect(m.find((t) => t.name === "add_captions")!.longRunning).toBe(true);
  });

  it("read-only policy lists inspect tools only", () => {
    const names = buildManifest(EDITOR_TOOLS, "readonly", LONG_RUNNING_TOOLS).map((t) => t.name);
    expect(names).toContain("list_clips");
    expect(names).not.toContain("delete_clip");
    expect(names).not.toContain("start_export");
    expect(toolsForPolicy(EDITOR_TOOLS, "readonly").every((t) => t.kind === "inspect")).toBe(true);
  });
});

describe("permissionsForPolicy", () => {
  it("ask keeps the in-app agent's ask list; allow never asks; readonly denies mutations", () => {
    const askP = permissionsForPolicy("ask", askDefaults);
    expect(resolvePermission("delete_clip", "edit", askP)).toBe("ask");
    expect(resolvePermission("start_export", "output", askP)).toBe("ask");
    expect(resolvePermission("split_clip", "edit", askP)).toBe("allow");

    const allowP = permissionsForPolicy("allow", askDefaults);
    for (const name of Object.keys(askDefaults)) expect(resolvePermission(name, "edit", allowP)).toBe("allow");
    // resolvePermission has a built-in ask list (e.g. start_export) — "allow" must override it.
    expect(resolvePermission("start_export", "output", allowP)).toBe("allow");

    const ro = permissionsForPolicy("readonly", askDefaults);
    expect(resolvePermission("split_clip", "edit", ro)).toBe("deny");
    expect(resolvePermission("list_clips", "inspect", ro)).toBe("allow");
  });
});

describe("toMcpResult", () => {
  it("maps success with object data to text + structuredContent", () => {
    const r = toMcpResult({ ok: true, result: { summary: "split", data: { leftClipId: "a" } } });
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toBe('split\n{"leftClipId":"a"}');
    expect(r.structuredContent).toEqual({ leftClipId: "a" });
  });

  it("keeps array data in text only (structuredContent must be an object)", () => {
    const r = toMcpResult({ ok: true, result: { summary: "2 clips", data: [{ id: "c1" }] } });
    expect(r.structuredContent).toBeUndefined();
    expect(r.content[0].text).toContain('[{"id":"c1"}]');
  });

  it("maps failures to isError", () => {
    expect(toMcpResult({ ok: false, error: "denied by user: delete_clip", denied: true })).toEqual({
      content: [{ type: "text", text: "denied by user: delete_clip" }],
      isError: true,
    });
  });

  it("truncates huge payloads", () => {
    const r = toMcpResult({ ok: true, result: { summary: "big", data: { s: "x".repeat(200_000) } } });
    expect(r.content[0].text.length).toBeLessThan(100_100);
    expect(r.content[0].text.endsWith("…(truncated)")).toBe(true);
  });
});

describe("buildClientSnippets", () => {
  const snippets = buildClientSnippets(47822, "tok123");

  it("fills in the live port and token for every client", () => {
    expect(mcpUrl(47822)).toBe("http://127.0.0.1:47822/mcp");
    for (const s of snippets) {
      expect(s.code).toContain("http://127.0.0.1:47822/mcp");
      expect(s.code).toContain("tok123");
    }
    expect(snippets.map((s) => s.id)).toEqual(["claude-code", "cursor", "vscode", "codex", "gemini", "stdio"]);
  });

  it("JSON snippets are valid JSON with a bearer header", () => {
    for (const s of snippets.filter((x) => x.language === "json")) {
      const parsed = JSON.parse(s.code);
      expect(JSON.stringify(parsed)).toContain("Bearer tok123");
    }
    const vscode = JSON.parse(snippets.find((s) => s.id === "vscode")!.code);
    expect(vscode.servers.salvador.type).toBe("http");
  });
});
