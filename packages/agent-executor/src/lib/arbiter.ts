/**
 * Arbiter — Phase 3 conflict resolution + escalation chain
 *
 * Escalation chain:
 *   1. BA tries to resolve (prefers simpler, more standard option)
 *   2. If architectural: delegate to Architecture agent
 *   3. If still unresolved OR is a product decision: escalate to User (PO)
 *
 * After a decision is made, the Arbiter broadcasts the outcome to all
 * affected agents and triggers any micro-alignments needed.
 */

import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { BacklogBoard } from './backlog.js'
import { ChatRenderer, promptChoice } from './chat-renderer.js'
import type { ModelRouter } from './model-router.js'
import type {
    ActorId,
    DecisionOption,
    PendingDecision,
    PlanDefinition
} from './plan-types.js'
import {
    ArchResolutionTier,
    BAResolutionTier,
    POEscalationTier,
    ResolutionTier,
} from './resolution-tiers.js'

// ─── Decision registry ────────────────────────────────────────────────────────

export interface ArbiterDecision {
  id: string;
  question: string;
  raisedBy: ActorId;
  chosenOption: DecisionOption;
  resolvedBy: ActorId;  // 'ba' | 'architecture' | 'user'
  rationale: string;
  affectedActors: ActorId[];
  unlockedItems: string[];
  resolvedAt: string;
}

// ─── Pre-defined common conflicts ─────────────────────────────────────────────

