import { useEffect, useRef, useState } from "react";
import type { MediaAsset } from "@/modules/projects/types";
import { cn } from "@/shared/utils/cn";
import { getFilmstripFrameIndex, getVideoFilmstrip, MAX_FILMSTRIP_FRAMES } from "../utils/timeline-filmstrip";

interface TimelineFilmstripProps {
  videoAsset: MediaAsset | null;
  poster: string | null;
  sourceStart: number;
  sourceDuration: number;
  width: number;
  tileWidth: number;
  hasWaveform: boolean;
}

export function TimelineFilmstrip({
  videoAsset, poster, sourceStart, sourceDuration, width, tileWidth, hasWaveform,
}: TimelineFilmstripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [strip, setStrip] = useState<{ key: string; frames: string[] }>();
  // shortcut: use at most 32 thumbnails per clip until the strip can be virtualized by viewport.
  const tileCount = Math.min(MAX_FILMSTRIP_FRAMES, Math.max(1, Math.ceil(width / tileWidth)));
  const sampleCount = 2 ** Math.ceil(Math.log2(tileCount));
  const key = JSON.stringify([videoAsset?.id, sourceStart, sourceDuration]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !videoAsset) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { rootMargin: "80px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoAsset]);

  useEffect(() => {
    if (!videoAsset || !isVisible) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getVideoFilmstrip(videoAsset, sourceStart, sourceDuration, sampleCount).then((frames) => {
        if (!cancelled) setStrip({ key, frames });
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoAsset, sourceStart, sourceDuration, sampleCount, key, isVisible]);

  const frames = strip?.key === key ? strip.frames : [];
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-0 top-[18px] flex overflow-hidden bg-black/20", hasWaveform ? "bottom-3" : "bottom-0")}
    >
      {Array.from({ length: tileCount }, (_, i) => {
        const src = frames[getFilmstripFrameIndex(i, tileCount, frames.length)] || poster;
        return (
          <div
            key={i}
            className="min-w-0 flex-1 overflow-hidden border-r border-black/35 last:border-0"
          >
            {src && <img src={src} alt="" draggable={false} className="size-full object-cover" />}
          </div>
        );
      })}
    </div>
  );
}
