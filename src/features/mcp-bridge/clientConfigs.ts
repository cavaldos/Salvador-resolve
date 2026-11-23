/**
 * Copy-paste connection snippets for common coding agents.
 * Single source of truth for Settings → Integrations and docs/agent/MCP.md.
 */

export const MCP_TOKEN_ENV = "SALVADOR_MCP_TOKEN";

export type McpClientId = "claude-code" | "cursor" | "vscode" | "codex" | "gemini" | "stdio";

export interface McpClientSnippet {
  id: McpClientId;
  /** Product name; not translated. */
  label: string;
  /** Where the snippet goes (file path or "terminal"); not translated. */
  target: string;
  language: "bash" | "json" | "toml";
  code: string;
}

export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

export function buildClientSnippets(port: number, token: string): McpClientSnippet[] {
  const url = mcpUrl(port);
  const auth = `Bearer ${token}`;
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      target: "terminal",
      language: "bash",
      code: `claude mcp add --transport http salvador ${url} \\\n  --header "Authorization: ${auth}"`,
    },
    {
      id: "cursor",
      label: "Cursor",
      target: ".cursor/mcp.json",
      language: "json",
      code: json({ mcpServers: { salvador: { url, headers: { Authorization: auth } } } }),
    },
    {
      id: "vscode",
      label: "VS Code (Copilot)",
      target: ".vscode/mcp.json",
      language: "json",
      code: json({ servers: { salvador: { type: "http", url, headers: { Authorization: auth } } } }),
    },
    {
      id: "codex",
      label: "Codex CLI",
      target: "~/.codex/config.toml",
      language: "toml",
      code: `# export ${MCP_TOKEN_ENV}=${token}\n[mcp_servers.salvador]\nurl = "${url}"\nbearer_token_env_var = "${MCP_TOKEN_ENV}"`,
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      target: "~/.gemini/settings.json",
      language: "json",
      code: json({ mcpServers: { salvador: { httpUrl: url, headers: { Authorization: auth } } } }),
    },
    {
      id: "stdio",
      label: "stdio-only clients (mcp-remote)",
      target: "mcp.json",
      language: "json",
      code: json({
        mcpServers: {
          salvador: {
            command: "npx",
            args: ["-y", "mcp-remote", url, "--header", "Authorization:${SALVADOR_AUTH}"],
            env: { SALVADOR_AUTH: auth },
          },
        },
      }),
    },
  ];
}
