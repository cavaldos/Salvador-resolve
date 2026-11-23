/**
 * Webview side of the MCP bridge.
 *
 * Receives `mcp://call` events from Rust, runs the editor tool through the
 * shared executor, and answers with `mcp_resolve_call`. Calls run strictly one
 * at a time (FIFO) so two agents — or an agent and an approval prompt — can
 * never interleave edits on the timeline.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ToolDefinition } from "@salvador/tools";
import { executeEditorTool } from "@/features/ai-agent/runTool";
import { buildManifest, permissionsForPolicy, toMcpResult, type McpPolicy } from "./manifest";

export const MCP_CALL_EVENT = "mcp://call";

export interface McpCallEvent {
  callId: string;
  name: string;
  arguments: unknown;
  clientName: string;
}

export interface ApprovalRequest {
  clientName: string;
  toolName: string;
  args: unknown;
}

export interface McpBridgeClientOptions {
  tools: readonly ToolDefinition[];
  longRunning: ReadonlySet<string>;
  askDefaults: Record<string, "ask">;
  policy: McpPolicy;
  approve: (req: ApprovalRequest) => Promise<boolean>;
}

export class McpBridgeClient {
  private unlisten: UnlistenFn | null = null;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private policy: McpPolicy;

  constructor(private readonly opts: McpBridgeClientOptions) {
    this.policy = opts.policy;
  }

  async start(): Promise<void> {
    const unlisten = await listen<McpCallEvent>(MCP_CALL_EVENT, (e) => this.enqueue(e.payload));
    if (this.disposed) {
      unlisten();
      return;
    }
    this.unlisten = unlisten;
    await this.registerTools();
  }

  async setPolicy(policy: McpPolicy): Promise<void> {
    this.policy = policy;
    if (!this.disposed) await this.registerTools();
  }

  /** Stop listening and tell Rust the editor is gone (fails any in-flight calls). */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.unlisten?.();
    this.unlisten = null;
    await invoke("mcp_register_tools", { tools: [] });
  }

  /** Exposed for tests: resolves when every queued call has been answered. */
  idle(): Promise<void> {
    return this.queue;
  }

  private registerTools(): Promise<void> {
    const tools = buildManifest(this.opts.tools, this.policy, this.opts.longRunning);
    return invoke("mcp_register_tools", { tools });
  }

  private enqueue(call: McpCallEvent): void {
    this.queue = this.queue.then(() => this.handle(call)).catch((e) => {
      console.error("[MCP] failed to answer tool call", e);
    });
  }

  private async handle(call: McpCallEvent): Promise<void> {
    if (this.disposed) return;
    const policy = this.policy;
    const outcome = await executeEditorTool(
      // Defense in depth: read-only never executes a mutating tool even if Rust's manifest is stale.
      policy === "readonly" ? this.opts.tools.filter((t) => t.kind === "inspect") : this.opts.tools,
      call.name,
      call.arguments,
      {
        permissions: permissionsForPolicy(policy, this.opts.askDefaults),
        approve: (tool, args) => this.opts.approve({ clientName: call.clientName, toolName: tool.name, args }),
      },
    );
    await invoke("mcp_resolve_call", { callId: call.callId, result: toMcpResult(outcome) });
  }
}
