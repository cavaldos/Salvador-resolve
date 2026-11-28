import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import { chooseProjectFolder } from "@/modules/projects/services/folder-project-service";
import { ProjectsLaunch } from "@/modules/projects/components/ProjectsLaunch";
import type { ProjectSettings } from "@/modules/projects/types";
import { autosaveService } from "@/modules/projects/services/autosave-service";
import { useMediaImporter } from "@/modules/editor/features/media-library/hooks/useMediaImporter";
import { useEditorUIStore } from "@/modules/editor/store/useEditorUIStore";
import { useToastStore } from "@/shared/components/ui/Toast/useToastStore";
import { Clapperboard, Plus, SearchX } from "lucide-react";
import {
  ProjectsHeader,
  ProjectsSubheader,
  ProjectCard,
  ProjectListRow,
  RenameModal,
  ProjectInfoModal,
  DeleteProjectModal,
  useProjects,
  useProjectStore,
} from "@/modules/projects";

function ProjectGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-3 animate-pulse">
          <div className="aspect-video w-full rounded-2xl bg-muted/40" />
          <div className="flex flex-col gap-2 pt-1">
            <div className="h-4 w-3/4 rounded-md bg-muted/40" />
            <div className="h-3 w-1/3 rounded-md bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="flex flex-col border-t border-border w-full max-w-full">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/40 animate-pulse">
          <div className="size-5 rounded-sm bg-muted/30 shrink-0" />
          <div className="h-10 w-16 rounded-md bg-muted/40 shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <div className="h-3.5 w-1/3 rounded-md bg-muted/40" />
            <div className="h-2.5 w-1/5 rounded-md bg-muted/30" />
          </div>
          <div className="size-6 rounded-md bg-muted/20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function ProjectsDashboardPage() {
  const {
    isLoading,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortOrder,
    sortMenuOpen,
    setSortMenuOpen,
    selectedIds,
    filteredAndSortedProjects,
    isAllSelected,
    toggleSelectAll,
    toggleSelectProject,
    handleSelectSort,
    handleToggleSortOrder,
    handleDeleteProject,
    handleDuplicateProject,
    handleBatchDelete,
    handleBatchDuplicate,
    renameTarget,
    setRenameTarget,
    handleOpenRename,
    handleSaveRename,
    infoProject,
    setInfoProject,
    handleOpenInfo,
    deleteTarget,
    setDeleteTarget,
    handleConfirmDelete,
  } = useProjects();

  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);

  const { importFiles } = useMediaImporter();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async (settings?: Partial<ProjectSettings>, files?: File[], record?: "screen" | "camera") => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const project = await createProject("Untitled video", settings);
      if (files) {
        await importFiles(files);
        if (useProjectStore.getState().currentProject?.id !== project.id) return;
        await autosaveService.executeSave();
        if (autosaveService.getStatus() === "error") return;
      }
      if (record) useEditorUIStore.getState().setActiveTool("record");
      navigate(`/editor?project=${project.id}${record ? `&record=${record}` : ""}`);
    } catch (error) {
      console.error("Failed to prepare project:", error);
      useToastStore.getState().showToast("Could not prepare the project.", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenFolder = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const project = await chooseProjectFolder();
      if (project) navigate(`/editor?project=${project.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useToastStore.getState().showToast(`Could not open folder: ${message}`, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sortMenuOpen) setSortMenuOpen(false);
        else if (searchQuery) setSearchQuery("");
      }
    },
    [sortMenuOpen, searchQuery, setSortMenuOpen, setSearchQuery],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-hidden bg-studio-bg text-studio-fg">
      <ProjectsHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="app-custom-scrollbar min-h-0 flex-1 overflow-y-auto" aria-busy={isLoading || isCreating}>
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10">
          <ProjectsLaunch
            busy={isCreating}
            onCreate={(settings) => void handleCreateProject(settings)}
            onImport={(files) => void handleCreateProject(undefined, files)}
            onOpenFolder={isTauri() ? () => void handleOpenFolder() : undefined}
            onRecord={(record) => void handleCreateProject(undefined, undefined, record)}
          />
          <section aria-labelledby="recent-projects-title" inert={isCreating} className="min-w-0">
            <ProjectsSubheader
              projectCount={filteredAndSortedProjects.length}
              isAllSelected={isAllSelected}
              selectedCount={selectedIds.length}
              onToggleSelectAll={toggleSelectAll}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSelectSort={handleSelectSort}
              onToggleSortOrder={handleToggleSortOrder}
              sortMenuOpen={sortMenuOpen}
              onSortMenuOpenChange={setSortMenuOpen}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBatchDuplicate={handleBatchDuplicate}
              onBatchDelete={handleBatchDelete}
            />

              {isLoading ? (
                viewMode === "grid" ? <ProjectGridSkeleton /> : <ProjectListSkeleton />
              ) : filteredAndSortedProjects.length === 0 ? (
                <div className="flex-1 w-full p-8 text-center sm:p-14 flex flex-col items-center justify-center min-h-0">
                  {searchQuery ? (
                    <SearchX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  ) : (
                    <Clapperboard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  )}
                  <h3 className="text-base font-semibold text-foreground">
                    {searchQuery ? "No matching projects found" : "No projects yet"}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-md">
                    {searchQuery
                      ? `No projects matching "${searchQuery}". Try a different search.`
                      : "Create your first video project to get started."}
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-3">
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="rounded-xl border border-border px-4 py-2 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        Clear search
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => void handleCreateProject()}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#7edbed] px-5 py-2.5 text-sm font-semibold text-[#09252b] transition-colors hover:bg-[#9ee7f4] disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4 stroke-[2.5]" /> New project
                    </button>
                  </div>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAndSortedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isSelected={selectedIds.includes(project.id)}
                      onToggleSelect={toggleSelectProject}
                      onDelete={handleDeleteProject}
                      onRename={handleOpenRename}
                      onDuplicate={handleDuplicateProject}
                      onInfo={handleOpenInfo}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col border-t border-border w-full max-w-full">
                  {filteredAndSortedProjects.map((project) => (
                    <ProjectListRow
                      key={project.id}
                      project={project}
                      isSelected={selectedIds.includes(project.id)}
                      onToggleSelect={toggleSelectProject}
                      onDelete={handleDeleteProject}
                      onRename={handleOpenRename}
                      onDuplicate={handleDuplicateProject}
                      onInfo={handleOpenInfo}
                    />
                  ))}
                </div>
              )}
          </section>
        </div>
      </main>

      {/* Modals */}
      <RenameModal
        isOpen={Boolean(renameTarget)}
        initialName={renameTarget?.name || ""}
        onClose={() => setRenameTarget(null)}
        onSave={handleSaveRename}
      />

      <ProjectInfoModal
        project={infoProject}
        onClose={() => setInfoProject(null)}
      />

      <DeleteProjectModal
        isOpen={Boolean(deleteTarget)}
        project={deleteTarget?.type === "single" ? deleteTarget.project : null}
        batchCount={deleteTarget?.type === "batch" ? deleteTarget.batchCount : 0}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
