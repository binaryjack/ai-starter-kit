import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { IBacklogBoard } from '../../backlog/index.js'
import type { ActorId, DecisionOption, PendingDecision, PlanDefinition } from '../../plan-types.js'
import { ArchResolutionTier } from '../../resolution-tiers/arch-resolution-tier/index.js'
import { BAResolutionTier } from '../../resolution-tiers/ba-resolution-tier/index.js'
import type { ResolutionTier } from '../../resolution-tiers/resolution-tiers.types.js'
import type { ArbiterDecision, IArbiter } from '../arbiter.js'

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

export async function raise(
  this: IArbiter,
  params: {
    question: string;
    context: string;
    options: DecisionOption[];
    raisedBy: ActorId;
    affectedActors: ActorId[];
    blockedItemIds: string[];
    preferSimple?: boolean;
  },
): Promise<ArbiterDecision> {
  const r = this._renderer;
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

  for (const tier of this._tiers) {
    if (tier.canHandle(pending)) {
      const chosen = await tier.resolve(pending);
      if (chosen !== null) {
        const isBa   = tier instanceof (BAResolutionTier as unknown as new(...args: unknown[]) => ResolutionTier);
        const isArch = tier instanceof (ArchResolutionTier as unknown as new(...args: unknown[]) => ResolutionTier);
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

        return _record(this, pending, chosen, resolvedBy, rationale);
      }
    }
  }

  throw new Error(`Arbiter: no tier resolved "${params.question}"`);
}

export async function microAlign(
  this: IArbiter,
  actorA: ActorId,
  actorB: ActorId,
  topic: string,
  context: string,
): Promise<string> {
  const r = this._renderer;
  r.say('ba', `Micro-alignment: ${topic} \u2014 engaging ${actorA} \u2194 ${actorB}`);

  if (this._modelRouter) {
    try {
      const resp = await this._modelRouter.route('api-design', {
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

export function getDecisions(this: IArbiter): ArbiterDecision[] {
  return [...this._decisions];
}

export async function runStandardDecisions(
  this: IArbiter,
  plan: PlanDefinition,
  board: IBacklogBoard,
): Promise<void> {
  const r = this._renderer;
  r.say('ba', 'Running standard architecture decision points…');
  r.newline();

  const hasAgent = (id: ActorId) => plan.steps.some((s) => s.agent === id);

  await this.raise({
    ...COMMON_DECISIONS['api-style'],
    blockedItemIds: board.getAll()
      .filter((i) => i.question.toLowerCase().includes('api'))
      .map((i) => i.id),
  });

  await this.raise({
    ...COMMON_DECISIONS['auth-strategy'],
    blockedItemIds: board.getAll()
      .filter((i) => i.question.toLowerCase().includes('auth'))
      .map((i) => i.id),
  });

  if (hasAgent('backend')) {
    await this.raise({
      ...COMMON_DECISIONS['database'],
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('database') || i.question.toLowerCase().includes('orm'))
        .map((i) => i.id),
    });
  }

  if (hasAgent('frontend')) {
    await this.raise({
      ...COMMON_DECISIONS['css-approach'],
      blockedItemIds: board.getAll()
        .filter((i) => i.question.toLowerCase().includes('design system') || i.question.toLowerCase().includes('css'))
        .map((i) => i.id),
    });
  }

  this._save();
  r.say('ba', `Arbitration complete — ${this._decisions.length} decisions recorded.`);
  r.newline();
}

export function _save(this: IArbiter): void {
  fs.mkdirSync(this._stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(this._stateDir, 'decisions.json'),
    JSON.stringify(this._decisions, null, 2),
  );
}

function _record(
  self: IArbiter,
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
  self._decisions.push(d);
  return d;
}
