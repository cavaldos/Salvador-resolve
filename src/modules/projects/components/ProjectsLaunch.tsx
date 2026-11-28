import { useRef } from "react";
import { Camera, ChevronDown, FileCode2, FolderOpen, LayoutTemplate, Plus, Smartphone, Video } from "lucide-react";
import { POPULAR_FORMATS } from "@/modules/editor/features/inspector/constants/canvasPresets";
import type { ProjectSettings } from "../types";

const launchFormats = POPULAR_FORMATS.filter(({ ratio }) => ["16:9", "9:16", "1:1", "21:9"].includes(ratio));
const formatTitles = ["Widescreen", "Vertical", "Square", "Ultra-Wide"];
const formatSubtitles = ["YouTube", "Reels", "Social Feed", "Cinematic"];
const actionClass = "flex w-full items-center gap-3 rounded-xl border border-studio-border bg-studio-panel-raised/65 px-3.5 py-2.5 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-studio-hover disabled:text-studio-muted";

export function ProjectsLaunch({ busy, onCreate, onImport, onRecord }: {
  busy: boolean;
  onCreate: (settings?: Partial<ProjectSettings>) => void;
  onImport: (files: File[]) => void;
  onRecord: (mode: "screen" | "camera") => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const formatsMenu = useRef<HTMLDetailsElement>(null);
  const createFromFormat = ({ width, height, ratio }: (typeof launchFormats)[number]) => {
    formatsMenu.current?.removeAttribute("open");
    onCreate({ width, height, aspectRatio: ratio });
  };

  return (
    <>
      <section aria-labelledby="launch-title" className="grid items-center gap-6 rounded-2xl border border-studio-border bg-studio-panel bg-[radial-gradient(ellipse_at_top,rgba(34,182,211,0.12),transparent_53%)] p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(210px,24%)] lg:gap-10 lg:p-8">
        <div>
          <h2 id="launch-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Start a new project</h2>
          <p className="mt-2 text-sm text-studio-muted sm:text-base">Begin with a 16:9 landscape canvas, or choose a format for your video.</p>
          <div className="mt-5 grid max-w-2xl grid-cols-2 gap-2.5 lg:grid-cols-4">
            {launchFormats.map((format, index) => (
              <button key={format.ratio} type="button" disabled={busy} onClick={() => createFromFormat(format)} className="min-w-0 rounded-xl border border-studio-border bg-studio-panel-raised/60 p-3 text-left transition-colors enabled:cursor-pointer enabled:hover:border-cyan-500/60 enabled:hover:bg-studio-hover">
                <span className="mb-2 flex items-center justify-between gap-1">
                  <format.Icon className="size-4" aria-hidden="true" />
                  <span className="rounded bg-studio-bg/65 px-1.5 py-0.5 font-mono text-[10px] text-studio-muted">{format.ratio}</span>
                </span>
                <span className="block text-xs font-semibold sm:text-sm">{format.ratio} {formatTitles[index]}</span>
                <span className="mt-0.5 block text-xs text-studio-muted">{formatSubtitles[index]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex min-h-10 rounded-xl bg-[#7edbed] text-[#09252b]">
            <button type="button" disabled={busy} onClick={() => onCreate()} className="flex flex-1 items-center justify-center gap-2 rounded-l-xl px-3 text-sm font-semibold enabled:cursor-pointer enabled:hover:bg-white/25">
              <Plus className="size-4" aria-hidden="true" /> {busy ? "Preparing…" : "New Project"}
            </button>
            <details ref={formatsMenu} className="relative" onKeyDown={(event) => {
              if (event.key === "Escape" && formatsMenu.current?.open) {
                event.stopPropagation();
                formatsMenu.current.open = false;
                formatsMenu.current.querySelector("summary")?.focus();
              }
            }}>
              <summary aria-label="Project formats" className="grid h-full w-9 cursor-pointer list-none place-items-center rounded-r-xl border-l border-black/20 hover:bg-white/25 [&::-webkit-details-marker]:hidden"><ChevronDown className="size-4" aria-hidden="true" /></summary>
              <div className="absolute top-full right-0 z-10 mt-1 w-44 rounded-xl border border-studio-border bg-studio-panel p-1 text-studio-fg shadow-lg">
                {launchFormats.map((format, index) => (
                  <button key={format.ratio} type="button" disabled={busy} onClick={() => createFromFormat(format)} className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs hover:bg-studio-hover">{format.ratio} {formatTitles[index]}</button>
                ))}
              </div>
            </details>
          </div>
          <input ref={picker} type="file" hidden multiple accept="video/*,image/*,audio/*" onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) onImport(files);
          }} />
          <button type="button" disabled={busy} onClick={() => picker.current?.click()} className={actionClass}>
            <FolderOpen className="size-4 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
            <span><span className="block text-sm font-semibold">Import Media</span><span className="block text-xs text-studio-muted">Start from your media files</span></span>
          </button>
          <button type="button" disabled className={actionClass}>
            <FileCode2 className="size-4 shrink-0" aria-hidden="true" />
            <span><span className="block text-sm font-semibold">Open Project File</span><span className="block text-xs">Not available in Cutnora</span></span>
          </button>
          <button type="button" disabled className={actionClass}>
            <LayoutTemplate className="size-4 shrink-0" aria-hidden="true" />
            <span><span className="block text-sm font-semibold">Templates</span><span className="block text-xs">Not available in Cutnora</span></span>
          </button>
        </div>
      </section>
      <section aria-labelledby="capture-title">
        <h2 id="capture-title" className="mb-3 text-xs font-semibold tracking-wider text-studio-muted uppercase">Studio Capture Tools</h2>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={() => onRecord("screen")} className={`${actionClass} bg-studio-panel`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-red-400/25 bg-red-400/10 text-red-600 dark:text-red-300"><Video className="size-5" aria-hidden="true" /></span>
            <span><span className="block text-sm font-semibold">Record Screen</span><span className="mt-0.5 block text-xs text-studio-muted">Capture your display</span></span>
          </button>
          <button type="button" disabled={busy} onClick={() => onRecord("camera")} className={`${actionClass} bg-studio-panel`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300"><Camera className="size-5" aria-hidden="true" /></span>
            <span><span className="block text-sm font-semibold">Camera Booth</span><span className="mt-0.5 block text-xs text-studio-muted">Record with your webcam</span></span>
          </button>
          <button type="button" disabled className={`${actionClass} bg-studio-panel`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"><Smartphone className="size-5" aria-hidden="true" /></span>
            <span><span className="block text-sm font-semibold">Phone Transfer</span><span className="mt-0.5 block text-xs">Not available in Cutnora</span></span>
          </button>
        </div>
      </section>
    </>
  );
}
