/**
 * Pure helpers for the MCP bridge: tool manifest, permission policy and
 * result mapping. No Tauri or store access here (unit-tested directly).
 */
import zodToJsonSchema from "zod-to-json-schema";
import type { PermissionsConfig } from "@salvador/agent";
import type { ToolDefinition } from "@salvador/tools";
import type { RunToolOutcome } from "@/features/ai-agent/runTool";

/** How tool calls from external agents are authorised. */
export type McpPolicy = "ask" | "allow" | "readonly";
export const MCP_POLICIES: readonly McpPolicy[] = ["ask", "readonly", "allow"];

/** Shape sent to Rust `mcp_register_tools` (camelCase ⇄ serde rename). */
export interface McpToolManifest {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  longRunning: boolean;
}

/** Tools visible to MCP clients under a policy. Read-only hides every mutating tool. */
export function toolsForPolicy(tools: readonly ToolDefinition[], policy: McpPolicy): ToolDefinition[] {
  return policy === "readonly" ? tools.filter((t) => t.kind === "inspect") : [...tools];
}

export function buildManifest(
  tools: readonly ToolDefinition[],
  policy: McpPolicy,
  longRunning: ReadonlySet<string>,
): McpToolManifest[] {
  return toolsForPolicy(tools, policy).map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod v3/v4 bridge, same call as @salvador/agent
    const schema = zodToJsonSchema(t.input as any, { target: "jsonSchema7" }) as Record<string, unknown>;
    const { $schema: _ignored, ...inputSchema } = schema;
    if (inputSchema.type !== "object") inputSchema.type = "object";
    return {
      name: t.name,
      description: t.description,
      inputSchema,
      readOnly: t.kind === "inspect",
      longRunning: longRunning.has(t.name),
    };
  });
}

/**
 * Permission config per policy. "ask" keeps the in-app agent's defaults
 * (destructive / slow / external tools ask, the rest are allowed).
 */
export function permissionsForPolicy(policy: McpPolicy, askDefaults: Record<string, "ask">): PermissionsConfig {
  switch (policy) {
    case "allow":
      return { default: "allow", tools: Object.fromEntries(Object.keys(askDefaults).map((k) => [k, "allow" as const])) };
    case "readonly":
      return { default: "deny" };
    case "ask":
    default:
      return { default: "allow", tools: { ...askDefaults } };
  }
}

export interface McpCallToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

const MAX_TEXT = 100_000;

/** Map an executor outcome to an MCP `CallToolResult`. Data is also serialised into text for clients that ignore structuredContent. */
export function toMcpResult(outcome: RunToolOutcome): McpCallToolResult {
  if (!outcome.ok) return { content: [{ type: "text", text: outcome.error }], isError: true };
  const { summary, data } = outcome.result;
  let text = summary;
  if (data !== undefined) {
    const json = JSON.stringify(data);
    text += `\n${json.length > MAX_TEXT ? `${json.slice(0, MAX_TEXT)}…(truncated)` : json}`;
  }
  const out: McpCallToolResult = { content: [{ type: "text", text }], isError: false };
  if (data && typeof data === "object" && !Array.isArray(data)) out.structuredContent = data as Record<string, unknown>;
  return out;
}
