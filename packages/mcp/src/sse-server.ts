/**
 * G-28: HTTP SSE (Server-Sent Events) live event stream for the MCP server.
 *
 * Exposes a real-time stream of all DagOrchestrator events over HTTP so that:
 *   - CI dashboards can display live run progress without polling
 *   - VS Code webview panels can subscribe without spawning extra processes
 *   - External monitors / Slack bots can watch runs
 *
 * Usage (from mcp/src/index.ts):
 *   import { startSseServer } from './sse-server.js';
 *   if (process.env['AIKIT_SSE_PORT']) {
 *     startSseServer(Number(process.env['AIKIT_SSE_PORT']));
 *   }
 *
 * Client usage:
 *   const evtSource = new EventSource('http://localhost:3747/events');
 *   evtSource.addEventListener('lane:end', (e) => console.log(JSON.parse(e.data)));
 *
 * To subscribe to a specific run only:
 *   GET /events?runId=abc123
 */

import { getGlobalEventBus, type DagEventMap } from '@ai-agencee/engine';
import * as http from 'http';
import { createOidcMiddleware, type MinimalResponse } from './oidc-auth.js';

type SseClient = {
  res: http.ServerResponse;
  runId?: string;
};

const DAG_EVENT_TYPES: Array<keyof DagEventMap> = [
  'dag:start',
  'dag:end',
  'lane:start',
  'lane:end',
  'llm:call',
  'budget:exceeded',
  'rbac:denied',
  'checkpoint:complete',
];

let _serverInstance: http.Server | null = null;

/**
 * Start the SSE HTTP server on `port` (default 3747).
 * Returns the http.Server so callers can `.close()` it.
 */
export function startSseServer(port = 3747): http.Server {
  if (_serverInstance) return _serverInstance;

  const clients: Set<SseClient> = new Set();
  const bus = getGlobalEventBus();

  // ─── Relay all DAG events to connected SSE clients ──────────────────────────
  for (const eventType of DAG_EVENT_TYPES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bus.on(eventType as any, (payload: unknown) => {
      const data = JSON.stringify(payload);
      const payloadRunId = (payload as Record<string, unknown>)['runId'] as string | undefined;

      for (const client of clients) {
        // Honor per-client runId filter
        if (client.runId && payloadRunId && client.runId !== payloadRunId) continue;
        sendSseEvent(client.res, eventType, data);
      }
    });
  }

  // ─── OIDC middleware (active when AIKIT_OIDC_ISSUER is set) ────────────────
  const oidcMiddleware = createOidcMiddleware();

  // Helper: adapt http.ServerResponse to MinimalResponse for the OIDC middleware
  function toMinimalRes(res: http.ServerResponse): MinimalResponse {
    let _statusCode = 200;
    return {
      status(code: number) { _statusCode = code; return this; },
      json(body: unknown) {
        if (!res.headersSent) {
          res.writeHead(_statusCode, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify(body));
      },
    } as MinimalResponse;
  }

  // ─── HTTP server ─────────────────────────────────────────────────────────────
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // Health check is always open — required by load balancers and k8s probes
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: clients.size }));
      return;
    }

    // Apply OIDC authentication to all non-health routes.
    // If AIKIT_OIDC_ISSUER is unset, the middleware is a no-op.
    let authPassed = false;
    await oidcMiddleware(req, toMinimalRes(res), () => { authPassed = true; });
    if (!authPassed) return; // middleware already sent 401

    // SSE event stream
    if (url.pathname === '/events') {
      const runId = url.searchParams.get('runId') ?? undefined;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      });

      // Initial ping so the client knows the connection is alive
      sendSseEvent(res, 'connected', JSON.stringify({ runId: runId ?? null }));

      const client: SseClient = { res, runId };
      clients.add(client);

      // Heartbeat every 30 s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30_000);

      req.on('close', () => {
        clients.delete(client);
        clearInterval(heartbeat);
      });

      return;
    }

    res.writeHead(404).end();
  });

  server.listen(port, '0.0.0.0', () => {
    // No console output — MCP server uses stdout for protocol; use stderr
    process.stderr.write(`[ai-kit] SSE event stream listening on http://0.0.0.0:${port}/events\n`);
  });

  _serverInstance = server;
  return server;
}

/**
 * Stop the SSE server if running. Primarily used in tests.
 */
export function stopSseServer(): void {
  if (_serverInstance) {
    _serverInstance.close();
    _serverInstance = null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendSseEvent(res: http.ServerResponse, event: string, data: string): void {
  try {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  } catch {
    // Client disconnected before we could write
  }
}
