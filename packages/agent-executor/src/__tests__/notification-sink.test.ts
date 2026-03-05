/**
 * Unit tests for NotificationSink — E12 Slack / Teams notifications.
 * All HTTP calls are intercepted via global.fetch mock.
 */
export { }

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env['SLACK_WEBHOOK_URL'];
  delete process.env['TEAMS_WEBHOOK_URL'];
});

afterAll(() => { process.env = { ...ORIGINAL_ENV } });

function mockFetch(ok = true, status = 200, body = 'ok') {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({ status: 'ok' }),
  } as Partial<Response>);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DAG_SUCCESS: import('../lib/dag-events.js').DagEndEvent = {
  runId:      'run-001',
  dagName:    'deploy-dag',
  status:     'success',
  durationMs: 5000,
  timestamp:  '2026-03-05T09:00:00.000Z',
};

const DAG_FAILED: import('../lib/dag-events.js').DagEndEvent = {
  runId:      'run-002',
  dagName:    'deploy-dag',
  status:     'failed',
  durationMs: 8000,
  timestamp:  '2026-03-05T09:05:00.000Z',
};

const DAG_PARTIAL: import('../lib/dag-events.js').DagEndEvent = {
  runId:      'run-003',
  dagName:    'ci-dag',
  status:     'partial',
  durationMs: 12000,
  timestamp:  '2026-03-05T09:10:00.000Z',
};

const LANE_END: import('../lib/dag-events.js').LaneEndEvent = {
  runId:      'run-001',
  laneId:     'backend',
  status:     'failed',
  durationMs: 3000,
  retries:    2,
  timestamp:  '2026-03-05T09:01:00.000Z',
};

const BUDGET_EVENT: import('../lib/dag-events.js').BudgetExceededEvent = {
  runId:     'run-002',
  laneId:    'frontend',
  limitUSD:  2.00,
  actualUSD: 3.50,
  scope:     'run',
  timestamp: '2026-03-05T09:06:00.000Z',
};

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('NotificationSink — constructor', () => {
  it('throws when neither slack nor teams is configured', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(() => new NotificationSink({} as never)).toThrow();
  });

  it('accepts slack-only config', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(
      () => new NotificationSink({ slack: { webhookUrl: 'https://hooks.slack.com/x' } }),
    ).not.toThrow();
  });

  it('accepts teams-only config', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(
      () => new NotificationSink({ teams: { webhookUrl: 'https://outlook.office.com/x' } }),
    ).not.toThrow();
  });

  it('accepts both slack and teams', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(
      () => new NotificationSink({
        slack: { webhookUrl: 'https://hooks.slack.com/x' },
        teams: { webhookUrl: 'https://outlook.office.com/x' },
      }),
    ).not.toThrow();
  });
});

// ─── fromEnv() ────────────────────────────────────────────────────────────────

describe('NotificationSink.fromEnv()', () => {
  it('returns undefined when no env vars set', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(NotificationSink.fromEnv()).toBeUndefined();
  });

  it('returns instance when SLACK_WEBHOOK_URL is set', async () => {
    process.env['SLACK_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(NotificationSink.fromEnv()).toBeDefined();
  });

  it('returns instance when TEAMS_WEBHOOK_URL is set', async () => {
    process.env['TEAMS_WEBHOOK_URL'] = 'https://outlook.office.com/test';
    const { NotificationSink } = await import('../lib/notification-sink.js');
    expect(NotificationSink.fromEnv()).toBeDefined();
  });

  it('returns instance with both when both env vars are set', async () => {
    process.env['SLACK_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
    process.env['TEAMS_WEBHOOK_URL'] = 'https://outlook.office.com/test';
    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = NotificationSink.fromEnv()!;
    const opts = (sink as unknown as { opts: { slack?: object; teams?: object } }).opts;
    expect(opts.slack).toBeDefined();
    expect(opts.teams).toBeDefined();
  });
});

// ─── Slack — sendDagEnd() ─────────────────────────────────────────────────────

describe('NotificationSink — Slack dag:end', () => {
  it('POSTs to the Slack webhook URL', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
    });

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({ slack: { webhookUrl: 'https://hooks.slack.com/my-hook' } });

    await sink.sendDagEnd(DAG_FAILED);

    expect(capturedUrl).toBe('https://hooks.slack.com/my-hook');
  });

  it('payload contains dag name and run ID', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ slack: { webhookUrl: 'https://x' } }).sendDagEnd(DAG_FAILED);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('deploy-dag');
    expect(body).toContain('run-002');
  });

  it('includes "danger" color for failed runs', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ slack: { webhookUrl: 'https://x' } }).sendDagEnd(DAG_FAILED);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('danger');
  });

  it('includes "warning" color for partial runs', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ slack: { webhookUrl: 'https://x' } }).sendDagEnd(DAG_PARTIAL);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('warning');
  });

  it('skips send for success when failuresOnly=true', async () => {
    const fetchMock = mockFetch();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({
      slack:         { webhookUrl: 'https://x' },
      failuresOnly:  true,
    });

    await sink.sendDagEnd(DAG_SUCCESS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects custom username and channel options', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({
      slack: { webhookUrl: 'https://x', username: 'CI Bot', iconEmoji: ':ci:', channel: '#alerts' },
    }).sendDagEnd(DAG_FAILED);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('CI Bot');
    expect(body).toContain('#alerts');
  });

  it('throws when Slack returns non-ok response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch(false, 400, 'invalid_payload');

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({ slack: { webhookUrl: 'https://x' } });

    await expect(sink.sendDagEnd(DAG_FAILED)).rejects.toThrow(/400/);
  });
});

// ─── Teams — sendDagEnd() ─────────────────────────────────────────────────────

