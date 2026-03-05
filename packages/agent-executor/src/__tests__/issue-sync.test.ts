/**
 * Unit tests for IssueSync — E11 Jira/Linear integration.
 * All HTTP calls are intercepted via global.fetch mock.
 */
export { }

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env['JIRA_URL'];
  delete process.env['JIRA_EMAIL'];
  delete process.env['JIRA_TOKEN'];
  delete process.env['JIRA_PROJECT'];
  delete process.env['LINEAR_API_KEY'];
  delete process.env['LINEAR_TEAM_ID'];
});

afterAll(() => { process.env = { ...ORIGINAL_ENV } });

function mockFetch(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Partial<Response>);
}

const DAG_FAILED: import('../lib/dag-events.js').DagEndEvent = {
  runId:       'run-abc',
  dagName:     'deployment-dag',
  status:      'failed',
  durationMs:  12_000,
  timestamp:   '2026-03-05T10:00:00.000Z',
};

const DAG_PARTIAL: import('../lib/dag-events.js').DagEndEvent = {
  runId:       'run-def',
  dagName:     'ci-dag',
  status:      'partial',
  durationMs:  8_000,
  timestamp:   '2026-03-05T11:00:00.000Z',
};

const DAG_SUCCESS: import('../lib/dag-events.js').DagEndEvent = {
  runId:       'run-ghi',
  dagName:     'ci-dag',
  status:      'success',
  durationMs:  6_000,
  timestamp:   '2026-03-05T12:00:00.000Z',
};

// ─── IssueSync.fromEnv() ──────────────────────────────────────────────────────

describe('IssueSync.fromEnv()', () => {
  it('returns undefined when no env vars are set', async () => {
    const { IssueSync } = await import('../lib/issue-sync.js');
    expect(IssueSync.fromEnv()).toBeUndefined();
  });

  it('returns a Jira-configured instance when JIRA_* vars are present', async () => {
    process.env['JIRA_URL']     = 'https://test.atlassian.net';
    process.env['JIRA_EMAIL']   = 'bot@example.com';
    process.env['JIRA_TOKEN']   = 'token123';
    process.env['JIRA_PROJECT'] = 'AIKIT';

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = IssueSync.fromEnv();
    expect(sync).toBeDefined();
  });

  it('returns a Linear-configured instance when LINEAR_* vars are present', async () => {
    process.env['LINEAR_API_KEY'] = 'lin_api_123';
    process.env['LINEAR_TEAM_ID'] = 'team-uuid';

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = IssueSync.fromEnv();
    expect(sync).toBeDefined();
  });

  it('prefers Jira over Linear when both are configured', async () => {
    process.env['JIRA_URL']       = 'https://test.atlassian.net';
    process.env['JIRA_EMAIL']     = 'bot@example.com';
    process.env['JIRA_TOKEN']     = 'token123';
    process.env['JIRA_PROJECT']   = 'AIKIT';
    process.env['LINEAR_API_KEY'] = 'lin_api_123';
    process.env['LINEAR_TEAM_ID'] = 'team-uuid';

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = IssueSync.fromEnv() as NonNullable<ReturnType<typeof IssueSync.fromEnv>>;

    // Cast to access internal opts for verification
    const opts = (sync as unknown as { opts: { provider: string } }).opts;
    expect(opts.provider).toBe('jira');
  });
});

// ─── Jira ─────────────────────────────────────────────────────────────────────

