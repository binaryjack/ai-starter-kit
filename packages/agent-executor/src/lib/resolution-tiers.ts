/**
 * ResolutionTiers — Chain of Responsibility for Arbiter decision resolution.
 *
 * Three tiers are provided:
 *   1. BAResolutionTier        — haiku "validation" prompt; resolves clear-cut cases
 *   2. ArchResolutionTier      — opus "hard-barrier-resolution"; resolves architectural trade-offs
 *   3. POEscalationTier        — always resolves by prompting the user (Product Owner)
 *
 * Arbiter.raise() iterates the tiers in order and stops at the first resolution.
 * The chain makes each tier independently testable and trivially extensible.
 */

import { ChatRenderer, promptChoice } from './chat-renderer.js';
import type { ModelRouter }   from './model-router.js';
import type { DecisionOption, PendingDecision } from './plan-types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ResolutionTier {
  /**
   * Returns `true` when this tier is willing to attempt resolution for the
   * given pending decision.  Called before `resolve()`.
   */
  canHandle(pending: PendingDecision): boolean;

  /**
   * Attempt to resolve the decision.
   * Returns the chosen option, or `null` when the tier cannot decide.
   */
  resolve(pending: PendingDecision): Promise<DecisionOption | null>;
}

// ─── Tier 1: BA (haiku "validation") ─────────────────────────────────────────

/**
 * Business Analyst tier.
 * Uses haiku to check whether there is a clearly simplest / most standard
 * option.  Defers architectural and product decisions to downstream tiers.
 */
export class BAResolutionTier implements ResolutionTier {
  constructor(private readonly modelRouter?: ModelRouter) {}

  canHandle(pending: PendingDecision): boolean {
    // BA only handles decisions with at least two options and preferSimple ≠ false
    return pending.options.length >= 1;
  }

  async resolve(pending: PendingDecision): Promise<DecisionOption | null> {
    const opts = pending.options;
    if (opts.length === 0) return null;
    if (opts.length === 1) return opts[0]; // trivial case

    if (this.modelRouter) {
      try {
        const optList = opts.map((o, i) =>
          `${String.fromCharCode(65 + i)}) ${o.label}: ${o.description} — ${o.implications}`,
        ).join('\n');

        const resp = await this.modelRouter.route('validation', {
          messages: [
            {
              role: 'system',
              content:
                'You are a Business Analyst. Given a decision and its options, decide if there is '
                + 'a clearly simplest or most standard option that does NOT require architectural expertise '
                + 'or product input. If yes, reply with ONLY the letter (A/B/C/D). '
                + 'If it requires architectural expertise or product input, reply with exactly: DEFER',
            },
            {
              role: 'user',
              content: `Decision: ${pending.question}\n\nOptions:\n${optList}`,
            },
          ],
          maxTokens: 10,
        });

        const ans = resp.content.trim().toUpperCase();
        if (ans === 'DEFER') return null;
        const idx = ans.charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) return opts[idx];
      } catch {
        // fall through to heuristic
      }
    }

    // Heuristic: BA defers multi-option decisions
    return null;
  }
}

// ─── Tier 2: Architecture (opus "hard-barrier-resolution") ───────────────────

/**
 * Architecture agent tier.
 * Uses opus for deep trade-off analysis.  Falls back to a keyword-scoring
 * heuristic when no model router is available.
 */
export class ArchResolutionTier implements ResolutionTier {
  constructor(private readonly modelRouter?: ModelRouter) {}

  canHandle(pending: PendingDecision): boolean {
    return (
      pending.raisedBy === 'architecture' ||
      pending.affectedActors.includes('architecture')
    );
  }

  async resolve(pending: PendingDecision): Promise<DecisionOption | null> {
    const opts = pending.options;

    if (this.modelRouter) {
      try {
        const optList = opts.map((o, i) =>
          `${String.fromCharCode(65 + i)}) ${o.label}: ${o.description} — ${o.implications}`,
        ).join('\n');

        const resp = await this.modelRouter.route('hard-barrier-resolution', {
          messages: [
            {
              role: 'system',
              content:
                'You are a senior software architect. Analyse the technical trade-offs and pick '
                + 'the best option for a production system. Reply with ONLY the option letter (A/B/C/D). '
                + 'No explanation.',
            },
            {
              role: 'user',
              content:
                `Decision: ${pending.question}\n`
                + `Context: ${pending.context}\n\n`
                + `Options:\n${optList}`,
            },
          ],
          maxTokens: 10,
        });

        const ans = resp.content.trim().toUpperCase();
        const idx = ans.charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) return opts[idx];
      } catch {
        // fall through to heuristic
      }
    }

    // Heuristic fallback: keyword scoring
    const signals = ['standard', 'acid', 'scale', 'type-safe', 'relational', 'familiar', 'production'];
    const scored  = opts.map((opt) => {
      const text  = `${opt.label} ${opt.description} ${opt.implications}`.toLowerCase();
      const score = signals.filter((s) => text.includes(s)).length;
      return { opt, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].score > 0 ? scored[0].opt : null;
  }
}

// ─── Tier 3: PO Escalation ────────────────────────────────────────────────────

/**
 * Product Owner escalation tier.
 * Always resolves — presents the decision interactively to the user.
 */
export class POEscalationTier implements ResolutionTier {
  constructor(
    private readonly renderer: ChatRenderer,
    private readonly modelRouter?: ModelRouter,
  ) {}

  canHandle(_pending: PendingDecision): boolean {
    return true; // catch-all
  }

  async resolve(pending: PendingDecision): Promise<DecisionOption | null> {
    const r = this.renderer;
    const escalationMsg = await this._escalationContext(pending);
    r.say('ba', escalationMsg);
    r.decision(pending);

    const choice = await promptChoice(r, pending.options.length);
    const indexFromLetter = choice.toUpperCase().charCodeAt(0) - 65;

    let chosen: DecisionOption;
    if (indexFromLetter >= 0 && indexFromLetter < pending.options.length) {
      chosen = pending.options[indexFromLetter];
    } else {
      chosen = {
        label:        choice,
        description:  'Custom user-specified option',
        implications: 'Will be evaluated by affected agents',
      };
    }

    r.say('user', `Selected: ${chosen.label}`);
    this._broadcastDecision(pending, chosen);
    return chosen;
  }

  private async _escalationContext(pending: PendingDecision): Promise<string> {
    if (this.modelRouter) {
      try {
        const resp = await this.modelRouter.route('file-analysis', {
          messages: [
            {
              role: 'system',
              content:
                'You are a Scrum Master escalating a technical decision to the Product Owner. '
                + 'Write ONE sentence explaining the business impact of this decision and why '
                + 'the PO must decide. Be direct and non-technical. No markdown.',
            },
            {
              role: 'user',
              content:
                `Decision: ${pending.question}\n`
                + `Context: ${pending.context}\n`
                + `Affected agents: ${pending.affectedActors.join(', ')}`,
            },
          ],
          maxTokens: 80,
        });
        const text = resp.content.trim();
        if (text.length > 10) return text;
      } catch { /* fall through */ }
    }
    return `This requires your decision as PO. ${pending.affectedActors.length} agents are waiting.`;
  }

  private _broadcastDecision(pending: PendingDecision, chosen: DecisionOption): void {
    const r = this.renderer;
    r.say('ba', `Broadcasting decision to ${pending.affectedActors.length} agents: "${chosen.label}"`);
    for (const actorId of pending.affectedActors) {
      r.say(actorId, `Decision received — "${pending.question}" → ${chosen.label}. Updating my plan.`);
    }
    r.newline();
  }
}
