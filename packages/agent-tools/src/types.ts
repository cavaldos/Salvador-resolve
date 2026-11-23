import type { z } from "zod";
export { z as zod } from "zod";
import type { Host, Project, Transcript } from "@salvador/core";

export type ToolKind = "inspect" | "edit" | "output";

export interface ToolContext {
  host: Host;
  project: Project;
  setProject(p: Project): void;
  projectDir?: string;
  transcripts?: Map<string, Transcript>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  summary: string;
  data?: unknown;
}

export interface ToolDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  kind: ToolKind;
  input: Schema;
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<ToolResult>;
}

export function defineTool<Schema extends z.ZodTypeAny>(def: ToolDefinition<Schema>): ToolDefinition<Schema> {
  return def;
}
