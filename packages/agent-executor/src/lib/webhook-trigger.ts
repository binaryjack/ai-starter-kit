/**
 * G-16: GitHub Webhook Trigger
 *
 * Lightweight HTTP server that listens for GitHub webhook events and triggers
 * DAG runs in response to push / pull_request / workflow_dispatch events.
 *
 * Features:
 *   - HMAC-SHA256 signature verification (X-Hub-Signature-256)
 *   - Configurable event → dag.json mapping
 *   - Graceful shutdown via AbortController
 *   - No external dependencies beyond Node.js built-ins
 *
 * Usage:
 *   const trigger = new GitHubWebhookTrigger({
 *     port: 9000,
 *     secret: process.env.GITHUB_WEBHOOK_SECRET!,
 *     routes: [
 *       { event: 'push', ref: 'refs/heads/main', dagFile: 'agents/dag.json' },
 *       { event: 'pull_request', action: 'opened', dagFile: 'agents/pr-review.dag.json' },
 *     ],
 *     projectRoot: process.cwd(),
 *     onTrigger: async (dagFile, payload) => {
 *       await DagOrchestrator.run(dagFile, projectRoot, { verbose: true });
 *     },
 *   });
 *   await trigger.start();
 *   // ... later ...
 *   await trigger.stop();
 */

import * as crypto from 'crypto';
import * as http from 'http';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookRoute {
  /** GitHub event name: 'push' | 'pull_request' | 'workflow_dispatch' | '*' */
  event: string;
  /** Only trigger when payload ref matches (for push events). Glob-style '*' for any. */
  ref?: string;
  /** Only trigger when payload action matches (for PR events). */
  action?: string;
  /** Path to the dag.json to execute when this route matches */
  dagFile: string;
}

export interface GitHubWebhookPayload {
  ref?: string;
  action?: string;
  repository?: { full_name: string; clone_url: string };
  sender?: { login: string };
  head_commit?: { id: string; message: string; author: { name: string } };
  pull_request?: { number: number; title: string; head: { sha: string } };
  [key: string]: unknown;
}

export interface TriggerContext {
  event: string;
  dagFile: string;
  payload: GitHubWebhookPayload;
  deliveryId: string;
}

export interface GitHubWebhookTriggerOptions {
  /** TCP port to listen on. Default: 9000 */
  port?: number;
  /** Host to bind to. Default: '0.0.0.0' */
  host?: string;
  /** Webhook secret used to verify X-Hub-Signature-256.
   *  Set to undefined to disable signature verification (insecure!). */
  secret?: string;
  /** Route table: maps GitHub events to DAG files */
  routes: WebhookRoute[];
  /** Project root used to resolve relative dagFile paths */
  projectRoot: string;
  /** Called when a route matches. Responsible for executing the DAG. */
  onTrigger: (ctx: TriggerContext) => Promise<void>;
  /** Called on errors (default: console.error) */
  onError?: (err: Error, ctx?: Partial<TriggerContext>) => void;
}

// ─── GitHubWebhookTrigger ─────────────────────────────────────────────────────

export class GitHubWebhookTrigger {
  private readonly options: Required<GitHubWebhookTriggerOptions>;
  private server: http.Server | null = null;

  constructor(options: GitHubWebhookTriggerOptions) {
    this.options = {
      port:       options.port       ?? 9000,
      host:       options.host       ?? '0.0.0.0',
      secret:     options.secret     ?? '',
      routes:     options.routes,
      projectRoot: options.projectRoot,
      onTrigger:  options.onTrigger,
      onError:    options.onError    ?? ((e) => console.error('[webhook]', e.message)),
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /** Start listening. Resolves once the server is bound. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.options.onError(err instanceof Error ? err : new Error(String(err)));
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Internal Server Error');
          }
        });
      });

      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        console.log(
          `[webhook] Listening on http://${this.options.host}:${this.options.port}/webhook`,
        );
        resolve();
      });
    });
  }

  /** Stop the server gracefully. */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  get isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  // ─── Request handling ───────────────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Only accept POST /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const body = await readBody(req);

    // Verify HMAC signature when secret is configured
    if (this.options.secret) {
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      if (!sig || !verifySignature(body, this.options.secret, sig)) {
        res.writeHead(401);
        res.end('Signature mismatch');
        return;
      }
    }

    const event      = (req.headers['x-github-event'] as string | undefined) ?? '';
    const deliveryId = (req.headers['x-github-delivery'] as string | undefined) ?? crypto.randomUUID();

    let payload: GitHubWebhookPayload;
    try {
      payload = JSON.parse(body.toString('utf-8')) as GitHubWebhookPayload;
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    // Find matching routes
    const matched = this.matchRoutes(event, payload);
    if (matched.length === 0) {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ignored', event }));
      return;
    }

    res.writeHead(202);
    res.end(JSON.stringify({ status: 'accepted', routes: matched.length, event, deliveryId }));

    // Execute matched DAGs asynchronously (non-blocking response)
    for (const route of matched) {
      const ctx: TriggerContext = { event, dagFile: route.dagFile, payload, deliveryId };
      this.options.onTrigger(ctx).catch((err) => {
        this.options.onError(err instanceof Error ? err : new Error(String(err)), ctx);
      });
    }
  }

  // ─── Route matching ─────────────────────────────────────────────────────

  private matchRoutes(event: string, payload: GitHubWebhookPayload): WebhookRoute[] {
    return this.options.routes.filter((route) => {
      // Event wildcard or exact match
      if (route.event !== '*' && route.event !== event) return false;
      // Ref filter (push events)
      if (route.ref && route.ref !== '*' && payload.ref !== route.ref) return false;
      // Action filter (PR events)
      if (route.action && route.action !== '*' && payload.action !== route.action) return false;
      return true;
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(body: Buffer, secret: string, signature: string): boolean {
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf-8'),
      Buffer.from(signature,  'utf-8'),
    );
  } catch {
    return false;
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

/**
 * Create and start a webhook trigger in one call.
 *
 * @example
 * const trigger = await startWebhookTrigger({
 *   secret: process.env.GITHUB_WEBHOOK_SECRET!,
 *   routes: [{ event: 'push', ref: 'refs/heads/main', dagFile: 'agents/dag.json' }],
 *   projectRoot: process.cwd(),
 *   onTrigger: async (ctx) => {
 *     const orch = new DagOrchestrator(ctx.payload.repository?.full_name ?? ctx.projectRoot, { verbose: true });
 *     await orch.run(ctx.dagFile);
 *   },
 * });
 */
export async function startWebhookTrigger(
  options: GitHubWebhookTriggerOptions,
): Promise<GitHubWebhookTrigger> {
  const trigger = new GitHubWebhookTrigger(options);
  await trigger.start();
  return trigger;
}
