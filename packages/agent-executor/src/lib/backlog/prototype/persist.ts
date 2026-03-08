import * as path from 'path'
import type { BacklogItem } from '../../plan-types.js'
import { StateStore } from '../../state-store/index.js'
import type { IBacklogBoard } from '../backlog.js'

export function save(this: IBacklogBoard): void {
  new StateStore<BacklogItem[]>(path.join(this._stateDir, 'backlog.json')).saveSync(Array.from(this._items.values()));
}

export function load(this: IBacklogBoard): void {
  const items = new StateStore<BacklogItem[]>(path.join(this._stateDir, 'backlog.json')).loadSync();
  if (!items) return;
  this._items = new Map(items.map((i) => [i.id, i]));
  this._seq = items.length;
}
