import zodToJsonSchema from "zod-to-json-schema";
import type { Host, Project, Transcript } from "@salvador/core";
import { ALL_TOOLS, type ToolCall, type ToolContext, type ToolDefinition } from "@salvador/tools";
import { resolvePermission } from "./permissions";
import { SYSTEM_PROMPT } from "./prompt";
import type {
  AgentCallbacks,
  AgentMessage,
  AgentMode,
  AgentOptions,
  Permission,
  PermissionsConfig,
  Provider,
  ProviderChunk,
  ProviderRequest,
} from "./types";

export function hostProvider(host: Host, providerName: string): Provider {
  return {
    name: providerName,
    async stream(req, onChunk) {
      await host.llmStream(
        {
          provider: providerName,
          model: req.model,
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
            toolCallId: m.toolCallId,
            toolCalls: m.toolCalls,
          })),
          tools: req.tools,
          stream: true,
        },
        (c) => onChunk(c as ProviderChunk),
      );
    },
  };
}

function projectSummary(p: Project): string {
  const clips = p.tracks.reduce((n, t) => n + t.clips.length, 0);
  return [
    `Project: ${p.name}`,
    `Settings: ${p.settings.width}x${p.settings.height} @ ${p.settings.fps}fps`,
    `Assets: ${p.assets.length}, Tracks: ${p.tracks.length}, Clips: ${clips}`,
  ].join("\n");
}

function compactTimeline(p: Project): string {
  return JSON.stringify(
    {
      tracks: p.tracks.map((t) => ({
        id: t.id,
        kind: t.kind,
        muted: t.muted,
        locked: t.locked,
        clips: t.clips.map((c) => ({
          id: c.id,
          assetId: c.assetId,
          inMs: c.inMs,
          outMs: c.outMs,
          startMs: c.startMs,
          speed: c.speed,
          volume: c.volume,
          effects: c.effects.map((e) => e.type),
        })),
      })),
      markers: p.markers.map((m) => ({ timeMs: m.timeMs, label: m.label })),
    },
    null,
    0,
  );
}

export interface AgentRunResult {
  text: string;
  messages: AgentMessage[];
  project: Project;
}

export class Agent {
  readonly provider: Provider;
  private host: Host;
  private model: string;
  private messages: AgentMessage[] = [];
  private project: Project;
  private mode: AgentMode;
  private maxSteps: number;
  private permissions: PermissionsConfig;
  private instructions: string;
  private callbacks: AgentCallbacks;
  private transcripts: Map<string, Transcript>;
  private projectDir?: string;
  private tools: ToolDefinition[];
  private customPrompt?: string;
  private contextProvider?: () => string;
  private signal?: AbortSignal;

  constructor(args: {
    host: Host;
    project?: Project;
    provider: Provider;
    model: string;
    options?: AgentOptions;
    callbacks?: AgentCallbacks;
    transcripts?: Map<string, Transcript>;
    projectDir?: string;
  }) {
    this.provider = args.provider;
    this.host = args.host;
    this.model = args.model;
    this.project = args.project ?? ({ name: "", settings: {}, assets: [], tracks: [], markers: [] } as unknown as Project);
    this.tools = args.options?.tools ?? ALL_TOOLS;
    this.customPrompt = args.options?.systemPrompt;
    this.contextProvider = args.options?.contextProvider;
    this.signal = args.options?.signal;
    this.mode = args.options?.mode ?? "build";
    this.maxSteps = args.options?.maxSteps ?? 20;
    this.permissions = args.options?.permissions ?? {};
    this.instructions = args.options?.instructions ?? "";
    this.callbacks = args.callbacks ?? {};
    this.transcripts = args.transcripts ?? new Map();
    this.projectDir = args.projectDir;
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
  }

  setModel(model: string): void {
    this.model = model;
  }

  setSignal(signal: AbortSignal | undefined): void {
    this.signal = signal;
  }

  setPermissions(permissions: PermissionsConfig): void {
    this.permissions = permissions;
  }

  /** Conversation history (index 0 is the regenerated system prompt). */
  getMessages(): AgentMessage[] {
    return this.messages;
  }

  clearConversation(): void {
    this.messages = [];
  }

  get currentProject(): Project {
    return this.project;
  }

