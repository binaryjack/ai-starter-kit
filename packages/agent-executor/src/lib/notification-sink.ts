/**
 * E12 — Notification Sink (Slack / Microsoft Teams)
 *
 * Subscribes to DAG lifecycle events and sends rich notifications to
 * Slack incoming webhooks and/or Microsoft Teams incoming webhooks.
 *
 * Both integrations use zero SDK dependencies — pure HTTP fetch.
 *
 * ─── Slack configuration ─────────────────────────────────────────────────────
 *   SLACK_WEBHOOK_URL     Incoming webhook URL from Slack app settings
 *
 * ─── Teams configuration ─────────────────────────────────────────────────────
 *   TEAMS_WEBHOOK_URL     Incoming webhook URL from Teams connector settings
 *
 * Event filter (which DAG events trigger a notification):
 *   dag:end              — always
 *   lane:end  (optional) — opt-in via `notifyLaneEnd: true`
 *   budget:exceeded      — always when budget guard fires
 *
 * Usage:
 *   const sink = new NotificationSink({
 *     slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! },
 *   });
 *   sink.attach(getGlobalEventBus());
 *
 * Or via factory:
 *   const sink = NotificationSink.fromEnv();
 *   sink?.attach(bus);
 */

import type {
  BudgetExceededEvent,
  DagEndEvent,
  DagEventBus,
  LaneEndEvent,
} from './dag-events.js';

// ─── Provider options ─────────────────────────────────────────────────────────

export interface SlackOptions {
  /** Slack Incoming Webhook URL. */
  webhookUrl: string;
  /**
   * Slack channel override (e.g. "#ci-alerts"). If omitted, the webhook's
   * default channel is used.
   */
  channel?: string;
  /** Bot display name (default: "AI Agent"). */
  username?: string;
  /** Bot icon emoji (default: ":robot_face:"). */
  iconEmoji?: string;
}

export interface TeamsOptions {
  /** Microsoft Teams Incoming Webhook URL. */
  webhookUrl: string;
}

export interface NotificationSinkOptions {
  /** Slack integration settings. */
  slack?:          SlackOptions;
  /** Microsoft Teams integration settings. */
  teams?:          TeamsOptions;
  /**
   * Only send notifications for failed or partial runs (suppress success).
   * @default false
   */
  failuresOnly?:   boolean;
  /**
   * Also emit a notification on lane:end events.
   * Can be noisy for large DAGs — disabled by default.
   * @default false
   */
  notifyLaneEnd?:  boolean;
  /**
   * Emit a notification when the budget guard fires.
   * @default true
   */
  notifyBudget?:   boolean;
  /**
   * Extra key/value context added to all notifications.
   */
  extraContext?:   Record<string, string>;
}

// ─── Internal HTTP helper ─────────────────────────────────────────────────────

