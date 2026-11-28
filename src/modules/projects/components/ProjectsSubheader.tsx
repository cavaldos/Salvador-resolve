import { Check, Clock, Copy, Trash2 } from "lucide-react";
import type { SortOption, SortOrder } from "../hooks/useProjectSort";
import { ProjectsSortControls } from "./ProjectsSortControls";
import { ViewModeToggle } from "./ViewModeToggle";

export type { SortOption, SortOrder };

export interface ProjectsSubheaderProps {
  projectCount: number;
  isAllSelected: boolean;
  selectedCount: number;
  onToggleSelectAll: () => void;
  sortBy: SortOption;
  sortOrder: SortOrder;
  onSelectSort: (option: SortOption) => void;
  onToggleSortOrder: () => void;
  sortMenuOpen: boolean;
  onSortMenuOpenChange: (open: boolean) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onBatchDuplicate: () => void;
  onBatchDelete: () => void;
}

const actionClass = "grid size-8 cursor-pointer place-items-center rounded-lg border border-studio-border bg-studio-panel text-studio-muted hover:bg-studio-hover hover:text-studio-fg";

export function ProjectsSubheader({
  projectCount, isAllSelected, selectedCount, onToggleSelectAll,
  sortBy, sortOrder, onSelectSort, onToggleSortOrder, sortMenuOpen, onSortMenuOpenChange,
  viewMode, onViewModeChange, onBatchDuplicate, onBatchDelete,
}: ProjectsSubheaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="recent-projects-title" className="flex items-center gap-2 text-xs font-semibold tracking-wider text-studio-muted uppercase">
          <Clock className="size-4" aria-hidden="true" /> Recent Projects
          <span className="rounded-full border border-studio-border bg-studio-panel-raised px-1.5 py-0.5 font-mono text-[10px]">{projectCount}</span>
        </h2>
        {projectCount > 0 && (
          <button type="button" role="checkbox" aria-checked={isAllSelected ? true : selectedCount ? "mixed" : false} aria-label={isAllSelected ? "Deselect all projects" : "Select all projects"} title={isAllSelected ? "Deselect all" : "Select all"} onClick={onToggleSelectAll} className="grid size-5 cursor-pointer place-items-center rounded border border-studio-border-strong text-studio-muted hover:text-studio-fg">
            {(isAllSelected || selectedCount > 0) && <Check className="size-3.5" aria-hidden="true" />}
          </button>
        )}
        {selectedCount > 0 && (
          <>
            <span className="text-xs text-studio-muted">{selectedCount} selected</span>
            <button type="button" aria-label="Duplicate selected projects" onClick={onBatchDuplicate} className={actionClass}><Copy className="size-3.5" aria-hidden="true" /></button>
            <button type="button" aria-label="Delete selected projects" onClick={onBatchDelete} className={actionClass}><Trash2 className="size-3.5" aria-hidden="true" /></button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ProjectsSortControls sortBy={sortBy} sortOrder={sortOrder} onSelectSort={onSelectSort} onToggleSortOrder={onToggleSortOrder} sortMenuOpen={sortMenuOpen} onSortMenuOpenChange={onSortMenuOpenChange} />
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} size="sm" />
      </div>
    </div>
  );
}

export const StudioSubheader = ProjectsSubheader;
export type StudioSubheaderProps = ProjectsSubheaderProps;
