/**
 * Chat Renderer — ANSI-colored terminal output for the Plan System
 *
 * Each actor has a distinct color + label.  Phase headers are visually
 * separated.  No external dependencies — uses raw ANSI escape codes.
 */

import * as readline from 'readline';
import type {
    ActorId,
    BacklogItem,
    ChecklistDisplayItem,
    PendingDecision,
    PlanPhase
} from './plan-types.js';
import { ACTORS } from './plan-types.js';

// ─── ANSI primitives ──────────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET   = `${ESC}0m`;
const BOLD    = `${ESC}1m`;
const DIM     = `${ESC}2m`;
const ITALIC  = `${ESC}3m`;
const BG_RED  = `${ESC}41m`;
const WHITE   = `${ESC}97m`;

const colors = {
  red:        `${ESC}31m`,
  green:      `${ESC}32m`,
  yellow:     `${ESC}33m`,
  blue:       `${ESC}34m`,
  magenta:    `${ESC}35m`,
  cyan:       `${ESC}36m`,
  white:      `${ESC}37m`,
  gray:       `${ESC}90m`,
  brightRed:   `${ESC}91m`,
  brightGreen: `${ESC}92m`,
  brightCyan:  `${ESC}96m`,
  brightWhite: `${ESC}97m`,
} as const;

