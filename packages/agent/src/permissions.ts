import type { ToolKind } from "@salvador/tools";
import type { Permission, PermissionsConfig } from "./types";

const ASK_BY_DEFAULT = new Set([
  "render_final",
  "start_export",
  "delete_clip",
  "ripple_delete",
  "remove_silences",
  "remove_filler_words",
  "export_fcpxml",
  "export_edl",
]);

export function resolvePermission(name: string, kind: ToolKind, config: PermissionsConfig = {}): Permission {
  const explicit = config.tools?.[name];
  if (explicit) return explicit;
  if (kind === "inspect") return "allow";
  if (ASK_BY_DEFAULT.has(name)) return "ask";
  return config.default ?? "allow";
}
