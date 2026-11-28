import { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import { db } from "@/modules/core/db/database";
import { deleteStoredMediaAsset } from "@/modules/core/storage/media-asset-service";
import type { Project } from "../types";
import { useProjectSort } from "./useProjectSort";
import { generateDuplicateProjectName } from "../utils/project-utils";
import { persistProject, reopenFolderProject } from "../services/folder-project-service";
import { useToastStore } from "@/shared/components/ui/Toast/useToastStore";

export interface DeleteTarget {
  type: "single" | "batch";
  project?: Project;
  batchCount?: number;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [infoProject, setInfoProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      try {
        const list = await db.projects.orderBy("updatedAt").reverse().toArray();
        if (isMounted) {
          setProjects(list);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  const {
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    sortMenuOpen,
    setSortMenuOpen,
    handleSelectSort,
    handleToggleSortOrder,
    filteredAndSortedProjects,
  } = useProjectSort(projects, searchQuery);

  const isAllSelected =
    filteredAndSortedProjects.length > 0 &&
    filteredAndSortedProjects.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSortedProjects.map((p) => p.id));
    }
  };

  const toggleSelectProject = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDeleteProject = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const targetProject = projects.find((p) => p.id === id);
    if (targetProject) {
      setDeleteTarget({ type: "single", project: targetProject });
    }
  };

  const handleDuplicateProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceProject = projects.find((p) => p.id === id);
    if (!sourceProject || sourceProject.folder) return;

    const newId = nanoid();
    const newName = generateDuplicateProjectName(
      sourceProject.name,
      projects.map((p) => p.name),
    );
    const now = Date.now();

    const duplicatedProject: Project = {
      ...sourceProject,
      id: newId,
      name: newName,
      createdAt: now,
      updatedAt: now,
    };

    await db.projects.add(duplicatedProject);

    try {
      const sourceAssets = await db.assets
        .where("projectId")
        .equals(id)
        .toArray();
      for (const asset of sourceAssets) {
        await db.assets.add({
          ...asset,
          id: nanoid(),
          projectId: newId,
          createdAt: now,
        });
      }
    } catch (err) {
      console.error("Failed duplicating project assets:", err);
    }

    setProjects((prev) => [duplicatedProject, ...prev]);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setDeleteTarget({ type: "batch", batchCount: selectedIds.length });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    const ids = deleteTarget.type === "single"
      ? [deleteTarget.project?.id]
      : selectedIds;
    for (const id of ids) {
      if (!id) continue;
      const project = await db.projects.get(id);
      if (!project) continue;
      // Folder projects are only removed from Recents; imported media can still be referenced on disk.
      if (!project.folder) {
        const assets = await db.assets.where("projectId").equals(id).toArray();
        for (const asset of assets) await deleteStoredMediaAsset(asset);
      }
      await db.projects.delete(id);
    }
    setProjects((prev) => prev.filter((project) => !ids.includes(project.id)));
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    setDeleteTarget(null);
  };

  const handleBatchDuplicate = async () => {
    if (selectedIds.length === 0) return;
    const now = Date.now();
    const duplicatedList: Project[] = [];

    const currentNames = projects.map((p) => p.name);
    if (projects.some((project) => project.folder && selectedIds.includes(project.id))) {
      useToastStore.getState().showToast("Folder projects were not duplicated.", "warning");
    }

    for (const id of selectedIds) {
      const sourceProject = projects.find((p) => p.id === id);
      if (!sourceProject || sourceProject.folder) continue;

      const newId = nanoid();
      const newName = generateDuplicateProjectName(sourceProject.name, currentNames);
      currentNames.push(newName);

      const duplicatedProject: Project = {
        ...sourceProject,
        id: newId,
        name: newName,
        createdAt: now,
        updatedAt: now,
      };

      await db.projects.add(duplicatedProject);

      try {
        const sourceAssets = await db.assets
          .where("projectId")
          .equals(id)
          .toArray();
        for (const asset of sourceAssets) {
          await db.assets.add({
            ...asset,
            id: nanoid(),
            projectId: newId,
            createdAt: now,
          });
        }
      } catch (err) {
        console.error("Failed duplicating project assets:", err);
      }

      duplicatedList.push(duplicatedProject);
    }

    setProjects((prev) => [...duplicatedList, ...prev]);
    setSelectedIds([]);
  };

  const handleOpenRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameTarget({ id, name: currentName });
  };

  const handleSaveRename = async (newName: string) => {
    if (!renameTarget) return;
    if (newName && newName !== renameTarget.name) {
      try {
        const cached = await db.projects.get(renameTarget.id);
        if (!cached) return;
        const project = cached.folder ? await reopenFolderProject(cached.folder.id, cached.id) : cached;
        const renamed = { ...project, name: newName, updatedAt: Date.now() };
        await persistProject(renamed);
        setProjects((prev) => prev.map((p) => (p.id === renamed.id ? renamed : p)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        useToastStore.getState().showToast(`Could not rename project: ${message}`, "error");
        return;
      }
    }
    setRenameTarget(null);
  };

  const handleOpenInfo = (project: Project, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInfoProject(project);
  };

  return {
    projects,
    isLoading,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortOrder,
    setSortOrder,
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
  };
}

export const useStudioProjects = useProjects;
