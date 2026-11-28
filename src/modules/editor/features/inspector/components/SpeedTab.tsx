import { Snowflake, Repeat2 } from "lucide-react";
import type { TimelineClip } from "@/modules/editor/types";
import { useProjectStore } from "@/modules/projects";
import { Slider } from "@/shared/components/ui/Slider";
import { InspectorSegments, InspectorTabLayout, inspectorSliderStyle, inspectorValueClass } from "./InspectorTabLayout";

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const MIN_SPEED = 0.1;
const MAX_SPEED = 4;

export function SpeedTab({ clip }: { clip: TimelineClip }) {
  const updateClip = useProjectStore((state) => state.updateClip);
  const currentSpeed = clip.speed ?? 1;

  const changeSpeed = (value: number) => {
    if (!Number.isFinite(value)) return;
    const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(value.toFixed(2))));
    if (speed === currentSpeed) return;
    updateClip(clip.id, { speed, timelineDuration: Math.max(0.1, clip.sourceDuration / speed) });
  };

  return (
    <InspectorTabLayout header={<InspectorSegments label="Speed mode" items={["Standard", "Curve", "Velocity"]} />} onReset={() => changeSpeed(1)}>
      <div className="space-y-4 text-xs">
        <div>
          <p className="mb-1.5 font-medium">Speed</p>
          <div className="flex items-center gap-3">
            <Slider {...inspectorSliderStyle} aria-label="Speed multiplier slider" value={currentSpeed} min={MIN_SPEED} max={MAX_SPEED} step={0.05} onValueChange={changeSpeed} />
            <label className="relative shrink-0">
              <input key={currentSpeed} type="number" aria-label="Speed multiplier" min={MIN_SPEED} max={MAX_SPEED} step={0.05} defaultValue={currentSpeed.toFixed(2)} onBlur={(event) => {
                changeSpeed(event.currentTarget.valueAsNumber);
                event.currentTarget.value = currentSpeed.toFixed(2);
              }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className={`${inspectorValueClass} pr-5`} />
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-studio-muted" aria-hidden="true">×</span>
            </label>
          </div>
        </div>
        <div>
          <p className="mb-1.5 font-medium">Duration</p>
          <div className="flex items-center gap-3">
            <span className="h-0.5 flex-1 rounded-full bg-studio-border-strong" aria-hidden="true" />
            <output aria-label="Timeline duration" className={inspectorValueClass}>{clip.timelineDuration.toFixed(2)} s</output>
          </div>
        </div>
        <div className="space-y-2 border-b border-studio-border pb-3">
          <p className="font-medium">Playback</p>
          <div className="flex justify-between text-studio-muted">
            <button type="button" disabled className="flex items-center gap-2 opacity-65" title="Reverse is not available"><Repeat2 className="size-7 rounded-md border border-studio-border p-1.5" aria-hidden="true" /> Reverse</button>
            <button type="button" disabled className="flex items-center gap-2 opacity-65" title="Freeze is not available">Freeze <Snowflake className="size-7 rounded-md border border-studio-border p-1.5" aria-hidden="true" /></button>
          </div>
        </div>
        {clip.type === "audio" || clip.type === "video" ? (
          <label title="Pitch adjustment is not available" className="flex items-center justify-between text-studio-muted">
            Change audio pitch<input type="checkbox" role="switch" className="h-5 w-9 appearance-none rounded-full bg-studio-hover before:m-0.5 before:block before:size-4 before:rounded-full before:bg-studio-muted" disabled />
          </label>
        ) : null}
        <details className="text-studio-muted">
          <summary className="cursor-pointer">Speed presets</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {SPEED_PRESETS.map((speed) => <button key={speed} type="button" aria-pressed={Math.abs(currentSpeed - speed) < 0.02} onClick={() => changeSpeed(speed)} className="cursor-pointer rounded-md border border-studio-border px-2 py-1 hover:bg-studio-hover aria-pressed:bg-studio-hover aria-pressed:text-studio-fg">{speed}×</button>)}
          </div>
        </details>
      </div>
    </InspectorTabLayout>
  );
}
