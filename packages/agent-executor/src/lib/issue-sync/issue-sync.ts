import type { DagEndEvent, DagEventBus } from '../dag-events.js';

export type { DagEndEvent, DagEventBus };

export type IssueSyncProvider = 'jira' | 'linear';

export interface JiraOptions {
  url:        string;
  email:      string;
  token:      string;
  projectKey: string;
  issueType?: string;
}

export interface LinearOptions {
  apiKey: string;
  teamId: string;
  label?: string;
}

export interface IssueSyncOptions {
  provider:      IssueSyncProvider;
  jira?:         JiraOptions;
  linear?:       LinearOptions;
  failuresOnly?: boolean;
  extraFields?:  Record<string, string>;
}

export interface CreatedIssue {
  provider: IssueSyncProvider;
  id:       string;
  url:      string;
  title:    string;
}

export interface IIssueSync {
  _opts:      IssueSyncOptions;
  _onDagEnd:  (event: DagEndEvent) => void;

  attach(bus: DagEventBus): void;
  detach(bus: DagEventBus): void;
  createIssueForRun(event: DagEndEvent): Promise<CreatedIssue | undefined>;
  _createJiraIssue(title: string, body: string, event: DagEndEvent): Promise<CreatedIssue>;
  _createLinearIssue(title: string, body: string, event: DagEndEvent): Promise<CreatedIssue>;
  _title(event: DagEndEvent): string;
  _body(event: DagEndEvent): string;
  _extraJiraFields(): Record<string, unknown>;
}

export const IssueSync = function IssueSync(
  this: IIssueSync,
  opts: IssueSyncOptions,
) {
  this._opts = opts;
  // Bound arrow so removeListener works correctly
  this._onDagEnd = (event: DagEndEvent): void => {
    this.createIssueForRun(event).catch(() => undefined);
  };
} as unknown as {
  new (opts: IssueSyncOptions): IIssueSync;
  fromEnv(extra?: Partial<IssueSyncOptions>): IIssueSync | undefined;
};