describe('IssueSync — Jira', () => {
  const JIRA_CONFIG = {
    url:        'https://myteam.atlassian.net',
    email:      'bot@example.com',
    token:      'jira-token',
    projectKey: 'AIKIT',
  };

  it('creates a Bug issue for a failed run', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({
      id:   '10001',
      key:  'AIKIT-42',
      self: 'https://myteam.atlassian.net/rest/api/3/issue/10001',
    });

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = new IssueSync({ provider: 'jira', jira: JIRA_CONFIG });

    const issue = await sync.createIssueForRun(DAG_FAILED);

    expect(issue).toBeDefined();
    expect(issue!.id).toBe('AIKIT-42');
    expect(issue!.provider).toBe('jira');
    expect(issue!.url).toBe('https://myteam.atlassian.net/browse/AIKIT-42');
    expect(issue!.title).toContain('FAILED');
    expect(issue!.title).toContain('deployment-dag');
  });

  it('sends POST to /rest/api/3/issue with correct URL', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok:   true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ id: '1', key: 'AIKIT-1', self: '' })),
          json: () => Promise.resolve({ id: '1', key: 'AIKIT-1', self: '' }),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    await new IssueSync({ provider: 'jira', jira: JIRA_CONFIG }).createIssueForRun(DAG_FAILED);

    expect(capturedUrl).toBe('https://myteam.atlassian.net/rest/api/3/issue');
  });

  it('uses Basic Auth header derived from email:token', async () => {
    let capturedAuth = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedAuth = (init.headers as Record<string, string>)?.['Authorization'] ?? '';
        return Promise.resolve({
          ok:   true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ id: '1', key: 'AIKIT-1', self: '' })),
          json: () => Promise.resolve({ id: '1', key: 'AIKIT-1', self: '' }),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    await new IssueSync({ provider: 'jira', jira: JIRA_CONFIG }).createIssueForRun(DAG_FAILED);

    const expected = 'Basic ' + Buffer.from('bot@example.com:jira-token').toString('base64');
    expect(capturedAuth).toBe(expected);
  });

  it('uses issuetype=Bug for failed, Task for partial', async () => {
    const bodies: unknown[] = [];
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return Promise.resolve({
          ok:   true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ id: '1', key: 'AIKIT-1', self: '' })),
          json: () => Promise.resolve({ id: '1', key: 'AIKIT-1', self: '' }),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = new IssueSync({ provider: 'jira', jira: JIRA_CONFIG });

    await sync.createIssueForRun(DAG_FAILED);
    await sync.createIssueForRun(DAG_PARTIAL);

    const [bugBody, taskBody] = bodies as Array<{ fields: { issuetype: { name: string } } }>;
    expect(bugBody!.fields.issuetype.name).toBe('Bug');
    expect(taskBody!.fields.issuetype.name).toBe('Task');
  });

  it('returns undefined for a successful run', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({});
    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync   = new IssueSync({ provider: 'jira', jira: JIRA_CONFIG });
    const result = await sync.createIssueForRun(DAG_SUCCESS);
    expect(result).toBeUndefined();
  });

  it('respects failuresOnly flag — skips partial', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({});
    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync   = new IssueSync({ provider: 'jira', jira: JIRA_CONFIG, failuresOnly: true });
    const result = await sync.createIssueForRun(DAG_PARTIAL);
    expect(result).toBeUndefined();
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it('throws on non-ok HTTP response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch('Unauthorized', false, 401);
    const { IssueSync } = await import('../lib/issue-sync.js');
    await expect(
      new IssueSync({ provider: 'jira', jira: JIRA_CONFIG }).createIssueForRun(DAG_FAILED)
    ).rejects.toThrow(/401/);
  });
});

// ─── Linear ───────────────────────────────────────────────────────────────────

