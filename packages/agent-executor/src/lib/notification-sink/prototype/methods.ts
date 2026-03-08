import type {
    BudgetExceededEvent,
    DagEndEvent,
    DagEventBus,
    LaneEndEvent,
} from '../../dag-events/dag-events.js'
import {
    buildSlackBudget,
    buildSlackDagEnd, buildSlackLaneEnd,
    buildTeamsBudget,
    buildTeamsDagEnd, buildTeamsLaneEnd,
    postWebhook,
} from '../notification-sink-helpers.js'
import type { INotificationSink } from '../notification-sink.js'

export function attach(this: INotificationSink, bus: DagEventBus): void {
  bus.on('dag:end',         this._onDagEnd);
  bus.on('budget:exceeded', this._onBudgetExceeded);
  if (this._opts.notifyLaneEnd) {
    bus.on('lane:end', this._onLaneEnd);
  }
}

export function detach(this: INotificationSink, bus: DagEventBus): void {
  bus.removeListener('dag:end',         this._onDagEnd);
  bus.removeListener('budget:exceeded', this._onBudgetExceeded);
  bus.removeListener('lane:end',        this._onLaneEnd);
}

export async function sendDagEnd(this: INotificationSink, event: DagEndEvent): Promise<void> {
  const { failuresOnly = false } = this._opts;
  if (failuresOnly && event.status === 'success') return;
  await this._post(
    this._opts.slack ? buildSlackDagEnd(event, this._opts) : null,
    this._opts.teams ? buildTeamsDagEnd(event, this._opts) : null,
  );
}

export async function sendLaneEnd(this: INotificationSink, event: LaneEndEvent): Promise<void> {
  const { failuresOnly = false } = this._opts;
  if (failuresOnly && event.status === 'success') return;
  await this._post(
    this._opts.slack ? buildSlackLaneEnd(event, this._opts) : null,
    this._opts.teams ? buildTeamsLaneEnd(event, this._opts) : null,
  );
}

export async function sendBudgetExceeded(
  this:  INotificationSink,
  event: BudgetExceededEvent,
): Promise<void> {
  await this._post(
    this._opts.slack ? buildSlackBudget(event, this._opts) : null,
    this._opts.teams ? buildTeamsBudget(event, this._opts) : null,
  );
}

export async function _post(
  this:         INotificationSink,
  slackPayload: object | null,
  teamsPayload: object | null,
): Promise<void> {
  const ops: Promise<void>[] = [];
  if (slackPayload && this._opts.slack?.webhookUrl) {
    ops.push(postWebhook(this._opts.slack.webhookUrl, slackPayload));
  }
  if (teamsPayload && this._opts.teams?.webhookUrl) {
    ops.push(postWebhook(this._opts.teams.webhookUrl, teamsPayload));
  }

  const results  = await Promise.allSettled(ops);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(failures.map((f) => (f.reason as Error).message).join('; '));
  }
}
