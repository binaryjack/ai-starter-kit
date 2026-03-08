import type { IBacklogBoard } from '../backlog.js';
import type { BacklogItem } from '../../plan-types.js';

export function _require(this: IBacklogBoard, id: string): BacklogItem {
  const item = this._items.get(id);
  if (!item) throw new Error(`BacklogBoard: item "${id}" not found`);
  return item;
}

export function _waitingTag(this: IBacklogBoard, waitingFor: string): string {
  return `[waiting: ${waitingFor}]`;
}
