import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { db } from '@/modules/core/db/database';
import { persistProject } from './folder-project-service';
import { useToastStore } from '@/shared/components/ui/Toast/useToastStore';
import type { Project } from '../types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

class AutosaveService {
  private status: SaveStatus = 'idle';
  private pendingProject: Project | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private savingFolder = false;
  private closing = false;
  private listeners = new Set<(status: SaveStatus) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushPendingSaveSync();
      });
      if (isTauri()) {
        void getCurrentWindow().onCloseRequested(async (event) => {
          if (this.closing) {
            event.preventDefault();
            return;
          }
          if (!this.savingFolder && !this.pendingProject?.folder) return;
          this.closing = true;
          try {
            await this.executeSave();
            if (!this.canLeaveFolder()) event.preventDefault();
          } finally {
            this.closing = false;
          }
        }).catch((error) => console.error('Could not register project close handler:', error));
      }
    }
  }

  public subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }

  public getStatus(): SaveStatus {
    return this.status;
  }

  public scheduleSave(project: Project, delayMs = 1000): void {
    this.pendingProject = project;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.setStatus('saving');

    this.timer = setTimeout(() => {
      this.executeSave();
    }, delayMs);
  }

  public executeSave(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight ??= this.savePendingProjects().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  public canLeaveFolder(): boolean {
    if (!this.pendingProject?.folder || this.status !== 'error') return true;
    if (!window.confirm('The project could not be saved. Leave without saving these changes?')) return false;
    this.pendingProject = null;
    this.setStatus('idle');
    return true;
  }

  private async savePendingProjects(): Promise<void> {
    while (this.pendingProject) {
      const project = this.pendingProject;
      this.pendingProject = null;
      this.savingFolder = Boolean(project.folder);
      this.setStatus('saving');
      try {
        await persistProject({ ...project, updatedAt: Date.now() });
      } catch (error) {
        console.error('Failed to autosave project:', error);
        if (project.folder) this.pendingProject ??= project;
        this.setStatus('error');
        const detail = typeof error === 'string' ? `: ${error}` : '';
        useToastStore.getState().showToast(`Failed to save project${detail}`, 'error');
        return;
      } finally {
        this.savingFolder = false;
      }
      if (!this.pendingProject) this.setStatus('saved');
    }
  }

  public flushPendingSaveSync(): void {
    if (this.pendingProject && !this.pendingProject.folder) {
      const projectToSave = this.pendingProject;
      const updatedProject: Project = {
        ...projectToSave,
        updatedAt: Date.now(),
      };
      db.projects.put(updatedProject).catch((err) => {
        console.error('Failed sync flush save:', err);
      });
    }
  }
}

export const autosaveService = new AutosaveService();
