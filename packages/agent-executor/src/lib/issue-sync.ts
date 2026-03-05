/**
 * E11 — Issue Sync (Jira / Linear)
 *
 * Subscribes to DAG lifecycle events and automatically creates issues in
 * Jira or Linear based on run outcomes:
 *
 *   dag:end  status=failed   → create Bug / "block" priority issue
 *   dag:end  status=partial  → create Task / normal priority issue
 *   dag:end  status=success  (optional) → close an existing linked issue
 *
 * Both providers use zero SDK dependencies — pure HTTP fetch with API-key auth.
 *
 * ─── Jira configuration ──────────────────────────────────────────────────────
 *   JIRA_URL       e.g. https://myteam.atlassian.net
 *   JIRA_EMAIL     Atlassian account email for Basic Auth
 *   JIRA_TOKEN     API token (https://id.atlassian.com/manage-profile/security/api-tokens)
 *   JIRA_PROJECT   Project key (e.g. "AIKIT")
 *
 * ─── Linear configuration ────────────────────────────────────────────────────
 *   LINEAR_API_KEY  Personal API key or OAuth token
 *   LINEAR_TEAM_ID  Team ID (UUID) to create issues in
 *
 * Usage:
 *   const sync = new IssueSync({
 *     provider: 'jira',
 *     jira: { url: '...', email: '...', token: '...', projectKey: 'AIKIT' },
 *   });
 *   sync.attach(getGlobalEventBus());      // start listening for DAG events
 *
 * Or via factory:
 *   const sync = IssueSync.fromEnv();     // reads env vars automatically
 *   if (sync) sync.attach(bus);
 */

import type { DagEventBus, DagEndEvent } from './dag-events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueSyncProvider = 'jira' | 'linear';

export interface JiraOptions {
  /** Base URL of your Jira Cloud instance, e.g. https://myteam.atlassian.net */
  url:        string;
  /** Atlassian account email (for Basic Auth). */
  email:      string;
  /** Atlassian API token. */
  token:      string;
  /** Jira project key, e.g. "AIKIT". */
  projectKey: string;
  /** Issue type to create (default: "Bug" for failed, "Task" for partial). */
  issueType?: string;
}

export interface LinearOptions {
  /** Linear API key or OAuth token. */
  apiKey: string;
  /** Team ID (UUID) to create issues in. */
  teamId: string;
  /** Label to attach to created issues. */
  label?: string;
}

export interface IssueSyncOptions {
  provider: IssueSyncProvider;
  jira?:    JiraOptions;
  linear?:  LinearOptions;
  /**
   * Only create issues when a run fails (not for partial/success).
   * @default false
   */
  failuresOnly?: boolean;
  /**
   * Extra key/value metadata to include in issue descriptions.
   */
  extraFields?: Record<string, string>;
}

export interface CreatedIssue {
  provider: IssueSyncProvider;
  id:       string;
  url:      string;
  title:    string;
}

// ─── Internal HTTP helper ─────────────────────────────────────────────────────

async function httpPost(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
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

// ─── IssueSync ────────────────────────────────────────────────────────────────

/**
 * Listens to DAG events and creates issues in Jira or Linear on failures.
 */
export class IssueSync {
  private readonly opts: IssueSyncOptions;

  constructor(opts: IssueSyncOptions) {
    this.opts = opts;
  }

  // ─── Factory ─────────────────────────────────────────────────────────────

  /**
   * Build an IssueSync from environment variables.
   * Returns `undefined` when neither Jira nor Linear is configured.
   *
   * Jira env:   JIRA_URL, JIRA_EMAIL, JIRA_TOKEN, JIRA_PROJECT
   * Linear env: LINEAR_API_KEY, LINEAR_TEAM_ID
   */
  static fromEnv(extra?: Partial<IssueSyncOptions>): IssueSync | undefined {
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
  }

  // ─── Event bus attachment ─────────────────────────────────────────────────

  /**
   * Subscribe to `dag:end` on `bus`.
   * Call `detach()` to unsubscribe later.
   */
  attach(bus: DagEventBus): void {
    bus.on('dag:end', this._onDagEnd);
  }

  /** Remove the `dag:end` subscription from `bus`. */
  detach(bus: DagEventBus): void {
    bus.removeListener('dag:end', this._onDagEnd);
  }

  // ─── Manual create ────────────────────────────────────────────────────────

  /**
   * Directly create an issue for a `DagEndEvent` without going through the bus.
   * Returns `undefined` when the event doesn't meet the filter criteria.
   */
  async createIssueForRun(event: DagEndEvent): Promise<CreatedIssue | undefined> {
    const { failuresOnly = false } = this.opts;

    if (event.status === 'success') return undefined;
    if (failuresOnly && event.status !== 'failed') return undefined;

    const title = this._title(event);
    const body  = this._body(event);

    if (this.opts.provider === 'jira') {
      return this._createJiraIssue(title, body, event);
    } else {
      return this._createLinearIssue(title, body, event);
    }
  }

  // ─── Jira ─────────────────────────────────────────────────────────────────

  private async _createJiraIssue(
    title: string,
    body:  string,
    event: DagEndEvent,
  ): Promise<CreatedIssue> {
    const jira = this.opts.jira;
    if (!jira) throw new Error('IssueSync: Jira options not provided');

    const issueType = event.status === 'failed'
      ? (jira.issueType ?? 'Bug')
      : 'Task';

    const payload = {
      fields: {
        project:     { key: jira.projectKey },
        summary:     title,
        description: {
          type:    'doc',
          version: 1,
          content: [{
            type:    'paragraph',
            content: [{ type: 'text', text: body }],
          }],
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

  // ─── Linear ───────────────────────────────────────────────────────────────

  private async _createLinearIssue(
    title: string,
    body:  string,
    event: DagEndEvent,
  ): Promise<CreatedIssue> {
    const linear = this.opts.linear;
    if (!linear) throw new Error('IssueSync: Linear options not provided');

    const priorityMap: Record<string, number> = {
      failed:  1, // urgent
      partial: 2, // high
      success: 3, // normal
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private readonly _onDagEnd = (event: DagEndEvent): void => {
    // fire-and-forget; errors swallowed to not disrupt the bus
    this.createIssueForRun(event).catch(() => undefined);
  };

  private _title(event: DagEndEvent): string {
    const statusLabel = event.status === 'failed' ? '🔴 FAILED' : '🟡 PARTIAL';
    return `[${statusLabel}] DAG "${event.dagName}" — run ${event.runId}`;
  }

  private _body(event: DagEndEvent): string {
    const lines = [
      `DAG run ${event.runId} ended with status: ${event.status.toUpperCase()}`,
      `DAG name:    ${event.dagName}`,
      `Duration:    ${(event.durationMs / 1000).toFixed(1)}s`,
      `Timestamp:   ${event.timestamp}`,
    ];

    for (const [k, v] of Object.entries(this.opts.extraFields ?? {})) {
      lines.push(`${k}: ${v}`);
    }

    return lines.join('\n');
  }

  private _extraJiraFields(): Record<string, unknown> {
    if (!this.opts.extraFields) return {};
    // Extra fields go into a custom field if Jira is configured for it
    return {};
  }
}
