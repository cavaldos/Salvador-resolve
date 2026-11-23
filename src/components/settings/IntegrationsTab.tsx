/**
 * Settings → Integrations: MCP server for external coding agents.
 * Server lifecycle lives in `McpBridgeHost`; this tab only edits settings and
 * shows connection details.
 */
import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Check, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { SettingRow } from "@/components/settings/SettingRow";
import { ToggleSwitch } from "@/components/settings/ToggleSwitch";
import { useMcpStore, isValidPort } from "@/features/mcp-bridge/mcpStore";
import { MCP_POLICIES, type McpPolicy } from "@/features/mcp-bridge/manifest";
import { buildClientSnippets, type McpClientId } from "@/features/mcp-bridge/clientConfigs";

const sectionClass = "rounded-xl bg-surface-card border border-border-default/70 p-4 sm:p-5 shadow-xs";
const headingClass = "text-xs font-semibold uppercase tracking-wider text-text-muted mb-2";
const segBtn = (active: boolean) =>
  `px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
    active ? "bg-accent-primary text-white shadow-xs font-semibold" : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
  }`;

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch (e) {
      console.error("[MCP] clipboard write failed", e);
    }
  };
  return { copied, copy };
}

export const IntegrationsTab: React.FC = () => {
  const { t } = useI18n();
  const { enabled, port, policy, status, error, setEnabled, setPort, setPolicy } = useMcpStore();
  const [portDraft, setPortDraft] = useState(String(port));
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [client, setClient] = useState<McpClientId>("claude-code");
  const { copied, copy } = useCopy();

  useEffect(() => setPortDraft(String(port)), [port]);

  useEffect(() => {
    if (!status.running) return;
    let alive = true;
    invoke<string>("mcp_get_token")
      .then((tok) => alive && setToken(tok))
      .catch((e: unknown) => console.error("[MCP] token read failed", e));
    return () => {
      alive = false;
    };
  }, [status.running]);

  const livePort = status.port ?? port;
  const snippets = useMemo(() => (token ? buildClientSnippets(livePort, token) : []), [livePort, token]);
  const snippet = snippets.find((s) => s.id === client) ?? snippets[0];

  const commitPort = () => {
    const n = Number(portDraft);
    if (isValidPort(n)) setPort(n);
    else setPortDraft(String(port));
  };

  const regenerate = async () => {
    try {
      setToken(await invoke<string>("mcp_regenerate_token"));
      toast.success(t("mcp.settings.regenerated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const statusText = error
    ? t("mcp.settings.status.error", { error })
    : status.running && status.url
      ? t("mcp.settings.status.running", { url: status.url })
      : t("mcp.settings.status.stopped");

  return (
    <div className="space-y-5">
      <section className={sectionClass}>
        <h3 className={headingClass}>{t("mcp.settings.title")}</h3>
        <p className="text-xs text-text-muted mb-2 leading-relaxed">{t("mcp.settings.description")}</p>
        <div className="divide-y divide-border-subtle/50">
          <SettingRow label={t("mcp.settings.enable")} description={t("mcp.settings.enableDesc")}>
            <ToggleSwitch checked={enabled} onChange={setEnabled} aria-label={t("mcp.settings.enable")} />
          </SettingRow>
          <div className="py-2.5 text-xs" role="status" aria-live="polite">
            <span className={error ? "text-status-error" : status.running ? "text-status-success" : "text-text-muted"}>
              {statusText}
            </span>
          </div>
          <SettingRow label={t("mcp.settings.port")} description={t("mcp.settings.portDesc")}>
            <input
              type="number"
              min={1024}
              max={65533}
              value={portDraft}
              onChange={(e) => setPortDraft(e.target.value)}
              onBlur={commitPort}
              onKeyDown={(e) => e.key === "Enter" && commitPort()}
              aria-label={t("mcp.settings.port")}
              className="w-24 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border-default text-text-primary"
            />
          </SettingRow>
          <SettingRow label={t("mcp.settings.policy")} description={t("mcp.settings.policyDesc")}>
            <div
              role="radiogroup"
              aria-label={t("mcp.settings.policy")}
              className="flex rounded-lg overflow-hidden border border-border-default bg-surface-elevated p-0.5"
            >
              {MCP_POLICIES.map((p: McpPolicy) => (
                <button key={p} type="button" role="radio" aria-checked={policy === p} onClick={() => setPolicy(p)} className={segBtn(policy === p)}>
                  {t(`mcp.settings.policy.${p}`)}
                </button>
              ))}
            </div>
          </SettingRow>
          {policy === "allow" && <p className="py-2 text-xs text-status-warning">{t("mcp.settings.policy.allowWarning")}</p>}
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={headingClass}>{t("mcp.settings.connectTitle")}</h3>
        {!status.running || !token || !snippet ? (
          <p className="text-xs text-text-muted">{t("mcp.settings.enableFirst")}</p>
        ) : (
          <div className="space-y-3">
            <SettingRow label={t("mcp.settings.token")} description={t("mcp.settings.tokenDesc")}>
              <div className="flex items-center gap-1">
                <code className="px-2 py-1 text-[11px] rounded bg-surface-elevated text-text-primary max-w-[180px] truncate" data-no-i18n>
                  {showToken ? token : "•".repeat(16)}
                </code>
                <button type="button" className="p-1.5 rounded hover:bg-surface-hover" onClick={() => setShowToken((v) => !v)} aria-label={t(showToken ? "mcp.settings.hideToken" : "mcp.settings.showToken")}>
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button type="button" className="p-1.5 rounded hover:bg-surface-hover" onClick={() => copy("token", token)} aria-label={t("mcp.settings.copy")}>
                  {copied === "token" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button type="button" className="p-1.5 rounded hover:bg-surface-hover" onClick={regenerate} aria-label={t("mcp.settings.regenerate")} title={t("mcp.settings.regenerate")}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </SettingRow>

            <p className="text-xs text-text-muted">{t("mcp.settings.connectDesc")}</p>
            <div role="tablist" aria-label={t("mcp.settings.connectTitle")} className="flex flex-wrap gap-1">
              {snippets.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === snippet.id} onClick={() => setClient(s.id)} className={segBtn(s.id === snippet.id)} data-no-i18n>
                  {s.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="rounded-lg border border-border-default bg-surface-elevated">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle/60 text-[11px] text-text-muted">
                <span>{snippet.target === "terminal" ? t("mcp.settings.runInTerminal") : t("mcp.settings.snippetTarget", { target: snippet.target })}</span>
                <button type="button" className="flex items-center gap-1 hover:text-text-primary" onClick={() => copy(snippet.id, snippet.code)}>
                  {copied === snippet.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === snippet.id ? t("mcp.settings.copied") : t("mcp.settings.copy")}
                </button>
              </div>
              <pre className="p-3 text-[11px] leading-relaxed overflow-x-auto text-text-primary select-text" data-no-i18n>
                {showToken ? snippet.code : snippet.code.split(token).join("•".repeat(16))}
              </pre>
            </div>
            <p className="text-[11px] text-text-muted">{t("mcp.settings.docsHint")}</p>
          </div>
        )}
      </section>
    </div>
  );
};
