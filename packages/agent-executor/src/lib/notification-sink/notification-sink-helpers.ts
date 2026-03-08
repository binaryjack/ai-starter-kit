import type {
  BudgetExceededEvent,
  DagEndEvent,
  LaneEndEvent,
}                                  from '../dag-events/dag-events.js';
import type { NotificationSinkOptions } from './notification-sink.types.js';

export async function postWebhook(url: string, body: unknown): Promise<void> {
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

export function buildSlackDagEnd(event: DagEndEvent, opts: NotificationSinkOptions): object {
  const statusEmoji: Record<string, string> = {
    success: ':white_check_mark:',
    partial: ':warning:',
    failed:  ':red_circle:',
  };

  const emoji       = statusEmoji[event.status] ?? ':grey_question:';
  const title       = `${emoji} DAG *${event.dagName}* — ${event.status.toUpperCase()}`;
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
    username:    opts.slack?.username  ?? 'AI Agent',
    icon_emoji:  opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    attachments: [{
      fallback:   `DAG ${event.dagName} ${event.status}`,
      color:      color[event.status] ?? '#888888',
      title:      title.replace(/\*/g, ''),
      mrkdwn_in:  ['text', 'fields'],
      text:       title,
      fields,
      ts:         Math.floor(new Date(event.timestamp).getTime() / 1000).toString(),
    }],
  };
}

export function buildSlackLaneEnd(event: LaneEndEvent, opts: NotificationSinkOptions): object {
  const emoji       = event.status === 'success'   ? ':white_check_mark:' :
                      event.status === 'escalated' ? ':sos:' : ':x:';
  const durationSec = (event.durationMs / 1000).toFixed(1);

  return {
    username:   opts.slack?.username  ?? 'AI Agent',
    icon_emoji: opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    text: `${emoji} Lane *${event.laneId}* (run: ${event.runId}) — ${event.status} in ${durationSec}s` +
          (event.retries > 0 ? ` (${event.retries} retries)` : ''),
  };
}

export function buildSlackBudget(event: BudgetExceededEvent, opts: NotificationSinkOptions): object {
  return {
    username:    opts.slack?.username  ?? 'AI Agent',
    icon_emoji:  opts.slack?.iconEmoji ?? ':robot_face:',
    ...(opts.slack?.channel ? { channel: opts.slack.channel } : {}),
    attachments: [{
      color:     'danger',
      title:     ':moneybag: Budget Exceeded',
      text:      `Run *${event.runId}*${event.laneId ? ` / lane *${event.laneId}*` : ''} exceeded the ` +
                 `$${event.limitUSD.toFixed(2)} ${event.scope} budget ` +
                 `(actual: $${event.actualUSD.toFixed(2)})`,
      mrkdwn_in: ['text'],
    }],
  };
}

export function buildTeamsDagEnd(event: DagEndEvent, opts: NotificationSinkOptions): object {
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
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: statusColor[event.status] ?? '888888',
    summary:    `DAG ${event.dagName} — ${event.status}`,
    sections:   [{
      activityTitle:    `DAG **${event.dagName}** — ${event.status.toUpperCase()}`,
      activitySubtitle: `Run ${event.runId}`,
      facts,
    }],
  };
}

export function buildTeamsLaneEnd(event: LaneEndEvent, _opts: NotificationSinkOptions): object {
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

export function buildTeamsBudget(event: BudgetExceededEvent, _opts: NotificationSinkOptions): object {
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
