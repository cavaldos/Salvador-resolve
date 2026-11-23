import React, { useState } from "react";
import {
  Smile,
  Wand2,
  MessageSquare,
  Filter,
  Shuffle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MediaTab } from "./tabs/MediaTab";
import { AudioTab } from "./tabs/AudioTab";
import { TextTab } from "./tabs/TextTab";
import { StickersTab } from "./tabs/StickersTab";
import { FiltersTab } from "./tabs/FiltersTab";
import { TransitionsTab } from "./tabs/TransitionsTab";
import { CaptionsTab } from "./tabs/CaptionsTab";
import { SmartOverlaysTab } from "./tabs/SmartOverlaysTab";
import { type TabType, type MediaTabProps } from "./types";
import { EffectsPanel } from "@/features/video-effects/components/EffectsPanel";
import {
  AssetsTabIcon,
  AudioTabIcon,
  TextTabIcon,
} from "@/components/ui/icons";
import { FeaturePlaceholder } from "@/components/ui/FeaturePlaceholder";
import { SIDEBAR_PLACEHOLDERS } from "./placeholders";
import { useI18n } from "@/i18n";
import { AiAgentPanel, aiAgentTab } from "@/features/ai-agent";

const SIDEBAR_TABS = [
  { id: "media" as const, icon: AssetsTabIcon, labelKey: "sidebar.tabs.media" },
  { id: "audio" as const, icon: AudioTabIcon, labelKey: "sidebar.tabs.audio" },
  { id: "text" as const, icon: TextTabIcon, labelKey: "sidebar.tabs.text" },
  // Overlays tab hidden for now
  // { id: "smart-overlays" as const, icon: Sparkles, labelKey: "sidebar.tabs.overlays" },
  { id: "stickers" as const, icon: Smile, labelKey: "sidebar.tabs.stickers" },
  { id: "effects" as const, icon: Wand2, labelKey: "sidebar.tabs.effects" },
  { id: "filters" as const, icon: Filter, labelKey: "sidebar.tabs.filters" },
  {
    id: "transitions" as const,
    icon: Shuffle,
    labelKey: "sidebar.tabs.transitions",
  },
  {
    id: "captions" as const,
    icon: MessageSquare,
    labelKey: "sidebar.tabs.captions",
  },
  { id: "ai" as const, icon: aiAgentTab.icon, labelKey: "sidebar.tabs.ai" },
] as const;

export interface SidebarProps extends MediaTabProps {
  width?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  /** "studio" adds the narrow sub-category column next to the content. */
  variant?: "default" | "studio";
}

const SidebarComponent: React.FC<SidebarProps> = ({
  onAddToTimeline,
  initialTab = "media",
  width,
  collapsed = false,
  onToggleCollapse,
  className = "",
  variant = "default",
}) => {
  const { t } = useI18n();
  const resolvedInitialTab =
    initialTab === "smart-overlays" ? "media" : initialTab;
  const [activeTab, setActiveTab] = useState<TabType>(resolvedInitialTab);

  React.useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  return (
    <div
      className={`min-h-0 bg-surface-panel border border-border-default rounded-lg flex flex-col overflow-hidden transition-[width] duration-150 ${
        collapsed || width !== undefined ? "shrink-0" : "flex-1 min-w-0"
      } ${className}`}
      style={{ width: collapsed ? 44 : width }}
    >
      {/* Tab Navigation / Header */}
      <div className="bg-surface-panel border-b border-border-default relative flex items-center">
        {collapsed ? (
          <div className="w-full flex items-center justify-center py-2">
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-accent-primary hover:bg-surface-hover transition-colors cursor-pointer"
                title={t("sidebar.expand")}
                aria-label={t("sidebar.expand")}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="relative flex-1 min-w-0 pr-6">
              <div
                className="flex overflow-x-auto scrollbar-none"
                style={{
                  overflowY: "hidden",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {SIDEBAR_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      title={t(tab.labelKey)}
                      className={`flex items-center flex-col justify-center gap-1 min-w-[2.75rem] flex-1 px-0.5 py-2 text-[0.6875rem] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        isActive
                          ? "text-accent-primary"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <Icon size="1.25em" />
                      <span className="max-w-full truncate">
                        {t(tab.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Fade hint for overflow tabs */}
              <div className="pointer-events-none absolute right-6 top-0 h-full w-6 bg-linear-to-l from-surface-panel to-transparent" />
            </div>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-accent-primary hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
                title={t("sidebar.collapse")}
                aria-label={t("sidebar.collapse")}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Tab Content or Collapsed Rail */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1.5 py-2 overflow-y-auto flex-1 scrollbar-none">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  onToggleCollapse?.();
                }}
                title={t(tab.labelKey)}
                aria-label={t(tab.labelKey)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? "text-accent-primary bg-accent-primary/15"
                    : "text-text-muted hover:text-accent-primary hover:bg-surface-hover"
                }`}
              >
                <Icon size="0.9375em" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {SIDEBAR_PLACEHOLDERS[activeTab] ? (
            <FeaturePlaceholder {...SIDEBAR_PLACEHOLDERS[activeTab]} />
          ) : (
            <>
              {activeTab === "media" &&
                (variant === "studio" ? (
                  <div className="flex flex-1 min-h-0">
                    <div className="w-24 shrink-0 border-r border-border-default p-2">
                      <div className="rounded-md bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-accent-primary">
                        {t("sidebar.media.device")}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col min-h-0">
                      <MediaTab onAddToTimeline={onAddToTimeline} />
                    </div>
                  </div>
                ) : (
                  <MediaTab onAddToTimeline={onAddToTimeline} />
                ))}
              {activeTab === "audio" && (
                <AudioTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "text" && (
                <TextTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "smart-overlays" && (
                <SmartOverlaysTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "stickers" && (
                <StickersTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "effects" && (
                <EffectsPanel onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "filters" && (
                <FiltersTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "transitions" && (
                <TransitionsTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "captions" && (
                <CaptionsTab onAddToTimeline={onAddToTimeline} />
              )}
              {activeTab === "ai" && <AiAgentPanel />}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const Sidebar = React.memo(SidebarComponent);
