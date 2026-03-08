import type { ActorId, BacklogItem } from '../../plan-types.js'
import type { IBacklogBoard } from '../backlog.js'

export function add(
  this: IBacklogBoard,
  params: {
    owner: ActorId;
    question: string;
    storyId?: string;
    waitingFor?: string;
    unblocks?: string[];
  },
): string {
  const id = `bl-${++this._seq}`;
  const item: BacklogItem = {
    id,
    owner: params.owner,
    question: params.question,
    storyId: params.storyId,
    waitingFor: params.waitingFor,
    unblocks: params.unblocks,
    status: params.waitingFor ? 'blocked' : 'open',
    createdAt: new Date().toISOString(),
  };
  this._items.set(id, item);
  return id;
}

export function resolve(this: IBacklogBoard, id: string, answer: string): void {
  const item = this._require(id);
  item.status = 'answered';
  item.answer = answer;
  item.resolvedAt = new Date().toISOString();

  if (item.unblocks) {
    for (const unblockId of item.unblocks) {
      const downstream = this._items.get(unblockId);
      if (downstream && downstream.status === 'blocked') {
        downstream.status = 'open';
        downstream.waitingFor = undefined;
      }
    }
  }
}

export function skip(this: IBacklogBoard, id: string): void {
  const item = this._require(id);
  item.status = 'skipped';
  item.resolvedAt = new Date().toISOString();
}
