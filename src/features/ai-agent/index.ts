import { Bot } from "lucide-react";
import { AiAgentPanel } from "./AiAgentPanel";

export { AiAgentPanel } from "./AiAgentPanel";
export { useAiAgentStore } from "./agentStore";
export { EDITOR_TOOLS } from "./tools";

/** Descriptor so the layout owner can mount the panel as a tab. */
export const aiAgentTab = {
  id: "ai",
  label: "AI Agent",
  icon: Bot,
  component: AiAgentPanel,
} as const;
