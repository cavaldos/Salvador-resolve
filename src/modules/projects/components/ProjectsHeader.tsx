import { Clapperboard, Search, X } from "lucide-react";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { macWindowHeaderProps } from "@/shared/utils/mac-window-header";
import { version } from "../../../../package.json";

export interface ProjectsHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ProjectsHeader({ searchQuery, onSearchChange }: ProjectsHeaderProps) {
  return (
    <header className="shrink-0 border-b border-studio-border bg-studio-panel">
      <div {...macWindowHeaderProps} className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-8 lg:px-10 lg:py-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-studio-border bg-studio-panel-raised">
            <Clapperboard className="size-4" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg leading-tight font-semibold">Cutnora</h1>
              <span className="rounded-full border border-studio-border bg-studio-panel-raised px-2 py-0.5 font-mono text-[10px] text-studio-muted">v{version}</span>
            </div>
            <p className="text-xs text-studio-muted">Desktop Non-Linear Video Editor</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="relative flex-1 sm:w-56 lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-studio-muted" aria-hidden="true" />
            <input
              className="h-9 w-full rounded-xl border border-studio-border bg-studio-bg pr-9 pl-9 text-sm outline-none placeholder:text-studio-muted focus-visible:border-cyan-500"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search projects"
            />
            {searchQuery && (
              <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search query" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-studio-muted hover:text-studio-fg">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <ThemeToggle shape="square" className="shrink-0" />
        </div>
      </div>
    </header>
  );
}

export const StudioHeader = ProjectsHeader;
export type StudioHeaderProps = ProjectsHeaderProps;
