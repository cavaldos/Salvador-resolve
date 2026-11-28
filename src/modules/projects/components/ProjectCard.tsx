import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router";
import { Clapperboard, MoreVertical, Check, Calendar, Layers, Play } from "lucide-react";
import type { Project } from "../types";
import {
  getProjectDuration,
  formatDuration,
  formatDate,
} from "../utils/project-utils";
import { useProjectThumbnail } from "../hooks/useProjectThumbnail";
import { ProjectActionMenu } from "./ProjectActionMenu";
import { cn } from "@/shared/utils/cn";

export interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, currentName: string, e: React.MouseEvent) => void;
  onDuplicate: (id: string, e: React.MouseEvent) => void;
  onInfo: (project: Project, e: React.MouseEvent) => void;
}

export function ProjectCard({
  project,
  isSelected,
  onToggleSelect,
  onDelete,
  onRename,
  onDuplicate,
  onInfo,
}: ProjectCardProps) {
  const thumbUrl = useProjectThumbnail(project);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const durationSec = useMemo(() => getProjectDuration(project), [project]);
  const durationStr = useMemo(() => formatDuration(durationSec), [durationSec]);
  const dateStr = useMemo(
    () => formatDate(project.createdAt || project.updatedAt),
    [project.createdAt, project.updatedAt],
  );

  const updateMenuPlacement = () => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpwards(spaceBelow < 200);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    updateMenuPlacement();
    const handleScrollOrResize = () => {
      updateMenuPlacement();
    };
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("touchstart", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("touchstart", handleClick);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn("group relative", menuOpen ? "z-30" : "z-0")}
      data-state={menuOpen ? "open" : "closed"}
    >
      <div className="rounded-2xl border border-studio-border bg-studio-panel p-2 transition-colors group-hover:border-cyan-500/55">
        <Link className="block" to={`/editor?project=${project.id}`}>
          <div
            className={cn(
              "bg-studio-bg relative aspect-video overflow-hidden rounded-xl transition-all duration-200",
              isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <div className="absolute inset-0">
              {thumbUrl ? (
                <img
                  alt="Project thumbnail"
                  decoding="async"
                  data-nimg="fill"
                  className="object-cover h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
                  src={thumbUrl}
                  style={{
                    position: "absolute",
                    height: "100%",
                    width: "100%",
                    inset: "0px",
                    color: "transparent",
                  }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-muted/60">
                  <Clapperboard className="h-12 w-12 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute top-2 left-2 flex gap-1.5 text-[10px] font-medium text-white [&>span]:flex [&>span]:items-center [&>span]:gap-1 [&>span]:rounded-md [&>span]:bg-black/75 [&>span]:px-1.5 [&>span]:py-0.5">
              <span>{project.settings.aspectRatio}</span>
              <span>{project.settings.fps} fps</span>
              <span className="text-cyan-200"><Layers className="size-3" aria-hidden="true" />{project.tracks.length}</span>
            </div>
            {thumbUrl && (
              <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full bg-cyan-400/80 text-cyan-950">
                <Play className="size-4 fill-current" aria-hidden="true" />
              </span>
            )}

            {/* Subtle primary tint when selected */}
            {isSelected && (
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
            )}

            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-sm">
              {durationStr}
            </div>
          </div>
        </Link>

        <div className="flex flex-col gap-1.5 px-2 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <Link className="block min-w-0 flex-1" to={`/editor?project=${project.id}`}>
              <h3 className="group-hover:text-foreground/90 line-clamp-2 text-sm leading-snug font-medium">
                {project.name}
              </h3>
            </Link>

            {/* 3-Dot Project Menu Button (Right side of project name) */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                aria-label="Project menu"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!menuOpen) {
                    updateMenuPlacement();
                  }
                  setMenuOpen(!menuOpen);
                }}
                className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <MoreVertical className="size-4" />
              </button>

              <ProjectActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                onSelect={(e) => onToggleSelect(project.id, e)}
                isSelected={isSelected}
                onRename={(e) => onRename(project.id, project.name, e)}
                onDuplicate={project.folder ? undefined : (e) => onDuplicate(project.id, e)}
                folderProject={Boolean(project.folder)}
                onInfo={(e) => onInfo(project, e)}
                onDelete={(e) => onDelete(project.id, e)}
                className={openUpwards ? "bottom-full mb-1.5" : "top-full mt-1.5"}
              />
            </div>
          </div>

          <Link className="block" to={`/editor?project=${project.id}`}>
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Calendar className="size-4" />
              <span>Created {dateStr}</span>
            </div>
          </Link>
        </div>
      </div>

      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`${isSelected ? "Deselect" : "Select"} ${project.name}`}
        data-state={isSelected ? "checked" : "unchecked"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect(project.id, e);
        }}
        className={cn(
          "absolute right-2 top-2 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isSelected
            ? "opacity-100"
            : "opacity-100 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100",
        )}
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-sm border shadow-xs transition-colors",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground",
          )}
        >
          {isSelected && <Check className="size-4" aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
