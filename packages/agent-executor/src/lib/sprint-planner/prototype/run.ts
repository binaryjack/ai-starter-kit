import type { BacklogBoard } from '../backlog/index.js';
import { promptUser } from '../chat-renderer/index.js';
import type { ActorId, DiscoveryResult, PlanDefinition } from '../plan-types.js';
import type { ISprintPlanner } from '../sprint-planner.js';

export async function run(
  this: ISprintPlanner,
  plan: PlanDefinition,
  discovery: DiscoveryResult,
  board: BacklogBoard,
): Promise<void> {
  const r = this._renderer;

  r.phaseHeader('decompose');
  r.say(
    'ba',
    'Sprint planning session open. Each agent has posted their prerequisite questions. '
      + "We'll work through them together — you're the PO, I'm the Scrum Master.",
  );
  r.newline();

  if (discovery.stories.length > 0) {
    for (const story of discovery.stories) {
      board.seedStandardItems(story.id);
    }
  } else {
    board.seedStandardItems();
  }

  board.display('INITIAL BACKLOG — all items open');

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

  r.say(
    'ba',
    "Let's resolve the open items. I'll handle what I can; you'll be asked for product decisions.",
  );

  const maxRounds = 50;
  let round = 0;

  while (board.getOpen().length > 0 && round < maxRounds) {
    round++;
    const openItem = board.getOpen()[0]!;
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
