export interface ProbeResult {
  path: string;
  durationMs: number;
  streams: import("./timeline/schema").StreamInfo[];
}

export interface JobProgress {
  jobId: string;
  pct: number;
  fps?: number;
  etaMs?: number;
}

export type Unsubscribe = () => void;

export interface LlmToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface LlmMessage {
  role: string;
  content: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmRequest {
  provider: string;
  model: string;
  messages: LlmMessage[];
  tools?: unknown[];
  stream?: boolean;
}

export interface LlmChunk {
  type: "text" | "tool_call" | "done" | "error";
  text?: string;
  toolCall?: { id: string; name: string; args: unknown };
  error?: string;
}

export interface TranscriptWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  words?: TranscriptWord[];
}

export interface Transcript {
  id: string;
  assetId: string;
  segments: TranscriptSegment[];
}

export interface SilenceRange {
  startMs: number;
  endMs: number;
}

export interface SceneRange {
  startMs: number;
  endMs: number;
  score?: number;
}

export interface Host {
  probe(path: string): Promise<ProbeResult>;
  runFfmpeg(args: string[], opts: { jobId: string; durationMs?: number }): Promise<void>;
  onJobProgress(cb: (e: JobProgress) => void): Unsubscribe;
  cancelJob(jobId: string): Promise<void>;
  readProject(dir: string): Promise<import("./timeline/schema").Project>;
  writeProject(dir: string, p: import("./timeline/schema").Project): Promise<void>;
  llmStream(req: LlmRequest, onChunk: (c: LlmChunk) => void): Promise<void>;
  transcribe?(path: string): Promise<Transcript>;
  detectSilence?(path: string, opts?: { thresholdDb?: number; minDurationMs?: number }): Promise<SilenceRange[]>;
  detectScenes?(path: string): Promise<SceneRange[]>;
  extractFrames?(path: string, timesMs: number[]): Promise<string[]>;
  writeTextFile?(path: string, content: string): Promise<void>;
}
