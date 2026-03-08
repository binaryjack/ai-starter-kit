import type { DagEndEvent } from '../../dag-events.js'
import {
    CreatedIssue,
    IIssueSync,
    IssueSync,
    IssueSyncOptions,
} from '../issue-sync.js'

// ─── Module-level HTTP helper ────────────────────────────────────────────────

export async function httpPost(
  url:     string,
  headers: Record<string, string>,
  body:    unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── IIssueSync methods ───────────────────────────────────────────────────────

export function attach(this: IIssueSync, bus: import('../../dag-events.js').DagEventBus): void {
  bus.on('dag:end', this._onDagEnd);
}

export function detach(this: IIssueSync, bus: import('../../dag-events.js').DagEventBus): void {
  bus.removeListener('dag:end', this._onDagEnd);
}

export async function createIssueForRun(
  this: IIssueSync,
  event: DagEndEvent,
): Promise<CreatedIssue | undefined> {
  const { failuresOnly = false } = this._opts;

  if (event.status === 'success') return undefined;
  if (failuresOnly && event.status !== 'failed') return undefined;

  const title = this._title(event);
  const body  = this._body(event);

  if (this._opts.provider === 'jira') {
    return this._createJiraIssue(title, body, event);
  } else {
    return this._createLinearIssue(title, body, event);
  }
}

export async function _createJiraIssue(
  this: IIssueSync,
  title: string,
  body:  string,
  event: DagEndEvent,
): Promise<CreatedIssue> {
  const jira = this._opts.jira;
  if (!jira) throw new Error('IssueSync: Jira options not provided');

  const issueType = event.status === 'failed' ? (jira.issueType ?? 'Bug') : 'Task';

  const payload = {
    fields: {
      project:     { key: jira.projectKey },
      summary:     title,
      description: {
        type:    'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
      },
      issuetype: { name: issueType },
      priority:  { name: event.status === 'failed' ? 'High' : 'Medium' },
      labels:    ['ai-agent-run', `dag:${event.dagName}`],
      ...this._extraJiraFields(),
    },
  };

  const auth = Buffer.from(`${jira.email}:${jira.token}`).toString('base64');
  const data = await httpPost(
    `${jira.url.replace(/\/$/, '')}/rest/api/3/issue`,
    { Authorization: `Basic ${auth}` },
    payload,
  ) as { id: string; key: string; self: string };

  const issueUrl = `${jira.url.replace(/\/$/, '')}/browse/${data.key}`;
  return { provider: 'jira', id: data.key, url: issueUrl, title };
}

export async function _createLinearIssue(
  this: IIssueSync,
  title: string,
  body:  string,
  event: DagEndEvent,
): Promise<CreatedIssue> {
  const linear = this._opts.linear;
  if (!linear) throw new Error('IssueSync: Linear options not provided');

  const priorityMap: Record<string, number> = {
    failed:  1,
    partial: 2,
    success: 3,
  };
  const priority = priorityMap[event.status] ?? 3;

  const query = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const variables = {
    input: {
      teamId:      linear.teamId,
      title,
      description: body,
      priority,
      labelIds:    [],
    },
  };

  const data = await httpPost(
    'https://api.linear.app/graphql',
    { Authorization: linear.apiKey, 'Content-Type': 'application/json' },
    { query, variables },
  ) as {
    data?: {
      issueCreate?: {
        success: boolean;
        issue?: { id: string; identifier: string; url: string };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(`Linear GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`);
  }

  const issue = data.data?.issueCreate?.issue;
  if (!issue) throw new Error('Linear: issueCreate returned no issue object');

  return { provider: 'linear', id: issue.identifier, url: issue.url, title };
}

export function _title(this: IIssueSync, event: DagEndEvent): string {
  const statusLabel = event.status === 'failed' ? '🔴 FAILED' : '🟡 PARTIAL';
  return `[${statusLabel}] DAG "${event.dagName}" — run ${event.runId}`;
}

export function _body(this: IIssueSync, event: DagEndEvent): string {
  const lines = [
    `DAG run ${event.runId} ended with status: ${event.status.toUpperCase()}`,
    `DAG name:    ${event.dagName}`,
    `Duration:    ${(event.durationMs / 1000).toFixed(1)}s`,
    `Timestamp:   ${event.timestamp}`,
  ];

  for (const [k, v] of Object.entries(this._opts.extraFields ?? {})) {
    lines.push(`${k}: ${v}`);
  }

  return lines.join('\n');
}

export function _extraJiraFields(this: IIssueSync): Record<string, unknown> {
  if (!this._opts.extraFields) return {};
  return {};
}

// ─── Static fromEnv ───────────────────────────────────────────────────────────

(IssueSync as unknown as Record<string, unknown>).fromEnv = function fromEnv(
  extra?: Partial<IssueSyncOptions>,
): IIssueSync | undefined {
  const jiraUrl   = process.env['JIRA_URL'];
  const jiraEmail = process.env['JIRA_EMAIL'];
  const jiraToken = process.env['JIRA_TOKEN'];
  const jiraProj  = process.env['JIRA_PROJECT'];

  if (jiraUrl && jiraEmail && jiraToken && jiraProj) {
    return new IssueSync({
      provider: 'jira',
      jira: { url: jiraUrl, email: jiraEmail, token: jiraToken, projectKey: jiraProj },
      ...extra,
    });
  }

  const linearKey    = process.env['LINEAR_API_KEY'];
  const linearTeamId = process.env['LINEAR_TEAM_ID'];

  if (linearKey && linearTeamId) {
    return new IssueSync({
      provider: 'linear',
      linear: { apiKey: linearKey, teamId: linearTeamId },
      ...extra,
    });
  }

  return undefined;
};
