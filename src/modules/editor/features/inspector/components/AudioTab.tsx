import type { ReactNode } from "react";
import { RotateCcw, Unlink, Volume2, VolumeX } from "lucide-react";
import type { AudioSettings, TimelineClip } from "@/modules/editor/types";
import { detachAudioFromVideo } from "@/modules/editor/features/audio/utils/detachAudio";
import { useProjectStore } from "@/modules/projects";
import { Slider } from "@/shared/components/ui/Slider";
import { InspectorSegments, InspectorTabLayout, inspectorSliderStyle, inspectorValueClass } from "./InspectorTabLayout";

const defaultAudio: AudioSettings = { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 };
const VOLUME_PRESETS = [
  { label: "Mute", value: 0, muted: true },
  { label: "BGM Soft", value: 0.3, muted: false },
  { label: "Dialogue", value: 0.7, muted: false },
  { label: "Full 100%", value: 1, muted: false },
];
const FADE_PRESETS = [0, 0.5, 1, 2];
const buttonClass = "rounded-md border border-studio-border bg-studio-panel-raised p-1.5 text-studio-muted enabled:cursor-pointer enabled:hover:text-studio-fg disabled:opacity-50";

function AudioSlider({ label, value, max, step, unit, onChange, onReset, action }: {
  label: string;
  value: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  onReset: () => void;
  action?: ReactNode;
}) {
  const change = (next: number) => {
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(0, next)));
  };
  const display = value.toFixed(unit === "%" ? 0 : 1);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-medium">{label}</p>
        <button type="button" aria-label={`Reset ${label.toLowerCase()}`} onClick={onReset} className="cursor-pointer rounded p-1 text-studio-muted hover:text-studio-fg"><RotateCcw className="size-3" aria-hidden="true" /></button>
      </div>
      <div className="flex items-center gap-2">
        <Slider {...inspectorSliderStyle} aria-label={`${label} slider`} value={value} min={0} max={max || 1} step={step} disabled={max === 0} onValueChange={change} />
        <label className="relative shrink-0">
          <input key={value} type="number" aria-label={label} min={0} max={max} step={step} defaultValue={display} disabled={max === 0} onBlur={(event) => {
            change(event.currentTarget.valueAsNumber);
            event.currentTarget.value = display;
          }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className={`${inspectorValueClass} pr-6`} />
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-studio-muted">{unit}</span>
        </label>
        {action}
      </div>
    </div>
  );
}

export function AudioTab({ clip }: { clip: TimelineClip }) {
  const updateClip = useProjectStore((state) => state.updateClip);
  const audio = clip.audio ?? defaultAudio;
  const updateAudio = (updates: Partial<AudioSettings>) => updateClip(clip.id, { audio: { ...audio, ...updates } });
  const maxFadeIn = Math.max(0, clip.timelineDuration - audio.fadeOut);
  const maxFadeOut = Math.max(0, clip.timelineDuration - audio.fadeIn);
  const VolumeIcon = audio.muted ? VolumeX : Volume2;

  return (
    <InspectorTabLayout header={<InspectorSegments label="Audio tools" items={["Basic", "Voice changer"]} />} onReset={() => updateAudio(defaultAudio)}>
      <div className="space-y-3 border-b border-studio-border pb-3 text-xs">
        <h3 className="font-semibold">Basic</h3>
        <AudioSlider label="Volume" value={audio.muted ? 0 : audio.volume * 100} max={100} step={1} unit="%" onChange={(volume) => updateAudio({ volume: volume / 100, muted: false })} onReset={() => updateAudio({ volume: 1, muted: false })} action={(
          <button type="button" aria-label={audio.muted ? "Unmute" : "Mute"} onClick={() => updateAudio({ muted: !audio.muted })} className={buttonClass}><VolumeIcon className="size-4" aria-hidden="true" /></button>
        )} />
        <AudioSlider label="Fade in" value={audio.fadeIn} max={maxFadeIn} step={0.1} unit="s" onChange={(fadeIn) => updateAudio({ fadeIn })} onReset={() => updateAudio({ fadeIn: 0 })} />
        <AudioSlider label="Fade out" value={audio.fadeOut} max={maxFadeOut} step={0.1} unit="s" onChange={(fadeOut) => updateAudio({ fadeOut })} onReset={() => updateAudio({ fadeOut: 0 })} />
        <div title="Audio pan is not available" className="text-studio-muted opacity-65">
          <p className="mb-1.5">Pan</p>
          <div className="flex items-center gap-2">
            <Slider {...inspectorSliderStyle} aria-label="Pan" disabled value={0} min={-100} max={100} onValueChange={() => {}} />
            <span className={inspectorValueClass}>0%</span>
          </div>
        </div>
      </div>
      {clip.type === "video" && clip.assetId && (
        <button type="button" disabled={clip.audio?.muted} onClick={() => void detachAudioFromVideo(clip.id)} className={`${buttonClass} mt-3 flex items-center gap-1.5 text-xs disabled:opacity-50`}>
          <Unlink className="size-3" aria-hidden="true" /> Detach audio to timeline
        </button>
      )}
      <details className="mt-3 text-xs text-studio-muted">
        <summary className="cursor-pointer">Audio presets</summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {VOLUME_PRESETS.map(({ label, value, muted }) => <button key={label} type="button" className={buttonClass} onClick={() => updateAudio(muted ? { muted } : { volume: value, muted })}>{label}</button>)}
        </div>
        {(["fadeIn", "fadeOut"] as const).map((field) => (
          <div key={field} className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1">{field === "fadeIn" ? "Fade in" : "Fade out"}</span>
            {FADE_PRESETS.map((value) => <button key={value} type="button" className={buttonClass} disabled={value > (field === "fadeIn" ? maxFadeIn : maxFadeOut)} onClick={() => updateAudio({ [field]: value })}>{value} s</button>)}
          </div>
        ))}
      </details>
    </InspectorTabLayout>
  );
}