  private systemPrompt(): string {
    const base = this.customPrompt ?? SYSTEM_PROMPT;
    if (this.contextProvider) {
      return [
        base,
        this.mode === "plan"
          ? "MODE: PLAN. Do not edit. Propose a numbered checklist and wait for approval."
          : "MODE: BUILD. Make the edits the user asks for.",
        this.instructions ? `PROJECT INSTRUCTIONS (SALVADOR.md):\n${this.instructions}` : "",
        this.contextProvider(),
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    return [
      base,
      this.mode === "plan"
        ? "MODE: PLAN. Do not edit. Propose a numbered checklist and wait for approval."
        : "MODE: BUILD. Make the edits the user asks for.",
      this.instructions ? `PROJECT INSTRUCTIONS (SALVADOR.md):\n${this.instructions}` : "",
      `PROJECT SUMMARY:\n${projectSummary(this.project)}`,
      `TIMELINE:\n${compactTimeline(this.project)}`,
      this.transcripts.size > 0
        ? `TRANSCRIPTS:\n${[...this.transcripts.values()].map((t) => `${t.id}: ${t.segments.map((s) => s.text).join(" ").slice(0, 800)}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private toolDefs(): ProviderRequest["tools"] {
    if (this.mode === "plan") return [];
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.input as any, { target: "jsonSchema7" }),
    }));
  }

  private compactIfNeeded(): void {
    if (this.messages.length <= 40) return;
    const system = this.messages.find((m) => m.role === "system");
    const tail = this.messages.slice(-20);
    this.messages = system ? [system, ...tail] : tail;
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    const system: AgentMessage = { role: "system", content: this.systemPrompt() };
    if (this.messages.length === 0) this.messages = [system];
    else this.messages[0] = system;
    this.messages.push({ role: "user", content: userMessage });
    let lastText = "";

    for (let step = 0; step < this.maxSteps; step++) {
      if (this.signal?.aborted) break;
      this.compactIfNeeded();
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];
      let streamError: string | null = null;

      await this.provider.stream(
        {
          provider: this.provider.name,
          model: this.model,
          messages: this.messages,
          tools: this.toolDefs(),
          stream: true,
          signal: this.signal,
        },
        (c) => {
          if (c.type === "text" && c.text) {
            textParts.push(c.text);
            this.callbacks.onText?.(c.text);
          } else if (c.type === "tool_call" && c.toolCall) {
            toolCalls.push(c.toolCall);
          } else if (c.type === "error") {
            streamError = c.error ?? "unknown provider error";
          }
        },
      );

      if (this.signal?.aborted) {
        if (textParts.length) this.messages.push({ role: "assistant", content: textParts.join("") });
        return { text: textParts.join(""), messages: this.messages, project: this.project };
      }
      if (streamError) throw new Error(streamError);
      const text = textParts.join("");
      lastText = text;
      this.messages.push({ role: "assistant", content: text, toolCalls: toolCalls.length ? toolCalls : undefined });

      if (toolCalls.length === 0 || this.mode === "plan") {
        return { text: lastText, messages: this.messages, project: this.project };
      }

      for (const call of toolCalls) {
        if (this.signal?.aborted) {
          this.messages.push({ role: "tool", content: JSON.stringify({ error: "aborted by user" }), toolCallId: call.id });
          continue;
        }
        const result = await this.executeTool(call);
        this.messages.push({
          role: "tool",
          content: JSON.stringify(result),
          toolCallId: call.id,
        });
      }
    }

    return { text: lastText, messages: this.messages, project: this.project };
  }

  private async executeTool(call: ToolCall): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === call.name);
    if (!tool) return { error: `unknown tool ${call.name}` };
    this.callbacks.onToolStart?.(call, tool);

    const perm: Permission = resolvePermission(tool.name, tool.kind, this.permissions);
    if (perm === "deny") {
      const r = { error: `permission denied for ${tool.name}` };
      this.callbacks.onToolResult?.(call, tool, r);
      return r;
    }
    if (perm === "ask") {
      const ok = this.callbacks.approve ? await this.callbacks.approve(call, tool) : false;
      if (!ok) {
        const r = { error: `user denied ${tool.name}` };
        this.callbacks.onToolResult?.(call, tool, r);
        return r;
      }
    }

    const parsed = tool.input.safeParse(call.args);
    if (!parsed.success) {
      const r = { error: `invalid input: ${parsed.error.message}` };
      this.callbacks.onToolResult?.(call, tool, r);
      return r;
    }

    const ctx: ToolContext = {
      host: this.host,
      project: this.project,
      setProject: (p) => {
        this.project = p;
        this.callbacks.onSnapshot?.(p);
      },
      projectDir: this.projectDir,
      transcripts: this.transcripts,
    };

    try {
      const result = await tool.execute(parsed.data, ctx);
      this.callbacks.onToolResult?.(call, tool, result);
      return result;
    } catch (e) {
      const r = { error: e instanceof Error ? e.message : String(e) };
      this.callbacks.onToolResult?.(call, tool, r);
      return r;
    }
  }

}
