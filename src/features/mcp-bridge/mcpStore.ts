/** MCP server settings (persisted) + runtime status (not persisted). */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpPolicy } from "./manifest";

export const MCP_DEFAULT_PORT = 47821;

export interface McpServerStatus {
  running: boolean;
  port: number | null;
  url: string | null;
}

interface McpState {
  enabled: boolean;
  port: number;
  policy: McpPolicy;
  status: McpServerStatus;
  error: string | null;
  setEnabled: (v: boolean) => void;
  setPort: (p: number) => void;
  setPolicy: (p: McpPolicy) => void;
  setStatus: (s: McpServerStatus) => void;
  setError: (e: string | null) => void;
}

export const STOPPED: McpServerStatus = { running: false, port: null, url: null };

export function isValidPort(p: number): boolean {
  return Number.isInteger(p) && p >= 1024 && p <= 65533;
}

export const useMcpStore = create<McpState>()(
  persist(
    (set) => ({
      enabled: false,
      port: MCP_DEFAULT_PORT,
      policy: "ask",
      status: STOPPED,
      error: null,
      setEnabled: (enabled) => set({ enabled, error: null }),
      setPort: (port) => {
        if (isValidPort(port)) set({ port });
      },
      setPolicy: (policy) => set({ policy }),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
    }),
    {
      name: "salvador-mcp-settings",
      partialize: (s) => ({ enabled: s.enabled, port: s.port, policy: s.policy }),
    },
  ),
);
