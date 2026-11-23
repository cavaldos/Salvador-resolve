import type { Project } from "./timeline/schema";

export class HistoryStack {
  private past: Project[] = [];
  private future: Project[] = [];
  private current: Project;

  constructor(initial: Project) {
    this.current = initial;
  }

  get present(): Project {
    return this.current;
  }

  push(next: Project): void {
    this.past.push(this.current);
    this.current = next;
    this.future = [];
  }

  undo(): Project | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.current);
    this.current = prev;
    return this.current;
  }

  redo(): Project | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
