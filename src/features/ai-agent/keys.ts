/** Thin wrappers over the Rust keychain commands. Keys never come back to JS. */
import { invoke } from "@tauri-apps/api/core";

export const AI_PROVIDER = "anthropic";

export const AI_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
] as const;

export const DEFAULT_MODEL = AI_MODELS[0].id;

export function hasApiKey(provider: string = AI_PROVIDER): Promise<boolean> {
  return invoke<boolean>("ai_agent_has_api_key", { provider });
}

export function saveApiKey(key: string, provider: string = AI_PROVIDER): Promise<void> {
  return invoke<void>("ai_agent_set_api_key", { provider, key });
}

export function clearApiKey(provider: string = AI_PROVIDER): Promise<void> {
  return invoke<void>("ai_agent_delete_api_key", { provider });
}