async function postWebhook(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Webhook POST failed ${res.status}: ${text}`);
  }
}

// ─── Slack message builder ────────────────────────────────────────────────────

function buildSlackDagEnd(event: DagEndEvent, opts: NotificationSinkOptions): object {
  const statusEmoji: Record<string, string> = {
    success: ':white_check_mark:',
    partial: ':warning:',
    failed:  ':red_circle:',
  };

  const emoji   = statusEmoji[event.status] ?? ':grey_question:';
  const title   = `${emoji} DAG *${event.dagName}* — ${event.status.toUpperCase()}`;
  const durationSec = (event.durationMs / 1000).toFixed(1);

  const fields: Array<{ title: string; value: string; short: boolean }> = [
    { title: 'Run ID',    value: event.runId,       short: true },
    { title: 'Status',    value: event.status,      short: true },
    { title: 'Duration',  value: `${durationSec}s`, short: true },
    { title: 'Timestamp', value: event.timestamp,   short: true },
  ];

  for (const [k, v] of Object.entries(opts.extraContext ?? {})) {
    fields.push({ title: k, value: v, short: true });
  }

  const color: Record<string, string> = {
    success: 'good',
    partial: 'warning',
    failed:  'danger',
  };

  return {
    username:   opts.slack?.username ?? 'AI Agent',
    icon_emoji: opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    attachments: [{
      fallback: `DAG ${event.dagName} ${event.status}`,
      color:    color[event.status] ?? '#888888',
      title:    title.replace(/\*/g, ''),
      mrkdwn_in: ['text', 'fields'],
      text:     title,
      fields,
      ts:       Math.floor(new Date(event.timestamp).getTime() / 1000).toString(),
    }],
  };
}

function buildSlackLaneEnd(event: LaneEndEvent, opts: NotificationSinkOptions): object {
  const emoji = event.status === 'success' ? ':white_check_mark:' :
                event.status === 'escalated' ? ':sos:' : ':x:';
  const durationSec = (event.durationMs / 1000).toFixed(1);

  return {
    username:   opts.slack?.username ?? 'AI Agent',
    icon_emoji: opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    text: `${emoji} Lane *${event.laneId}* (run: ${event.runId}) — ${event.status} in ${durationSec}s` +
          (event.retries > 0 ? ` (${event.retries} retries)` : ''),
  };
}

function buildSlackBudget(event: BudgetExceededEvent, opts: NotificationSinkOptions): object {
  return {
    username:    opts.slack?.username ?? 'AI Agent',
    icon_emoji:  opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    attachments: [{
      color:   'danger',
      title:   ':moneybag: Budget Exceeded',
      text:    `Run *${event.runId}*${event.laneId ? ` / lane *${event.laneId}*` : ''} exceeded the ` +
               `$${event.limitUSD.toFixed(2)} ${event.scope} budget ` +
               `(actual: $${event.actualUSD.toFixed(2)})`,
      mrkdwn_in: ['text'],
    }],
  };
}

// ─── Teams message builder ────────────────────────────────────────────────────

function buildTeamsDagEnd(event: DagEndEvent, opts: NotificationSinkOptions): object {
  const statusColor: Record<string, string> = {
    success: '00b300',
    partial: 'f6a800',
    failed:  'd93025',
  };

  const facts = [
    { name: 'Run ID',    value: event.runId },
    { name: 'Status',    value: event.status.toUpperCase() },
    { name: 'Duration',  value: `${(event.durationMs / 1000).toFixed(1)}s` },
    { name: 'Timestamp', value: event.timestamp },
    ...Object.entries(opts.extraContext ?? {}).map(([k, v]) => ({ name: k, value: v })),
  ];

  return {
    '@type':      'MessageCard',
    '@context':   'http://schema.org/extensions',
    themeColor:   statusColor[event.status] ?? '888888',
    summary:      `DAG ${event.dagName} — ${event.status}`,
    sections: [{
      activityTitle:    `DAG **${event.dagName}** — ${event.status.toUpperCase()}`,
      activitySubtitle: `Run ${event.runId}`,
      facts,
    }],
  };
}

function buildTeamsLaneEnd(event: LaneEndEvent, _opts: NotificationSinkOptions): object {
  const durationSec = (event.durationMs / 1000).toFixed(1);

  return {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: event.status === 'success' ? '00b300' : 'd93025',
    summary:    `Lane ${event.laneId} — ${event.status}`,
    text:       `Lane **${event.laneId}** (run: ${event.runId}) — ${event.status} in ${durationSec}s` +
                (event.retries > 0 ? ` (${event.retries} retries)` : ''),
  };
}

function buildTeamsBudget(event: BudgetExceededEvent, _opts: NotificationSinkOptions): object {
  return {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'd93025',
    summary:    `Budget exceeded: run ${event.runId}`,
    text:       `**Budget Exceeded** — Run \`${event.runId}\`${event.laneId ? ` / lane \`${event.laneId}\`` : ''} ` +
                `exceeded the $${event.limitUSD.toFixed(2)} ${event.scope} budget ` +
                `(actual: $${event.actualUSD.toFixed(2)})`,
  };
}

// ─── NotificationSink ─────────────────────────────────────────────────────────

/**
 * Listens to DAG events and sends rich notifications to Slack and/or Teams.
 */
export class NotificationSink {
  private readonly opts: NotificationSinkOptions;

  constructor(opts: NotificationSinkOptions) {
    if (!opts.slack && !opts.teams) {
      throw new Error('NotificationSink: at least one of `slack` or `teams` must be configured');
    }
    this.opts = {
      failuresOnly:  opts.failuresOnly  ?? false,
      notifyLaneEnd: opts.notifyLaneEnd ?? false,
      notifyBudget:  opts.notifyBudget  ?? true,
      ...opts,
    };
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  /**
   * Build a NotificationSink from environment variables.
   * Returns `undefined` when neither SLACK_WEBHOOK_URL nor TEAMS_WEBHOOK_URL is set.
   *
   * Env vars:
   *   SLACK_WEBHOOK_URL   — Slack incoming webhook
   *   TEAMS_WEBHOOK_URL   — Teams incoming webhook
   */
  static fromEnv(extra?: Partial<NotificationSinkOptions>): NotificationSink | undefined {
    const slackUrl = process.env['SLACK_WEBHOOK_URL'];
    const teamsUrl = process.env['TEAMS_WEBHOOK_URL'];

    if (!slackUrl && !teamsUrl) return undefined;

    return new NotificationSink({
      ...(slackUrl ? { slack: { webhookUrl: slackUrl } } : {}),
      ...(teamsUrl ? { teams: { webhookUrl: teamsUrl } } : {}),
      ...extra,
    });
  }

  // ─── Event bus ────────────────────────────────────────────────────────────

  /**
   * Subscribe to DAG events on `bus`.
   * Attach once; call `detach()` to remove listeners.
   */
  attach(bus: DagEventBus): void {
    bus.on('dag:end',         this._onDagEnd);
    bus.on('budget:exceeded', this._onBudgetExceeded);
    if (this.opts.notifyLaneEnd) {
      bus.on('lane:end', this._onLaneEnd);
    }
  }

  /** Remove all subscriptions added by `attach()`. */
  detach(bus: DagEventBus): void {
    bus.removeListener('dag:end',         this._onDagEnd);
    bus.removeListener('budget:exceeded', this._onBudgetExceeded);
    bus.removeListener('lane:end',        this._onLaneEnd);
  }

  // ─── Manual send ─────────────────────────────────────────────────────────

  /**
   * Send notifications for a `DagEndEvent` to all configured sinks,
   * without going through the event bus.
   */
  async sendDagEnd(event: DagEndEvent): Promise<void> {
    const { failuresOnly = false } = this.opts;
    if (failuresOnly && event.status === 'success') return;
    await this._post(
      this.opts.slack  ? buildSlackDagEnd(event, this.opts) : null,
      this.opts.teams  ? buildTeamsDagEnd(event, this.opts) : null,
    );
  }

  /** Send notifications for a `LaneEndEvent` to all configured sinks. */
  async sendLaneEnd(event: LaneEndEvent): Promise<void> {
    const { failuresOnly = false } = this.opts;
    if (failuresOnly && event.status === 'success') return;
    await this._post(
      this.opts.slack ? buildSlackLaneEnd(event, this.opts) : null,
      this.opts.teams ? buildTeamsLaneEnd(event, this.opts) : null,
    );
  }

  /** Send notifications for a `BudgetExceededEvent` to all configured sinks. */
  async sendBudgetExceeded(event: BudgetExceededEvent): Promise<void> {
    await this._post(
      this.opts.slack ? buildSlackBudget(event, this.opts)  : null,
      this.opts.teams ? buildTeamsBudget(event, this.opts)  : null,
    );
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private readonly _onDagEnd = (event: DagEndEvent): void => {
    this.sendDagEnd(event).catch(() => undefined);
  };

  private readonly _onLaneEnd = (event: LaneEndEvent): void => {
    this.sendLaneEnd(event).catch(() => undefined);
  };

  private readonly _onBudgetExceeded = (event: BudgetExceededEvent): void => {
    if (this.opts.notifyBudget !== false) {
      this.sendBudgetExceeded(event).catch(() => undefined);
    }
  };

  private async _post(slackPayload: object | null, teamsPayload: object | null): Promise<void> {
    const ops: Promise<void>[] = [];

    if (slackPayload && this.opts.slack?.webhookUrl) {
      ops.push(postWebhook(this.opts.slack.webhookUrl, slackPayload));
    }
    if (teamsPayload && this.opts.teams?.webhookUrl) {
      ops.push(postWebhook(this.opts.teams.webhookUrl, teamsPayload));
    }

    // Send in parallel; surface the first error (if any)
    const results = await Promise.allSettled(ops);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(failures.map((f) => (f.reason as Error).message).join('; '));
    }
  }
}
