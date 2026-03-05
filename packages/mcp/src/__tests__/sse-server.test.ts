/**
 * Integration tests for sse-server.ts
 *
 * Spins up a real HTTP server on a random port and sends real HTTP requests.
 * Each test uses a fresh port to avoid conflicts.
 */

import * as http from 'http';

// The module exports startSseServer / stopSseServer — import after mocking event bus
jest.mock('@ai-agencee/ai-kit-agent-executor', () => ({
  getGlobalEventBus: () => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    removeAllListeners: jest.fn(),
  }),
}));

import { startSseServer, stopSseServer } from '../sse-server';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let port = 37470;
function nextPort(): number {
  return ++port;
}

function getJson(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    }).on('error', reject);
  });
}

function getStream(url: string, timeoutMs = 1000): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; firstData: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      const timer = setTimeout(() => {
        req.destroy();
        resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, firstData: data });
      }, timeoutMs);

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
        // Resolve as soon as we see "event: connected"
        if (data.includes('event: connected')) {
          clearTimeout(timer);
          req.destroy();
          resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, firstData: data });
        }
      });
      res.on('error', () => {
        clearTimeout(timer);
        resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, firstData: data });
      });
    });
    req.on('error', reject);
    setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs + 500);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  stopSseServer();
});

describe('SSE Server — /health', () => {
  it('returns 200 with {ok:true} JSON', async () => {
    const p = nextPort();
    startSseServer(p);
    // Wait for server to be listening
    await new Promise((r) => setTimeout(r, 50));

    const { statusCode, body } = await getJson(`http://localhost:${p}/health`);
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed.ok).toBe(true);
  });

  it('returns client count as a number', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { body } = await getJson(`http://localhost:${p}/health`);
    const parsed = JSON.parse(body);
    expect(typeof parsed.clients).toBe('number');
  });
});

describe('SSE Server — /events', () => {
  it('returns 200 with text/event-stream content-type', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { statusCode, headers } = await getStream(`http://localhost:${p}/events`);
    expect(statusCode).toBe(200);
    expect(headers['content-type']).toContain('text/event-stream');
  });

  it('sends "event: connected" as first SSE event', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { firstData } = await getStream(`http://localhost:${p}/events`);
    expect(firstData).toContain('event: connected');
  });

  it('includes runId:null in connected event when no filter provided', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { firstData } = await getStream(`http://localhost:${p}/events`);
    expect(firstData).toContain('"runId":null');
  });

  it('sends runId in connected event when filter provided', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { firstData } = await getStream(`http://localhost:${p}/events?runId=test-run`);
    expect(firstData).toContain('"runId":"test-run"');
  });
});

describe('SSE Server — /unknown returns 404', () => {
  it('returns 404 for unknown paths', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    const { statusCode } = await getJson(`http://localhost:${p}/unknown`);
    expect(statusCode).toBe(404);
  });
});

describe('SSE Server — singleton management', () => {
  it('stopSseServer() closes the server without throwing', async () => {
    const p = nextPort();
    startSseServer(p);
    await new Promise((r) => setTimeout(r, 50));

    expect(() => stopSseServer()).not.toThrow();
  });

  it('stopSseServer() is idempotent (safe to call twice)', () => {
    const p = nextPort();
    startSseServer(p);
    stopSseServer();
    expect(() => stopSseServer()).not.toThrow();
  });

  it('returns the same server type on multiple start calls (after stop)', async () => {
    const p1 = nextPort();
    const srv1 = startSseServer(p1);
    expect(srv1).toBeInstanceOf(require('http').Server);
    stopSseServer();

    const p2 = nextPort();
    const srv2 = startSseServer(p2);
    expect(srv2).toBeInstanceOf(require('http').Server);
  });
});