describe('IssueSync — Linear', () => {
  const LINEAR_CONFIG = {
    apiKey: 'lin_api_test',
    teamId: 'team-uuid-1234',
  };

  const LINEAR_SUCCESS_RESP = {
    data: {
      issueCreate: {
        success: true,
        issue: {
          id:         'issue-uuid-abc',
          identifier: 'ENG-99',
          url:        'https://linear.app/my-team/issue/ENG-99',
        },
      },
    },
  };

  it('creates an issue on Linear for a failed run', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch(LINEAR_SUCCESS_RESP);

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync  = new IssueSync({ provider: 'linear', linear: LINEAR_CONFIG });
    const issue = await sync.createIssueForRun(DAG_FAILED);

    expect(issue).toBeDefined();
    expect(issue!.id).toBe('ENG-99');
    expect(issue!.url).toBe('https://linear.app/my-team/issue/ENG-99');
    expect(issue!.provider).toBe('linear');
  });

  it('sends a GraphQL mutation to https://api.linear.app/graphql', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok:   true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(LINEAR_SUCCESS_RESP)),
          json: () => Promise.resolve(LINEAR_SUCCESS_RESP),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    await new IssueSync({ provider: 'linear', linear: LINEAR_CONFIG }).createIssueForRun(DAG_FAILED);

    expect(capturedUrl).toBe('https://api.linear.app/graphql');
  });

  it('sends Authorization header with API key', async () => {
    let capturedAuth = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedAuth = (init.headers as Record<string, string>)?.['Authorization'] ?? '';
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify(LINEAR_SUCCESS_RESP)),
          json: () => Promise.resolve(LINEAR_SUCCESS_RESP),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    await new IssueSync({ provider: 'linear', linear: LINEAR_CONFIG }).createIssueForRun(DAG_FAILED);

    expect(capturedAuth).toBe('lin_api_test');
  });

  it('throws when graphQL errors are returned', async () => {
    const errResp = { errors: [{ message: 'Not authenticated' }] };
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch(errResp);

    const { IssueSync } = await import('../lib/issue-sync.js');
    await expect(
      new IssueSync({ provider: 'linear', linear: LINEAR_CONFIG }).createIssueForRun(DAG_FAILED),
    ).rejects.toThrow('Not authenticated');
  });

  it('sets priority=1 (urgent) for failed, priority=2 (high) for partial', async () => {
    const bodies: unknown[] = [];
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify(LINEAR_SUCCESS_RESP)),
          json: () => Promise.resolve(LINEAR_SUCCESS_RESP),
        } as Partial<Response>);
      },
    );

    const { IssueSync } = await import('../lib/issue-sync.js');
    const sync = new IssueSync({ provider: 'linear', linear: LINEAR_CONFIG });

    await sync.createIssueForRun(DAG_FAILED);
    await sync.createIssueForRun(DAG_PARTIAL);

    const [failedBody, partialBody] = bodies as Array<{ variables: { input: { priority: number } } }>;
    expect(failedBody!.variables.input.priority).toBe(1);
    expect(partialBody!.variables.input.priority).toBe(2);
  });
});

// ─── Event bus integration ────────────────────────────────────────────────────

describe('IssueSync — event bus', () => {
  it('attaches and fires on dag:end events', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch({ id: '1', key: 'A-1', self: '' });

    const { IssueSync } = await import('../lib/issue-sync.js');
    const { DagEventBus } = await import('../lib/dag-events.js');

    const bus  = new DagEventBus();
    const sync = new IssueSync({
      provider: 'jira',
      jira: { url: 'https://t.atlassian.net', email: 'x@x.com', token: 'tok', projectKey: 'T' },
    });

    sync.attach(bus);

    // Allow the async fire-and-forget to complete
    await new Promise<void>((resolve) => {
      (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
        resolve();
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify({ id: '1', key: 'A-1', self: '' })),
          json: () => Promise.resolve({ id: '1', key: 'A-1', self: '' }),
        } as Partial<Response>);
      });

      bus.emitDagEnd(DAG_FAILED);
    });

    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalled();

    sync.detach(bus);
  });

  it('detach() stops creating issues', async () => {
    const { IssueSync } = await import('../lib/issue-sync.js');
    const { DagEventBus } = await import('../lib/dag-events.js');

    const fetchMock = mockFetch({ id: '1', key: 'A-1', self: '' });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const bus  = new DagEventBus();
    const sync = new IssueSync({
      provider: 'jira',
      jira: { url: 'https://t.atlassian.net', email: 'x@x.com', token: 'tok', projectKey: 'T' },
    });

    sync.attach(bus);
    sync.detach(bus);

    bus.emitDagEnd(DAG_FAILED);
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
