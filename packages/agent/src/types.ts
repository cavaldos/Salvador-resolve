import type { Project } from "@salvador/core";
import type { ToolCall, ToolDefinition, ToolResult } from "@salvador/tools";

export type AgentMode = "plan" | "build";

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ProviderRequest {
  provider: string;
  model: string;
  messages: AgentMessage[];
  tools: { name: string; description: string; inputSchema: unknown }[];
  stream: boolean;
  signal?: AbortSignal;
}

export interface ProviderChunk {
  type: "text" | "tool_call" | "done" | "error";
  text?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface Provider {
  name: string;
  stream(req: ProviderRequest, onChunk: (c: ProviderChunk) => void): Promise<void>;
}

export interface AgentCallbacks {
  onText?(text: string): void;
  onToolStart?(call: ToolCall, tool: ToolDefinition): void;
  onToolResult?(call: ToolCall, tool: ToolDefinition, result: ToolResult | { error: string }): void;
  onSnapshot?(project: Project): void;
  approve?(call: ToolCall, tool: ToolDefinition): Promise<boolean>;
  onStatus?(status: string): void;
}

export interface AgentOptions {
  mode?: AgentMode;
  maxSteps?: number;
  permissions?: PermissionsConfig;
  instructions?: string;
  /** Custom tool set (defaults to the Cutline-schema ALL_TOOLS). */
  tools?: ToolDefinition[];
  /** Replace the default system prompt. */
  systemPrompt?: string;
  /**
   * Supplies live project context appended to the system prompt on every run.
   * When set, the built-in Cutline project summary/timeline dump is skipped.
   */
  contextProvider?: () => string;
  /** Aborts the run: stops streaming and prevents further tool execution. */
  signal?: AbortSignal;
}

export type Permission = "allow" | "ask" | "deny";

export interface PermissionsConfig {
  default?: Permission;
  tools?: Record<string, Permission>;
}