const COMMON_DECISIONS: Record<string, Omit<PendingDecision, 'id' | 'raisedAt' | 'blockedItemIds'>> = {
  'api-style': {
    question: 'API communication style',
    context: 'The API style affects Frontend integration, Backend structure, and documentation strategy.',
    options: [
      { label: 'REST',     description: 'Standard HTTP verbs, OpenAPI spec', implications: 'Familiar, well-tooled, slightly verbose' },
      { label: 'GraphQL',  description: 'Schema-first, flexible queries',    implications: 'More powerful but higher complexity' },
      { label: 'tRPC',     description: 'Type-safe end-to-end TypeScript',   implications: 'Best for full-stack TypeScript, no client codegen' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'frontend', 'testing'],
  },
  'auth-strategy': {
    question: 'Authentication strategy',
    context: 'Auth affects every layer — API security, session handling, and frontend routing.',
    options: [
      { label: 'JWT stateless',  description: 'JSON Web Tokens, no server state',      implications: 'Simple to scale, harder to revoke' },
      { label: 'Session-based',  description: 'Server-side sessions (Redis / DB)',      implications: 'Easy revocation, requires session store' },
      { label: 'Auth0 / Clerk',  description: 'Managed identity provider',             implications: 'Fast to implement, vendor dependency' },
      { label: 'NextAuth / Lucia', description: 'Open-source auth library',             implications: 'Full control, more setup' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'frontend', 'security'],
  },
  'database': {
    question: 'Database engine',
    context: 'Database choice affects schema design, query patterns, and hosting.',
    options: [
      { label: 'PostgreSQL',  description: 'Relational, ACID, row-level security', implications: 'Best for structured data + complex queries' },
      { label: 'MongoDB',     description: 'Document store, flexible schema',       implications: 'Good for nested/variable data' },
      { label: 'SQLite',      description: 'Embedded, zero-config',                 implications: 'POC/solo use only — not production-scalable' },
      { label: 'PlanetScale', description: 'Serverless MySQL (Vitess)',              implications: 'Great for edge deployments' },
    ],
    raisedBy: 'architecture',
    affectedActors: ['backend', 'testing'],
  },
  'css-approach': {
    question: 'CSS / styling approach',
    context: 'Affects Frontend development velocity, bundle size, and design consistency.',
    options: [
      { label: 'Tailwind CSS',  description: 'Utility-first, zero runtime',     implications: 'Fast iteration, verbose HTML' },
      { label: 'CSS Modules',   description: 'Scoped CSS, build-time only',      implications: 'Clean, standard, more files' },
      { label: 'MUI / shadcn',  description: 'Full component library',           implications: 'Fastest UI, opinionated styling' },
      { label: 'Styled Components', description: 'CSS-in-JS',                   implications: 'Dynamic styles, runtime overhead' },
    ],
    raisedBy: 'frontend',
    affectedActors: ['frontend', 'e2e'],
  },
};

// ─── Arbiter ──────────────────────────────────────────────────────────────────

export class Arbiter {
  private readonly renderer: ChatRenderer;
  private readonly stateDir: string;
  private readonly modelRouter?: ModelRouter;
  private decisions: ArbiterDecision[] = [];
  private readonly tiers: ResolutionTier[];

  constructor(renderer: ChatRenderer, projectRoot: string, modelRouter?: ModelRouter, tiers?: ResolutionTier[]) {
    this.renderer    = renderer;
    this.stateDir    = path.join(projectRoot, '.agents', 'plan-state');
    this.modelRouter = modelRouter;
    this.tiers = tiers ?? [
      new BAResolutionTier(modelRouter),
      new ArchResolutionTier(modelRouter),
      new POEscalationTier(renderer, modelRouter),
    ];
  }

  // ─── Main entry: raise a decision ─────────────────────────────────────────

  async raise(params: {
    question: string;
    context: string;
    options: DecisionOption[];
    raisedBy: ActorId;
    affectedActors: ActorId[];
    blockedItemIds: string[];
    preferSimple?: boolean;
  }): Promise<ArbiterDecision> {
    const r = this.renderer;
    const pending: PendingDecision = {
      id: randomUUID(),
      question: params.question,
      context: params.context,
      options: params.options,
      raisedBy: params.raisedBy,
      affectedActors: params.affectedActors,
      blockedItemIds: params.blockedItemIds,
      raisedAt: new Date().toISOString(),
    };

    for (const tier of this.tiers) {
      if (tier.canHandle(pending)) {
        const chosen = await tier.resolve(pending);
        if (chosen !== null) {
          const isBa   = tier instanceof BAResolutionTier;
          const isArch = tier instanceof ArchResolutionTier;
          const resolvedBy: ActorId = isBa ? 'ba' : isArch ? 'architecture' : 'user';
          const rationale = isBa
            ? `BA resolved: ${chosen.implications}`
            : isArch
              ? `Architecture decided: ${chosen.implications}`
              : `PO decided: ${chosen.label}`;

          if (isBa) {
            r.say('ba', `I can resolve this: "${params.question}" → ${chosen.label}`);
            r.system(`Rationale: ${chosen.description} — ${chosen.implications}`);
            r.newline();
          } else if (isArch) {
            r.say('architecture', `Architecture recommendation: ${chosen.label} — ${chosen.description}`);
            r.say('ba', `Architecture has resolved this. Proceeding with: ${chosen.label}`);
            r.newline();
          }
          // PO tier (POEscalationTier) handles its own logging + broadcast internally

          return this._record(pending, chosen, resolvedBy, rationale);
        }
      }
    }

    // Should never be reached — POEscalationTier always resolves
    throw new Error(`Arbiter: no tier resolved "${params.question}"`);
  }

  // ─── Run standard decision set for a plan ────────────────────────────────

  async runStandardDecisions(
    plan: PlanDefinition,
    board: BacklogBoard,
  ): Promise<void> {
    const r = this.renderer;
    r.say('ba', 'Running standard architecture decision points…');
    r.newline();

    const hasAgent = (id: ActorId) => plan.steps.some((s) => s.agent === id);

    // Api style
    await this.raise({
      ...COMMON_DECISIONS['api-style'],
      id: undefined as never,
      raisedAt: undefined as never,
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('api'))
        .map((i) => i.id),
    } as Parameters<typeof this.raise>[0]);

    // Auth
    await this.raise({
      ...COMMON_DECISIONS['auth-strategy'],
      id: undefined as never,
      raisedAt: undefined as never,
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('auth'))
        .map((i) => i.id),
    } as Parameters<typeof this.raise>[0]);

    // Database (only if backend is in the plan)
    if (hasAgent('backend')) {
      await this.raise({
        ...COMMON_DECISIONS['database'],
        id: undefined as never,
        raisedAt: undefined as never,
        blockedItemIds: board.getAll()
          .filter((i) => i.question.toLowerCase().includes('database') || i.question.toLowerCase().includes('orm'))
          .map((i) => i.id),
      } as Parameters<typeof this.raise>[0]);
    }

    // CSS (only if frontend is in the plan)
    if (hasAgent('frontend')) {
      await this.raise({
        ...COMMON_DECISIONS['css-approach'],
        id: undefined as never,
        raisedAt: undefined as never,
        blockedItemIds: board.getAll()
          .filter((i) => i.question.toLowerCase().includes('design system') || i.question.toLowerCase().includes('css'))
          .map((i) => i.id),
      } as Parameters<typeof this.raise>[0]);
    }

    this._save();
    r.say('ba', `Arbitration complete — ${this.decisions.length} decisions recorded.`);
    r.newline();
  }

  // ─── Micro-alignment ──────────────────────────────────────────────────────

  /**
   * Run a targeted alignment between 2 agents after a key decision.
   * When ModelRouter is available, generates substantive alignment notes via LLM.
   */
  async microAlign(
    actorA: ActorId,
    actorB: ActorId,
    topic: string,
    context: string,
  ): Promise<string> {
    const r = this.renderer;
    r.say('ba', `Micro-alignment: ${topic} \u2014 engaging ${actorA} \u2194 ${actorB}`);

    if (this.modelRouter) {
      try {
        const resp = await this.modelRouter.route('api-design', {
          messages: [
            {
              role: 'system',
              content:
                'You are a Technical Architect facilitating alignment between two software agents. '
                + 'Write 2-3 brief bullet points describing what each agent needs to agree on at their '
                + 'shared boundary. Be concrete and specific to the topic. No markdown headers.',
            },
            {
              role: 'user',
              content: `Agents: ${actorA} and ${actorB}\nTopic: ${topic}\nContext: ${context}`,
            },
          ],
          maxTokens: 200,
        });
        const text = resp.content.trim();
        if (text.length > 10) {
          r.system(text);
          r.newline();
          return `${actorA} \u2194 ${actorB}: ${topic} \u2014 aligned`;
        }
      } catch { /* fall through to heuristic */ }
    }

    r.say(actorA, `Acknowledged. My concern on "${topic}": aligning on shared contract.`);
    r.say(actorB, `Confirmed. I'll consume the output from ${actorA} at this boundary.`);
    r.system(`✓ ${actorA} ↔ ${actorB} aligned on: ${topic}`);
    r.newline();
    return `${actorA} ↔ ${actorB}: ${topic} — aligned`;
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getDecisions(): ArbiterDecision[] { return [...this.decisions]; }


  // ─── Private helpers ──────────────────────────────────────────────────────────────────────

  private _record(
    pending: PendingDecision,
    chosen: DecisionOption,
    resolvedBy: ActorId,
    rationale: string,
  ): ArbiterDecision {
    const d: ArbiterDecision = {
      id: pending.id,
      question: pending.question,
      raisedBy: pending.raisedBy,
      chosenOption: chosen,
      resolvedBy,
      rationale,
      affectedActors: pending.affectedActors,
      unlockedItems: pending.blockedItemIds,
      resolvedAt: new Date().toISOString(),
    };
    this.decisions.push(d);
    return d;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private _save(): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.stateDir, 'decisions.json'),
      JSON.stringify(this.decisions, null, 2),
    );
  }
}
