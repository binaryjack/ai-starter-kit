import type { DecisionOption, PendingDecision } from '../../resolution-tiers.types.js';
import type { IPOEscalationTier } from '../po-escalation-tier.js';

export function canHandle(this: IPOEscalationTier, _pending: PendingDecision): boolean {
  return true;
}

export async function resolve(this: IPOEscalationTier, pending: PendingDecision): Promise<DecisionOption | null> {
  const r = this._renderer;
  const escalationMsg = await _escalationContext(this, pending);
  r.say('ba', escalationMsg);
  r.decision(pending);

  const choice = await (await import('../../../chat-renderer.js')).promptChoice(r, pending.options.length);
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
  _broadcastDecision(this, pending, chosen);
  return chosen;
}

async function _escalationContext(self: IPOEscalationTier, pending: PendingDecision): Promise<string> {
  if (self._modelRouter) {
    try {
      const resp = await self._modelRouter.route('file-analysis', {
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

function _broadcastDecision(self: IPOEscalationTier, pending: PendingDecision, chosen: DecisionOption): void {
  const r = self._renderer;
  r.say('ba', `Broadcasting decision to ${pending.affectedActors.length} agents: "${chosen.label}"`);
  for (const actorId of pending.affectedActors) {
    r.say(actorId, `Decision received — "${pending.question}" → ${chosen.label}. Updating my plan.`);
  }
  r.newline();
}
