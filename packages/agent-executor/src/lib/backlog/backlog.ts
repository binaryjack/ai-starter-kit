import * as path from 'path'
import type { ChatRenderer } from '../chat-renderer.js'
import type { ActorId, BacklogItem, BacklogItemStatus } from '../plan-types.js'
import './prototype/index.js'

export interface IBacklogBoard {
  _renderer: ChatRenderer;
  _stateDir: string;
  _items: Map<string, BacklogItem>;
  _seq: number;
  add(params: {
    owner: ActorId;
    question: string;
    storyId?: string;
    waitingFor?: string;
    unblocks?: string[];
  }): string;
  resolve(id: string, answer: string): void;
  skip(id: string): void;
  getAll(): BacklogItem[];
  getOpen(): BacklogItem[];
  getBlocked(): BacklogItem[];
  getByOwner(actor: ActorId): BacklogItem[];
  getByStory(storyId: string): BacklogItem[];
  isReadyToExecute(): boolean;
  progress(): { done: number; total: number; pct: number };
  display(title?: string, storyId?: string): void;
  displayFiltered(statusFilter: BacklogItemStatus[], title?: string): void;
  seedStandardItems(storyId?: string): void;
  save(): void;
  load(): void;
  _require(id: string): BacklogItem;
  _waitingTag(waitingFor: string): string;
}

export const BacklogBoard = function(
  this: IBacklogBoard,
  renderer: ChatRenderer,
  projectRoot: string,
) {
  this._renderer = renderer;
  this._stateDir = path.join(projectRoot, '.agents', 'plan-state');
  this._items = new Map<string, BacklogItem>();
  this._seq = 0;
} as unknown as {
  new(renderer: ChatRenderer, projectRoot: string): IBacklogBoard;
};
