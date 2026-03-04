/**
 * Backlog — Shared checklist for Phase 1 (Sprint Planning)
 *
 * The backlog collects every requirement/concern/question that agents
 * raise during plan synthesis.  Items are resolved as answers arrive.
 * Dependency tracking ensures items only become "ready" when their
 * prerequisites are satisfied.
 *
 * The BacklogBoard is the single source of truth during Phases 1–3.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  BacklogItem,
  BacklogItemStatus,
  ActorId,
  ChecklistDisplayItem,
} from './plan-types.js';
import { ChatRenderer } from './chat-renderer.js';

// ─── BacklogBoard ─────────────────────────────────────────────────────────────

export class BacklogBoard {
  private items: Map<string, BacklogItem> = new Map();
  private readonly stateDir: string;
  private readonly renderer: ChatRenderer;
  private seq = 0;

  constructor(renderer: ChatRenderer, projectRoot: string) {
    this.renderer = renderer;
    this.stateDir = path.join(projectRoot, '.agents', 'plan-state');
  }

  // ─── Mutation ──────────────────────────────────────────────────────────────

  /**
   * Add an item to the backlog.  Returns the generated item id.
   */
  add(params: {
    owner: ActorId;
    question: string;
    storyId?: string;
    waitingFor?: string;
    unblocks?: string[];
  }): string {
    const id = `bl-${++this.seq}`;
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
    this.items.set(id, item);
    return id;
  }

  /**
   * Mark an item as answered.  Automatically unblocks any items that
   * declared they were waiting for this one.
   */
  resolve(id: string, answer: string): void {
    const item = this._require(id);
    item.status = 'answered';
    item.answer = answer;
    item.resolvedAt = new Date().toISOString();

    // Cascade unblocks
    if (item.unblocks) {
      for (const unblockId of item.unblocks) {
        const downstream = this.items.get(unblockId);
        if (downstream && downstream.status === 'blocked') {
          downstream.status = 'open';
          downstream.waitingFor = undefined;
        }
      }
    }
    this._save();
  }

  /**
   * Skip an item (user declared out of scope or not relevant).
   */
  skip(id: string): void {
    const item = this._require(id);
    item.status = 'skipped';
    item.resolvedAt = new Date().toISOString();
    this._save();
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  getAll(): BacklogItem[] {
    return Array.from(this.items.values());
  }

  getOpen(): BacklogItem[] {
    return this.getAll().filter((i) => i.status === 'open');
  }

  getBlocked(): BacklogItem[] {
    return this.getAll().filter((i) => i.status === 'blocked');
  }

  getByOwner(actor: ActorId): BacklogItem[] {
    return this.getAll().filter((i) => i.owner === actor);
  }

  getByStory(storyId: string): BacklogItem[] {
    return this.getAll().filter((i) => i.storyId === storyId);
  }

  isReadyToExecute(): boolean {
    return this.getOpen().length === 0 && this.getBlocked().length === 0;
  }

  progress(): { done: number; total: number; pct: number } {
    const all = this.getAll();
    const done = all.filter((i) => i.status === 'answered' || i.status === 'skipped').length;
    return { done, total: all.length, pct: all.length > 0 ? Math.round((done / all.length) * 100) : 0 };
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  /**
   * Print all items as a colored checklist, optionally filtered by story.
   */
  display(title = 'SPRINT BACKLOG', storyId?: string): void {
    const items = storyId ? this.getByStory(storyId) : this.getAll();
    const display: ChecklistDisplayItem[] = items.map((i) => ({
      status: i.status,
      owner:  i.owner,
      text:   i.waitingFor ? `${i.question}  ${this._waitingTag(i.waitingFor)}` : i.question,
      answer: i.answer,
    }));
    this.renderer.checklist(title, display);
  }

  /**
   * Print only items of a specific status.
   */
  displayFiltered(statusFilter: BacklogItemStatus[], title?: string): void {
    const items = this.getAll().filter((i) => statusFilter.includes(i.status));
    const label = title ?? `Items: ${statusFilter.join(', ')}`;
    const display: ChecklistDisplayItem[] = items.map((i) => ({
      status: i.status,
      owner:  i.owner,
      text:   i.question,
      answer: i.answer,
    }));
    this.renderer.checklist(label, display);
  }

  // ─── Pre-loaded items for Phase 1 ─────────────────────────────────────────

  /**
   * Seed the board with the standard per-agent requirements that every
   * plan needs answered before scheduling can begin.
   */
  seedStandardItems(storyId?: string): void {
    const ctx = storyId ? { storyId } : {};

    // Architecture must go first — most things depend on it
    const archApiId = this.add({ ...ctx, owner: 'architecture', question: 'REST vs GraphQL API contract strategy?' });
    const authId    = this.add({ ...ctx, owner: 'architecture', question: 'Authentication strategy (JWT / OAuth / session)?' });
    const dbId      = this.add({ ...ctx, owner: 'architecture', question: 'Database selection + schema ownership?' });

    // Backend depends on Arch decisions
    this.add({ ...ctx, owner: 'backend',  question: 'ORM / query builder choice?',            waitingFor: dbId,      unblocks: [] });
    this.add({ ...ctx, owner: 'backend',  question: 'API endpoint design ready to start?',     waitingFor: archApiId, unblocks: [] });
    this.add({ ...ctx, owner: 'backend',  question: 'Auth middleware confirmed?',              waitingFor: authId,    unblocks: [] });

    // Frontend depends on API contract + auth
    const dsId = this.add({ ...ctx, owner: 'frontend', question: 'Design system decision (Tailwind / MUI / custom)?' });
    this.add({ ...ctx, owner: 'frontend', question: 'API integration pattern (REST client / GraphQL / tRPC)?', waitingFor: archApiId });
    this.add({ ...ctx, owner: 'frontend', question: 'Auth flow UX (login page / redirect / modal)?',           waitingFor: authId });
    this.add({ ...ctx, owner: 'frontend', question: 'Component library approach confirmed?',  waitingFor: dsId });

    // Testing/E2E need backend + frontend to declare contracts first
    const coverageId = this.add({ ...ctx, owner: 'ba', question: 'Coverage target defined (e.g. 80% unit)?' });
    this.add({ ...ctx, owner: 'testing', question: 'Unit test framework confirmed (jest / vitest)?', waitingFor: coverageId });
    this.add({ ...ctx, owner: 'testing', question: 'Integration test scope: which services/endpoints?',        waitingFor: dbId });
    this.add({ ...ctx, owner: 'e2e',     question: 'E2E tool confirmed (Playwright / Cypress)?',               waitingFor: coverageId });
    this.add({ ...ctx, owner: 'e2e',     question: 'E2E scope: which user journeys to cover?' });

    // BA / PO items
    this.add({ ...ctx, owner: 'ba', question: 'Acceptance criteria documented per story?' });
    this.add({ ...ctx, owner: 'ba', question: 'Definition of Done agreed?' });
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _save(): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    const file = path.join(this.stateDir, 'backlog.json');
    fs.writeFileSync(file, JSON.stringify(Array.from(this.items.values()), null, 2));
  }

  load(): void {
    const file = path.join(this.stateDir, 'backlog.json');
    if (!fs.existsSync(file)) return;
    const items: BacklogItem[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
    this.items = new Map(items.map((i) => [i.id, i]));
    this.seq = items.length;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _require(id: string): BacklogItem {
    const item = this.items.get(id);
    if (!item) throw new Error(`BacklogBoard: item "${id}" not found`);
    return item;
  }

  private _waitingTag(waitingFor: string): string {
    return `[waiting: ${waitingFor}]`;
  }
}
