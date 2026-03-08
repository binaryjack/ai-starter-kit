import * as readline from 'readline';
import type {
    ActorId,
    BacklogItem,
    ChecklistDisplayItem,
    PendingDecision,
    PlanPhase,
} from '../plan-types.js';
import './prototype/index.js';

// ─── ANSI primitives ──────────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET   = `${ESC}0m`;
const BOLD    = `${ESC}1m`;
const DIM     = `${ESC}2m`;
const ITALIC  = `${ESC}3m`;
const BG_RED  = `${ESC}41m`;
const WHITE   = `${ESC}97m`;

export const colors = {
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

export function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${RESET}`;
}
export function bold(text: string): string  { return `${BOLD}${text}${RESET}`; }
export function dim(text: string): string   { return `${DIM}${text}${RESET}`; }
export function italic(text: string): string { return `${ITALIC}${text}${RESET}`; }

export { BG_RED, BOLD, DIM, ITALIC, RESET, WHITE };

// ─── Actor color map ──────────────────────────────────────────────────────────

export const ACTOR_COLOR: Record<ActorId, (t: string) => string> = {
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

export const PHASE_META: Record<PlanPhase, { label: string; color: (t: string) => string; desc: string }> = {
  discover:   { label: '🔍 PHASE 0 — DISCOVERY',   color: (t) => c('cyan', t),      desc: 'BA ↔ User  ·  structured elicitation' },
  synthesize: { label: '📋 PHASE 1 — SYNTHESIZE',  color: (t) => c('blue', t),      desc: 'BA produces plan skeleton · user approval' },
  decompose:  { label: '⚙️  PHASE 2 — DECOMPOSE',   color: (t) => c('yellow', t),   desc: 'All agents break down their steps in parallel' },
  wire:       { label: '🔗 PHASE 3 — WIRE',         color: (t) => c('magenta', t),  desc: 'Dependency graph · parallelism · alignment gates' },
  execute:    { label: '🚀 PHASE 4 — EXECUTE',      color: (t) => c('green', t),    desc: 'Plan executor runs wired tasks via DagOrchestrator' },
  complete:   { label: '✅ PLAN COMPLETE',           color: (t) => c('brightGreen', t), desc: 'All steps finished' },
};

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IChatRenderer {
  _width: number;
  phaseHeader(phase: PlanPhase): void;
  say(actor: ActorId, text: string): void;
  question(actor: ActorId, text: string): void;
  system(text: string): void;
  warn(text: string): void;
  error(text: string): void;
  separator(char?: string): void;
  newline(): void;
  checklist(title: string, items: ChecklistDisplayItem[]): void;
  decision(d: PendingDecision): void;
  modelRecommendation(rec: {
    discovery: string;
    planning: string;
    implementation: string;
    review: string;
    estimatedCostNote: string;
  }): void;
  approvalPrompt(what: string): void;
  phaseSummary(phase: PlanPhase, lines: string[]): void;
  _statusIcon(status: BacklogItem['status']): string;
  _progressBar(pct: number, width: number): string;
  _wrap(text: string, max: number): string[];
}

export const ChatRenderer = function(
  this: IChatRenderer,
  width = 68,
) {
  this._width = width;
} as unknown as {
  new(width?: number): IChatRenderer;
};

// ─── Interactive prompt helpers ────────────────────────────────────────────────

export async function promptUser(
  renderer: IChatRenderer,
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

export async function promptChoice(
  renderer: IChatRenderer,
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
