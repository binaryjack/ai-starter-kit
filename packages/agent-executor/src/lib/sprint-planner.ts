/**
 * SprintPlanner — Phase 2 (DECOMPOSE) backlog session.
 *
 * Extracted from PlanSynthesizer.runSprintPlanning() so each class has
 * a single responsibility:
 *   - PlanSynthesizer  → produce a plan skeleton + approval loop
 *   - SprintPlanner    → seed the backlog and guide the Q&A resolution loop
 *
 * PlanOrchestrator calls `new SprintPlanner(...).run(plan, discovery, board)`
 * instead of the old `new PlanSynthesizer(...).runSprintPlanning(...)`.
 */

import { BacklogBoard } from './backlog.js';
import { ChatRenderer, promptUser } from './chat-renderer.js';
import type { ModelRouter } from './model-router.js';
import type { ActorId, DiscoveryResult, PlanDefinition } from './plan-types.js';

export class SprintPlanner {
  constructor(
    private readonly renderer: ChatRenderer,
    private readonly _projectRoot: string,
    private readonly _modelRouter?: ModelRouter,
  ) {}

  /**
   * Run the live backlog session: seed the backlog, display it, then guide
   * the PO through resolving every open item.
   */
  async run(
    plan: PlanDefinition,
    discovery: DiscoveryResult,
    board: BacklogBoard,
  ): Promise<void> {
    const r = this.renderer;

    r.phaseHeader('decompose');
    r.say(
      'ba',
      'Sprint planning session open. Each agent has posted their prerequisite questions. '
        + "We'll work through them together — you're the PO, I'm the Scrum Master.",
    );
    r.newline();

    // Seed backlog with standard items per story (or top-level if no stories)
    if (discovery.stories.length > 0) {
      for (const story of discovery.stories) {
        board.seedStandardItems(story.id);
      }
    } else {
      board.seedStandardItems();
    }

    // Show initial board state
    board.display('INITIAL BACKLOG — all items open');

    // Announce each agent's questions
    const agentOrder: ActorId[] = ['architecture', 'backend', 'frontend', 'testing', 'e2e', 'security'];
    for (const agentId of agentOrder) {
      const items = board.getByOwner(agentId);
      if (items.length === 0) continue;
      r.say(agentId, `I need ${items.length} question(s) answered before I can start:`);
      for (const item of items) {
        const waiting = item.waitingFor ? ` (waiting on: ${item.waitingFor})` : '';
        r.system(`  □  ${item.question}${waiting}`);
      }
      r.newline();
    }

    // Resolution loop
    r.say(
      'ba',
      "Let's resolve the open items. I'll handle what I can; you'll be asked for product decisions.",
    );

    const maxRounds = 50;
    let round = 0;

    while (board.getOpen().length > 0 && round < maxRounds) {
      round++;
      const openItem = board.getOpen()[0];
      r.question('ba', `[${openItem.owner.toUpperCase()}]  ${openItem.question}`);
      const answer = await promptUser(r, '');
      if (answer) {
        board.resolve(openItem.id, answer);
        r.say('ba', `✅ Noted: "${answer.slice(0, 60)}"`);
      } else {
        board.skip(openItem.id);
        r.say('ba', 'Skipped — moving on.');
      }
      const prog = board.progress();
      if (prog.pct % 25 === 0 && prog.pct > 0) {
        board.display(`BACKLOG UPDATE — ${prog.pct}% resolved`);
      }
    }

    board.display('BACKLOG FINAL — sprint planning complete');

    r.phaseSummary('decompose', [
      `${board.progress().done}/${board.progress().total} backlog items resolved`,
      `${board.getOpen().length} items still open (will be carried forward)`,
    ]);
  }
}