describe('NotificationSink — Teams dag:end', () => {
  it('POSTs to the Teams webhook URL', async () => {
    let capturedUrl = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('1') } as Partial<Response>);
    });

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({ teams: { webhookUrl: 'https://outlook.office.com/my-hook' } });

    await sink.sendDagEnd(DAG_FAILED);

    expect(capturedUrl).toBe('https://outlook.office.com/my-hook');
  });

  it('payload is a MessageCard with correct themeColor for failure', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('1') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ teams: { webhookUrl: 'https://x' } }).sendDagEnd(DAG_FAILED);

    const body = capturedBody as { '@type': string; themeColor: string };
    expect(body['@type']).toBe('MessageCard');
    expect(body.themeColor).toBe('d93025');  // red for failure
  });

  it('payload contains dag name', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('1') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ teams: { webhookUrl: 'https://x' } }).sendDagEnd(DAG_FAILED);

    expect(JSON.stringify(capturedBody)).toContain('deploy-dag');
  });
});

// ─── Both providers simultaneously ───────────────────────────────────────────

describe('NotificationSink — both Slack + Teams', () => {
  it('sends to both webhooks in parallel', async () => {
    const capturedUrls: string[] = [];
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
    });

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({
      slack: { webhookUrl: 'https://slack/hook' },
      teams: { webhookUrl: 'https://teams/hook' },
    });

    await sink.sendDagEnd(DAG_FAILED);

    expect(capturedUrls).toContain('https://slack/hook');
    expect(capturedUrls).toContain('https://teams/hook');
    expect(capturedUrls).toHaveLength(2);
  });

  it('propagates error when one sink fails', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>))
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('Service unavailable') } as Partial<Response>));

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({
      slack: { webhookUrl: 'https://slack/hook' },
      teams: { webhookUrl: 'https://teams/hook' },
    });

    await expect(sink.sendDagEnd(DAG_FAILED)).rejects.toThrow(/503/);
  });
});

// ─── Lane end notifications ───────────────────────────────────────────────────

describe('NotificationSink — sendLaneEnd()', () => {
  it('POSTs lane info to Slack when notifyLaneEnd=true via attach()', async () => {
    const fetchMock = mockFetch();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({
      slack:          { webhookUrl: 'https://x' },
      notifyLaneEnd:  true,
    });

    await sink.sendLaneEnd(LANE_END);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lane end payload contains laneId and retries', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ slack: { webhookUrl: 'https://x' } }).sendLaneEnd(LANE_END);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('backend');
    expect(body).toContain('2');  // retries
  });
});

// ─── Budget notifications ─────────────────────────────────────────────────────

describe('NotificationSink — sendBudgetExceeded()', () => {
  it('sends a Slack budget alert', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ slack: { webhookUrl: 'https://x' } }).sendBudgetExceeded(BUDGET_EVENT);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('Budget');
    expect(body).toContain('2.00');
    expect(body).toContain('3.50');
  });

  it('sends a Teams budget alert', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('1') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    await new NotificationSink({ teams: { webhookUrl: 'https://x' } }).sendBudgetExceeded(BUDGET_EVENT);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('Budget');
    expect(body).toContain('frontend');
  });
});

// ─── Event bus integration ────────────────────────────────────────────────────

describe('NotificationSink — event bus attach/detach', () => {
  it('attach() wires dag:end → sendDagEnd', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    const { DagEventBus }       = await import('../lib/dag-events.js');

    const bus  = new DagEventBus();
    const sink = new NotificationSink({ slack: { webhookUrl: 'https://x' } });

    await new Promise<void>((resolve) => {
      (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
        resolve();
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      });

      sink.attach(bus);
      bus.emitDagEnd(DAG_FAILED);
    });

    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalled();
    sink.detach(bus);
  });

  it('attach() wires budget:exceeded → sendBudgetExceeded', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    const { DagEventBus }       = await import('../lib/dag-events.js');

    const bus  = new DagEventBus();
    const sink = new NotificationSink({ slack: { webhookUrl: 'https://x' } });

    await new Promise<void>((resolve) => {
      (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
        resolve();
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      });

      sink.attach(bus);
      bus.emitBudgetExceeded(BUDGET_EVENT);
    });

    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalled();
    sink.detach(bus);
  });

  it('detach() stops all notifications', async () => {
    const fetchMock = mockFetch();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const { DagEventBus }       = await import('../lib/dag-events.js');

    const bus  = new DagEventBus();
    const sink = new NotificationSink({ slack: { webhookUrl: 'https://x' } });

    sink.attach(bus);
    sink.detach(bus);

    bus.emitDagEnd(DAG_FAILED);
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attach() wires lane:end when notifyLaneEnd=true', async () => {
    const { NotificationSink } = await import('../lib/notification-sink.js');
    const { DagEventBus }       = await import('../lib/dag-events.js');

    const bus  = new DagEventBus();
    const sink = new NotificationSink({
      slack:          { webhookUrl: 'https://x' },
      notifyLaneEnd:  true,
    });

    await new Promise<void>((resolve) => {
      (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
        resolve();
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      });

      sink.attach(bus);
      bus.emitLaneEnd(LANE_END);
    });

    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalled();
    sink.detach(bus);
  });

  it('extraContext appears in notifications', async () => {
    let capturedBody: unknown;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as Partial<Response>);
      },
    );

    const { NotificationSink } = await import('../lib/notification-sink.js');
    const sink = new NotificationSink({
      slack:        { webhookUrl: 'https://x' },
      extraContext: { Environment: 'staging', Team: 'platform' },
    });

    await sink.sendDagEnd(DAG_FAILED);

    const body = JSON.stringify(capturedBody);
    expect(body).toContain('staging');
    expect(body).toContain('platform');
  });
});
