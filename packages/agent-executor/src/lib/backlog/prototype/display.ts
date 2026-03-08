import type { ActorId, BacklogItemStatus, ChecklistDisplayItem } from '../../plan-types.js'
import type { IBacklogBoard } from '../backlog.js'

export function display(this: IBacklogBoard, title = 'SPRINT BACKLOG', storyId?: string): void {
  const items = storyId ? this.getByStory(storyId) : this.getAll();
  const displayItems: ChecklistDisplayItem[] = items.map((i) => ({
    status: i.status,
    owner:  i.owner,
    text:   i.waitingFor ? `${i.question}  ${this._waitingTag(i.waitingFor)}` : i.question,
    answer: i.answer,
  }));
  this._renderer.checklist(title, displayItems);
}

export function displayFiltered(this: IBacklogBoard, statusFilter: BacklogItemStatus[], title?: string): void {
  const items = this.getAll().filter((i) => statusFilter.includes(i.status));
  const label = title ?? `Items: ${statusFilter.join(', ')}`;
  const displayItems: ChecklistDisplayItem[] = items.map((i) => ({
    status: i.status,
    owner:  i.owner,
    text:   i.question,
    answer: i.answer,
  }));
  this._renderer.checklist(label, displayItems);
}

export function seedStandardItems(this: IBacklogBoard, storyId?: string): void {
  const ctx = storyId ? { storyId } : {} as { storyId?: string };

  const archApiId = this.add({ ...ctx, owner: 'architecture' as ActorId, question: 'REST vs GraphQL API contract strategy?' });
  const authId    = this.add({ ...ctx, owner: 'architecture' as ActorId, question: 'Authentication strategy (JWT / OAuth / session)?' });
  const dbId      = this.add({ ...ctx, owner: 'architecture' as ActorId, question: 'Database selection + schema ownership?' });

  this.add({ ...ctx, owner: 'backend' as ActorId,  question: 'ORM / query builder choice?',            waitingFor: dbId,      unblocks: [] });
  this.add({ ...ctx, owner: 'backend' as ActorId,  question: 'API endpoint design ready to start?',     waitingFor: archApiId, unblocks: [] });
  this.add({ ...ctx, owner: 'backend' as ActorId,  question: 'Auth middleware confirmed?',              waitingFor: authId,    unblocks: [] });

  const dsId = this.add({ ...ctx, owner: 'frontend' as ActorId, question: 'Design system decision (Tailwind / MUI / custom)?' });
  this.add({ ...ctx, owner: 'frontend' as ActorId, question: 'API integration pattern (REST client / GraphQL / tRPC)?', waitingFor: archApiId });
  this.add({ ...ctx, owner: 'frontend' as ActorId, question: 'Auth flow UX (login page / redirect / modal)?',           waitingFor: authId });
  this.add({ ...ctx, owner: 'frontend' as ActorId, question: 'Component library approach confirmed?',  waitingFor: dsId });

  const coverageId = this.add({ ...ctx, owner: 'ba' as ActorId, question: 'Coverage target defined (e.g. 80% unit)?' });
  this.add({ ...ctx, owner: 'testing' as ActorId, question: 'Unit test framework confirmed (jest / vitest)?', waitingFor: coverageId });
  this.add({ ...ctx, owner: 'testing' as ActorId, question: 'Integration test scope: which services/endpoints?',        waitingFor: dbId });
  this.add({ ...ctx, owner: 'e2e' as ActorId,     question: 'E2E tool confirmed (Playwright / Cypress)?',               waitingFor: coverageId });
  this.add({ ...ctx, owner: 'e2e' as ActorId,     question: 'E2E scope: which user journeys to cover?' });

  this.add({ ...ctx, owner: 'ba' as ActorId, question: 'Acceptance criteria documented per story?' });
  this.add({ ...ctx, owner: 'ba' as ActorId, question: 'Definition of Done agreed?' });
}
