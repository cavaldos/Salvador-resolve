/**
 * Shared editor-tool executor: validate → permission → execute.
 *
 * Used by the MCP bridge so that external agents go through the same zod
 * validation and permission rules (`resolvePermission`) as the in-app agent.
 */
import { resolvePermission, type PermissionsConfig } from "@salvador/agent";
import type { ToolDefinition, ToolResult } from "@salvador/tools";

export type RunToolOutcome =
  | { ok: true; result: ToolResult }
  | { ok: false; error: string; denied?: boolean };

export interface RunToolOptions {
  permissions?: PermissionsConfig;
  /** Called for tools whose permission resolves to "ask". Missing → denied. */
  approve?: (tool: ToolDefinition, args: unknown) => Promise<boolean>;
}

export async function executeEditorTool(
  tools: readonly ToolDefinition[],
  name: string,
  args: unknown,
  opts: RunToolOptions = {},
): Promise<RunToolOutcome> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `unknown tool ${name}` };

  // Validate before asking, so the user is never prompted for a call that cannot run.
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: `invalid input: ${parsed.error.message}` };

  const perm = resolvePermission(tool.name, tool.kind, opts.permissions);
  if (perm === "deny") return { ok: false, error: `permission denied for ${tool.name}`, denied: true };
  if (perm === "ask") {
    const approved = opts.approve ? await opts.approve(tool, parsed.data) : false;
    if (!approved) return { ok: false, error: `denied by user: ${tool.name}`, denied: true };
  }

  try {
    // Editor tools act on the global stores and ignore the package-level context.
    const result = await tool.execute(parsed.data, {} as never);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
