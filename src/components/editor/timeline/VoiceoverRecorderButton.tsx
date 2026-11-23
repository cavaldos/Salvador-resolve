import React from "react";
import { Mic, Square } from "lucide-react";
import { useVoiceoverRecorder } from "@/hooks/useVoiceoverRecorder";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

interface VoiceoverRecorderButtonProps {
  /** Base icon-button classes supplied by the toolbar. */
  className?: string;
}

/** Icon-only microphone button that starts/stops a live voiceover at the playhead. */
export const VoiceoverRecorderButton: React.FC<VoiceoverRecorderButtonProps> = ({
  className,
}) => {
  const { t } = useI18n();
  const { voiceoverActive, startVoiceover, stopVoiceover } =
    useVoiceoverRecorder();
  const label = voiceoverActive
    ? t("timeline.tools.stopVoiceover")
    : t("timeline.tools.recordVoiceover");

  return (
    <button
      type="button"
      onClick={voiceoverActive ? stopVoiceover : startVoiceover}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer select-none text-text-muted hover:bg-surface-hover hover:text-text-primary",
        className,
        voiceoverActive &&
          "bg-red-500/20 text-red-400 animate-pulse hover:bg-red-500/25 hover:text-red-400",
      )}
      title={label}
      aria-label={label}
      aria-pressed={voiceoverActive}
    >
      {voiceoverActive ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
};
