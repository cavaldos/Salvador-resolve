/**
 * Headless host for the MCP server: mounted once at the app root.
 *
 * When the user enabled "Agent control (MCP)" in Settings it registers the
 * editor tools with Rust and starts the loopback server; disabling (or
 * unmounting) stops both. All server IPC is serialised through one promise
 * chain so a quick off→on or port change can never interleave stop/start.
 */
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { isTauriRuntime } from "@/lib/platform/tauri";
import { EDITOR_TOOLS, DEFAULT_PERMISSIONS, LONG_RUNNING_TOOLS } from "@/features/ai-agent/tools";
import { summarizeArgs } from "@/features/ai-agent/agentStore";
import { McpBridgeClient, type ApprovalRequest } from "./bridgeClient";
import { STOPPED, useMcpStore, type McpServerStatus } from "./mcpStore";

/** Auto-deny shortly before Rust's 120 s call timeout so the agent gets a clear answer. */
const APPROVAL_TIMEOUT_MS = 110_000;

let serverOps: Promise<unknown> = Promise.resolve();
function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = serverOps.then(op, op);
  serverOps = next.catch(() => undefined);
  return next;
}

export function approveViaToast(req: ApprovalRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let id: string | number = "";
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      toast.dismiss(id);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), APPROVAL_TIMEOUT_MS);
    id = toast(i18n.t("mcp.approval.title", { client: req.clientName, tool: req.toolName }), {
      description: summarizeArgs(req.args, 160) || undefined,
      duration: Infinity,
      action: { label: i18n.t("mcp.approval.allow"), onClick: () => finish(true) },
      cancel: { label: i18n.t("mcp.approval.deny"), onClick: () => finish(false) },
      onDismiss: () => finish(false),
    });
  });
}

export function McpBridgeHost(): null {
  const enabled = useMcpStore((s) => s.enabled);
  const port = useMcpStore((s) => s.port);
  const policy = useMcpStore((s) => s.policy);
  const clientRef = useRef<McpBridgeClient | null>(null);

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return;
    const { setStatus, setError } = useMcpStore.getState();
    const client = new McpBridgeClient({
      tools: EDITOR_TOOLS,
      longRunning: LONG_RUNNING_TOOLS,
      askDefaults: { ...DEFAULT_PERMISSIONS.tools },
      policy: useMcpStore.getState().policy,
      approve: approveViaToast,
    });
    clientRef.current = client;
    let cancelled = false;

    serialize(async () => {
      if (cancelled) return;
      await client.start();
      const status = await invoke<McpServerStatus>("mcp_start", { port });
      if (!cancelled) {
        setStatus(status);
        setError(null);
      }
    }).catch((e: unknown) => {
      if (cancelled) return;
      setStatus(STOPPED);
      setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
      clientRef.current = null;
      serialize(async () => {
        await invoke("mcp_stop");
        await client.dispose();
      })
        .catch((e: unknown) => console.error("[MCP] stop failed", e))
        .finally(() => useMcpStore.getState().setStatus(STOPPED));
    };
  }, [enabled, port]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    serialize(() => client.setPolicy(policy)).catch((e: unknown) => console.error("[MCP] policy update failed", e));
  }, [policy]);

  return null;
}
