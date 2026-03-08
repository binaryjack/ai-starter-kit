import type { ActorId, BacklogItem } from '../../plan-types.js'
import type { IBacklogBoard } from '../backlog.js'

export function getAll(this: IBacklogBoard): BacklogItem[] {
  return Array.from(this._items.values());
}

export function getOpen(this: IBacklogBoard): BacklogItem[] {
  return this.getAll().filter((i) => i.status === 'open');
}

export function getBlocked(this: IBacklogBoard): BacklogItem[] {
  return this.getAll().filter((i) => i.status === 'blocked');
}

export function getByOwner(this: IBacklogBoard, actor: ActorId): BacklogItem[] {
  return this.getAll().filter((i) => i.owner === actor);
}

export function getByStory(this: IBacklogBoard, storyId: string): BacklogItem[] {
  return this.getAll().filter((i) => i.storyId === storyId);
}

export function isReadyToExecute(this: IBacklogBoard): boolean {
  return this.getOpen().length === 0 && this.getBlocked().length === 0;
}

export function progress(this: IBacklogBoard): { done: number; total: number; pct: number } {
  const all = this.getAll();
  const done = all.filter((i) => i.status === 'answered' || i.status === 'skipped').length;
  return { done, total: all.length, pct: all.length > 0 ? Math.round((done / all.length) * 100) : 0 };
}