function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${RESET}`;
}
function bold(text: string): string  { return `${BOLD}${text}${RESET}`; }
function dim(text: string): string   { return `${DIM}${text}${RESET}`; }
function italic(text: string): string { return `${ITALIC}${text}${RESET}`; }

// ─── Actor color map ──────────────────────────────────────────────────────────

const ACTOR_COLOR: Record<ActorId, (t: string) => string> = {
  user:         (t) => `${BOLD}${colors.brightWhite}${t}${RESET}`,
  ba:           (t) => `${BOLD}${colors.blue}${t}${RESET}`,
  architecture: (t) => `${colors.cyan}${t}${RESET}`,
  backend:      (t) => `${colors.green}${t}${RESET}`,
  frontend:     (t) => `${colors.yellow}${t}${RESET}`,
  testing:      (t) => `${colors.magenta}${t}${RESET}`,
  e2e:          (t) => `${colors.red}${t}${RESET}`,
  security:     (t) => `${BOLD}${colors.red}${t}${RESET}`,
  supervisor:   (t) => `${DIM}${ITALIC}${colors.gray}${t}${RESET}`,
  system:       (t) => `${colors.gray}${t}${RESET}`,
  arbiter:      (t) => `${BOLD}${colors.cyan}${t}${RESET}`,
};

// ─── Phase definitions ────────────────────────────────────────────────────────

const PHASE_META: Record<PlanPhase, { label: string; color: (t: string) => string; desc: string }> = {
  discover:   { label: '🔍 PHASE 0 — DISCOVERY',   color: (t) => c('cyan', t),      desc: 'BA ↔ User  ·  structured elicitation' },
  synthesize: { label: '📋 PHASE 1 — SYNTHESIZE',  color: (t) => c('blue', t),      desc: 'BA produces plan skeleton · user approval' },
  decompose:  { label: '⚙️  PHASE 2 — DECOMPOSE',   color: (t) => c('yellow', t),   desc: 'All agents break down their steps in parallel' },
  wire:       { label: '🔗 PHASE 3 — WIRE',         color: (t) => c('magenta', t),  desc: 'Dependency graph · parallelism · alignment gates' },
  execute:    { label: '🚀 PHASE 4 — EXECUTE',      color: (t) => c('green', t),    desc: 'Plan executor runs wired tasks via DagOrchestrator' },
  complete:   { label: '✅ PLAN COMPLETE',           color: (t) => c('brightGreen', t), desc: 'All steps finished' },
};

// ─── Public renderer class ────────────────────────────────────────────────────

export class ChatRenderer {
  private readonly width: number;

  constructor(width = 68) {
    this.width = width;
  }

  // ── Phase header ──────────────────────────────────────────────────────────

  phaseHeader(phase: PlanPhase): void {
    const meta = PHASE_META[phase];
    const bar = '━'.repeat(this.width);
    console.log('');
    console.log(meta.color(bar));
    console.log(meta.color(`  ${bold(meta.label)}`));
    console.log(meta.color(`  ${dim(meta.desc)}`));
    console.log(meta.color(bar));
    console.log('');
  }

  // ── Actor speech bubble ───────────────────────────────────────────────────

  say(actor: ActorId, text: string): void {
    const a = ACTORS[actor];
    const colorize = ACTOR_COLOR[actor];
    const prefix = colorize(`${a.emoji} [${a.label}]`);
    const lines = this._wrap(text, this.width - 14);
    console.log(`${prefix}  ${lines[0]}`);
    for (let i = 1; i < lines.length; i++) {
      console.log(`${''.padStart(14)}${lines[i]}`);
    }
  }

  // ── Question (actor → user) ───────────────────────────────────────────────

  question(actor: ActorId, text: string): void {
    const a = ACTORS[actor];
    const colorize = ACTOR_COLOR[actor];
    const label = colorize(`${a.emoji} [${a.label}]`);
    console.log(`\n${label}  ${bold('?')} ${text}`);
  }

  // ── System event ──────────────────────────────────────────────────────────

  system(text: string): void {
    console.log(dim(`  ⚡ ${text}`));
  }

  // ── Warning ───────────────────────────────────────────────────────────────

  warn(text: string): void {
    console.log(`  ${c('yellow', '⚠')}  ${c('yellow', text)}`);
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  error(text: string): void {
    console.log(`  ${c('brightRed', '✖')}  ${c('brightRed', text)}`);
  }

  // ── Separator ─────────────────────────────────────────────────────────────

  separator(char = '─'): void {
    console.log(dim(char.repeat(this.width)));
  }

  newline(): void {
    console.log('');
  }

  // ── Checklist (backlog board) ─────────────────────────────────────────────

  checklist(title: string, items: ChecklistDisplayItem[]): void {
    this.separator();
    console.log(`  ${bold(c('cyan', `📋 ${title}`))}`);
    this.separator();
    for (const item of items) {
      const actor = ACTORS[item.owner];
      const actorTag = dim(`[${actor.label}]`);
      const icon = this._statusIcon(item.status);
      const text = item.status === 'answered'
        ? dim(item.text)
        : item.text;
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

  // ── Escalated decision ────────────────────────────────────────────────────

  decision(d: PendingDecision): void {
    const bar = '━'.repeat(this.width);
    console.log('');
    console.log(`${BG_RED}${WHITE}${BOLD}  🚨 DECISION REQUIRED [PO]  ${RESET}`);
    console.log(c('brightRed', bar));
    const lines = this._wrap(d.question, this.width - 4);
    for (const l of lines) {
      console.log(`  ${bold(l)}`);
    }
    console.log('');
    const ctxLines = this._wrap(d.context, this.width - 4);
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

  // ── Model recommendation ──────────────────────────────────────────────────

  modelRecommendation(rec: {
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

  // ── Approval prompt ───────────────────────────────────────────────────────

  approvalPrompt(what: string): void {
    console.log('');
    console.log(`  ${c('cyan', '┌')}${'─'.repeat(this.width - 2)}${c('cyan', '┐')}`);
    console.log(`  ${c('cyan', '│')}  ${bold('✋ APPROVAL NEEDED')}${''.padEnd(this.width - 20)}${c('cyan', '│')}`);
    console.log(`  ${c('cyan', '│')}  ${what}${''.padEnd(Math.max(0, this.width - 4 - what.length))}${c('cyan', '│')}`);
    console.log(`  ${c('cyan', '└')}${'─'.repeat(this.width - 2)}${c('cyan', '┘')}`);
    console.log('');
  }

  // ── Phase summary ─────────────────────────────────────────────────────────

  phaseSummary(phase: PlanPhase, lines: string[]): void {
    const meta = PHASE_META[phase];
    console.log('');
    console.log(meta.color(`  ✓ ${meta.label} — COMPLETE`));
    for (const l of lines) {
      console.log(`    ${dim(l)}`);
    }
    console.log('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _statusIcon(status: BacklogItem['status']): string {
    switch (status) {
      case 'answered': return c('green', '✅');
      case 'blocked':  return c('yellow', '⏸');
      case 'skipped':  return dim('⊘');
      default:         return c('gray', '□');
    }
  }

  private _progressBar(pct: number, width: number): string {
    const filled = Math.round((pct / 100) * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const color = pct >= 100 ? 'green' : pct >= 50 ? 'cyan' : 'yellow';
    return `${colors[color]}[${bar}]${RESET} ${pct}%`;
  }

  private _wrap(text: string, max: number): string[] {
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
}

// ─── Interactive prompt helper ────────────────────────────────────────────────

/**
 * Prompt the user for a single line of input.
 * Returns empty string if stdin is not a TTY (non-interactive mode).
 */
export async function promptUser(
  renderer: ChatRenderer,
  promptText: string,
): Promise<string> {
  if (!process.stdin.isTTY) {
    renderer.system('Non-interactive mode — skipping prompt');
    return '';
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    process.stdout.write(`\n  ${colors.brightWhite}${BOLD}👤 [You]${RESET}  ${promptText}\n  ${colors.gray}▶ ${RESET}`);
    rl.once('line', (line: string) => {
      rl.close();
      resolve(line.trim());
    });
  });
}

/**
 * Prompt user to choose from lettered options (A, B, C…) or a custom value.
 */
export async function promptChoice(
  renderer: ChatRenderer,
  optionCount: number,
): Promise<string> {
  if (!process.stdin.isTTY) return 'A';
  return new Promise((resolve) => {
    const valid = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
    valid.push('custom');
    process.stdout.write(`  ${DIM}Enter choice [${valid.join('/')}] or type a custom answer:${RESET}\n  ${colors.gray}▶ ${RESET}`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.once('line', (line: string) => {
      rl.close();
      resolve(line.trim());
    });
  });
}
