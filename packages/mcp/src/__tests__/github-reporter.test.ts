/**
 * Unit tests for github-reporter.ts (packages/mcp)
 * All network calls (fetch) are mocked.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env['GITHUB_TOKEN'];
  delete process.env['GITHUB_REPOSITORY'];
  delete process.env['GITHUB_PR_NUMBER'];
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import { buildPrCommentBody, postPrComment } from '../github-reporter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FetchCall = [string, RequestInit];

function mockFetch(responses: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  let index = 0;
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation(() => {
    const resp = responses[index] ?? responses[responses.length - 1];
    index++;
    return Promise.resolve({ ...resp, text: () => Promise.resolve('') });
  });
}

// ─── buildPrCommentBody ───────────────────────────────────────────────────────

describe('buildPrCommentBody()', () => {
  it('contains the html marker <!-- ai-kit:pr-comment -->', () => {
    const body = buildPrCommentBody({
      dagName: 'test-dag',
      runId: 'run-abc',
      status: 'success',
      lanes: [],
      totalCostUSD: 0.001,
    });
    expect(body).toContain('<!-- ai-kit:pr-comment -->');
  });

  it('uses ✅ emoji for success status', () => {
    const body = buildPrCommentBody({ dagName: 'dag', runId: 'r1', status: 'success', lanes: [], totalCostUSD: 0 });
    expect(body).toContain('✅');
  });

  it('uses ⚠️ emoji for partial status', () => {
    const body = buildPrCommentBody({ dagName: 'dag', runId: 'r1', status: 'partial', lanes: [], totalCostUSD: 0 });
    expect(body).toContain('⚠️');
  });

  it('uses ❌ emoji for failed status', () => {
    const body = buildPrCommentBody({ dagName: 'dag', runId: 'r1', status: 'failed', lanes: [], totalCostUSD: 0 });
    expect(body).toContain('❌');
  });

  it('includes the dagName', () => {
    const body = buildPrCommentBody({ dagName: 'my-workflow', runId: 'r1', status: 'success', lanes: [], totalCostUSD: 0 });
    expect(body).toContain('my-workflow');
  });

  it('includes the runId', () => {
    const body = buildPrCommentBody({ dagName: 'dag', runId: 'run-xyz-123', status: 'success', lanes: [], totalCostUSD: 0 });
    expect(body).toContain('run-xyz-123');
  });

  it('includes totalCostUSD formatted to 4 decimal places', () => {
    const body = buildPrCommentBody({ dagName: 'dag', runId: 'r1', status: 'success', lanes: [], totalCostUSD: 0.00123 });
    expect(body).toContain('$0.0012');
  });

  it('includes lane rows in a markdown table', () => {
    const body = buildPrCommentBody({
      dagName: 'dag', runId: 'r1', status: 'success',
      lanes: [
        { id: 'backend', status: 'pass', durationMs: 5000 },
        { id: 'frontend', status: 'pass', durationMs: 3200 },
      ],
      totalCostUSD: 0,
    });
    expect(body).toContain('backend');
    expect(body).toContain('frontend');
    expect(body).toContain('5.0s');
    expect(body).toContain('3.2s');
  });

  it('includes optional summary section when provided', () => {
    const body = buildPrCommentBody({
      dagName: 'dag', runId: 'r1', status: 'success', lanes: [], totalCostUSD: 0,
      summary: 'All checks passed cleanly.',
    });
    expect(body).toContain('All checks passed cleanly.');
    expect(body).toContain('### Summary');
  });
});

// ─── postPrComment ────────────────────────────────────────────────────────────

describe('postPrComment()', () => {
  it('throws when GITHUB_TOKEN is missing', async () => {
    await expect(
      postPrComment({ body: 'test', repository: 'owner/repo', prNumber: 1 })
    ).rejects.toThrow('GITHUB_TOKEN is required');
  });

  it('throws when GITHUB_REPOSITORY is missing', async () => {
    await expect(
      postPrComment({ body: 'test', token: 'tok', prNumber: 1 })
    ).rejects.toThrow('GITHUB_REPOSITORY is required');
  });

  it('throws when GITHUB_PR_NUMBER is missing/invalid', async () => {
    await expect(
      postPrComment({ body: 'test', token: 'tok', repository: 'owner/repo' })
    ).rejects.toThrow(/GITHUB_PR_NUMBER/);
  });

  it('reads token from GITHUB_TOKEN env', async () => {
    process.env['GITHUB_TOKEN'] = 'env-token';
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    process.env['GITHUB_PR_NUMBER'] = '42';

    let authHeader = '';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      authHeader = (opts.headers as Record<string, string>)['Authorization'] ?? '';
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve(''),
      });
    });

    // Second call (POST) returns the comment
    let postCallCount = 0;
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const method = opts.method ?? 'GET';
      postCallCount++;
      authHeader = (opts.headers as Record<string, string>)['Authorization'] ?? '';
      if (method === 'POST') {
        return Promise.resolve({
          ok: true, status: 201,
          json: () => Promise.resolve({ html_url: 'https://github.com/comment/1' }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve(''),
      });
    });

    const url = await postPrComment({ body: '<!-- ai-kit:pr-comment -->\ntest' });

    expect(authHeader).toContain('env-token');
    expect(url).toBe('https://github.com/comment/1');
  });

  it('calls DELETE for existing bot comments when replacePrevious=true', async () => {
    const fetchCalls: FetchCall[] = [];

    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string, opts: RequestInit) => {
      fetchCalls.push([url, opts ?? {}]);
      const method = (opts?.method ?? 'GET').toUpperCase();

      if (method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
      }
      if (method === 'POST') {
        return Promise.resolve({
          ok: true, status: 201,
          json: () => Promise.resolve({ html_url: 'https://github.com/comment/99' }),
          text: () => Promise.resolve(''),
        });
      }
      // GET: list comments — return one bot comment with the marker
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve([{
          id: 55,
          body: '<!-- ai-kit:pr-comment -->\nold comment',
          user: { login: 'github-actions[bot]', type: 'Bot' },
        }]),
        text: () => Promise.resolve(''),
      });
    });

    await postPrComment({
      body: '<!-- ai-kit:pr-comment -->\nnew comment',
      token: 'tok',
      repository: 'owner/repo',
      prNumber: 1,
      replacePrevious: true,
    });

    const deleteCalls = fetchCalls.filter(([, opts]) => (opts.method ?? 'GET').toUpperCase() === 'DELETE');
    expect(deleteCalls.length).toBeGreaterThan(0);
    expect(deleteCalls[0]?.[0]).toContain('/55');
  });

  it('skips DELETE when replacePrevious=false', async () => {
    const fetchCalls: FetchCall[] = [];

    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((url: string, opts: RequestInit) => {
      fetchCalls.push([url, opts ?? {}]);
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        return Promise.resolve({
          ok: true, status: 201,
          json: () => Promise.resolve({ html_url: 'https://github.com/comment/10' }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
    });

    await postPrComment({
      body: 'test',
      token: 'tok',
      repository: 'owner/repo',
      prNumber: 1,
      replacePrevious: false,
    });

    const deleteCalls = fetchCalls.filter(([, opts]) => (opts?.method ?? 'GET').toUpperCase() === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('throws on non-200 POST response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        return Promise.resolve({
          ok: false, status: 403,
          json: () => Promise.resolve({ message: 'Forbidden' }),
          text: () => Promise.resolve('Forbidden'),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
    });

    await expect(
      postPrComment({ body: 'test', token: 'tok', repository: 'owner/repo', prNumber: 1, replacePrevious: false })
    ).rejects.toThrow(/403/);
  });
});
