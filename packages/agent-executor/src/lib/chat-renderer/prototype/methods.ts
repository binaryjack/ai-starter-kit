import type { ActorId, BacklogItem, ChecklistDisplayItem, PendingDecision, PlanPhase } from '../../plan-types.js';
import { ACTORS } from '../../plan-types.js';
import type { IChatRenderer } from '../chat-renderer.js';
import { ACTOR_COLOR, BG_RED, bold, BOLD, c, colors, dim, PHASE_META, RESET, WHITE } from '../chat-renderer.js';

export function phaseHeader(this: IChatRenderer, phase: PlanPhase): void {
  const meta = PHASE_META[phase];
  const bar = '━'.repeat(this._width);
  console.log('');
  console.log(meta.color(bar));
  console.log(meta.color(`  ${bold(meta.label)}`));
  console.log(meta.color(`  ${dim(meta.desc)}`));
  console.log(meta.color(bar));
  console.log('');
}

export function say(this: IChatRenderer, actor: ActorId, text: string): void {
  const a = ACTORS[actor];
  const colorize = ACTOR_COLOR[actor];
  const prefix = colorize(`${a.emoji} [${a.label}]`);
  const lines = this._wrap(text, this._width - 14);
  console.log(`${prefix}  ${lines[0]}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`${''.padStart(14)}${lines[i]}`);
  }
}

export function question(this: IChatRenderer, actor: ActorId, text: string): void {
  const a = ACTORS[actor];
  const colorize = ACTOR_COLOR[actor];
  const label = colorize(`${a.emoji} [${a.label}]`);
  console.log(`\n${label}  ${bold('?')} ${text}`);
}

export function system(this: IChatRenderer, text: string): void {
  console.log(dim(`  ⚡ ${text}`));
}

export function warn(this: IChatRenderer, text: string): void {
  console.log(`  ${c('yellow', '⚠')}  ${c('yellow', text)}`);
}

export function error(this: IChatRenderer, text: string): void {
  console.log(`  ${c('brightRed', '✖')}  ${c('brightRed', text)}`);
}

export function separator(this: IChatRenderer, char = '─'): void {
  console.log(dim(char.repeat(this._width)));
}

export function newline(this: IChatRenderer): void {
  console.log('');
}

export function checklist(this: IChatRenderer, title: string, items: ChecklistDisplayItem[]): void {
  this.separator();
  console.log(`  ${bold(c('cyan', `📋 ${title}`))}`);
  this.separator();
  for (const item of items) {
    const actor = ACTORS[item.owner];
    const actorTag = dim(`[${actor.label}]`);
    const icon = this._statusIcon(item.status);
    const text = item.status === 'answered' ? dim(item.text) : item.text;
    console.log(`  ${icon}  ${actorTag}  ${text}`);
    if (item.answer && item.status === 'answered') {
      console.log(`       ${dim(`→ ${item.answer}`)}`);
    }
  }
  this.separator();
  const done  = items.filter((i) => i.status === 'answered').length;
  const total = items.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar   = this._progressBar(pct, 30);
  console.log(`  ${bar}  ${c('gray', `${done}/${total} resolved`)}`);
  this.separator();
  console.log('');
}

export function decision(this: IChatRenderer, d: PendingDecision): void {
  const bar = '━'.repeat(this._width);
  console.log('');
  console.log(`${BG_RED}${WHITE}${BOLD}  🚨 DECISION REQUIRED [PO]  ${RESET}`);
  console.log(c('brightRed', bar));
  const lines = this._wrap(d.question, this._width - 4);
  for (const l of lines) {
    console.log(`  ${bold(l)}`);
  }
  console.log('');
  const ctxLines = this._wrap(d.context, this._width - 4);
  for (const l of ctxLines) {
    console.log(`  ${dim(l)}`);
  }
  console.log('');
  d.options.forEach((opt, i) => {
    console.log(`  ${bold(c('brightCyan', `${String.fromCharCode(65 + i)})`))}`
      + `  ${bold(opt.label)}`);
    console.log(`      ${opt.description}`);
    console.log(`      ${dim('→ ' + opt.implications)}`);
    console.log('');
  });
  const affected = d.affectedActors.map((a) => `${ACTORS[a].emoji} ${ACTORS[a].label}`).join('  ');
  console.log(`  ${dim(`Affects: ${affected}`)}`);
  console.log(`  ${dim(`Blocking: ${d.blockedItemIds.length} backlog item(s)`)}`);
  console.log(c('brightRed', bar));
  console.log('');
}

export function modelRecommendation(this: IChatRenderer, rec: {
  discovery: string;
  planning: string;
  implementation: string;
  review: string;
  estimatedCostNote: string;
}): void {
  this.separator('─');
  console.log(`  ${bold(c('cyan', '💰 Model Recommendation (cost guidance)'))}`);
  console.log(`  ${dim('Discovery / Planning')}   → ${c('green', rec.discovery)}`);
  console.log(`  ${dim('Architecture / Design')}  → ${c('yellow', rec.planning)}`);
  console.log(`  ${dim('Implementation')}         → ${c('cyan', rec.implementation)}`);
  console.log(`  ${dim('Review / Audit')}         → ${c('green', rec.review)}`);
  console.log(`  ${dim(rec.estimatedCostNote)}`);
  this.separator('─');
  console.log('');
}

export function approvalPrompt(this: IChatRenderer, what: string): void {
  console.log('');
  console.log(`  ${c('cyan', '┌')}${'─'.repeat(this._width - 2)}${c('cyan', '┐')}`);
  console.log(`  ${c('cyan', '│')}  ${bold('✋ APPROVAL NEEDED')}${''.padEnd(this._width - 20)}${c('cyan', '│')}`);
  console.log(`  ${c('cyan', '│')}  ${what}${''.padEnd(Math.max(0, this._width - 4 - what.length))}${c('cyan', '│')}`);
  console.log(`  ${c('cyan', '└')}${'─'.repeat(this._width - 2)}${c('cyan', '┘')}`);
  console.log('');
}

export function phaseSummary(this: IChatRenderer, phase: PlanPhase, lines: string[]): void {
  const meta = PHASE_META[phase];
  console.log('');
  console.log(meta.color(`  ✓ ${meta.label} — COMPLETE`));
  for (const l of lines) {
    console.log(`    ${dim(l)}`);
  }
  console.log('');
}

export function _statusIcon(this: IChatRenderer, status: BacklogItem['status']): string {
  switch (status) {
    case 'answered': return c('green', '✅');
    case 'blocked':  return c('yellow', '⏸');
    case 'skipped':  return dim('⊘');
    default:         return c('gray', '□');
  }
}

export function _progressBar(this: IChatRenderer, pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = pct >= 100 ? 'green' : pct >= 50 ? 'cyan' : 'yellow';
  return `${colors[color]}[${bar}]${RESET} ${pct}%`;
}

export function _wrap(this: IChatRenderer, text: string, max: number): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}
