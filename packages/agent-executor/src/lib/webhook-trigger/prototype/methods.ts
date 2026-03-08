import * as crypto from 'crypto';
import * as http from 'http';
import {
    GitHubWebhookPayload,
    IGitHubWebhookTrigger,
    TriggerContext,
    WebhookRoute,
    readBody,
    verifySignature,
} from '../webhook-trigger.js';

export function start(this: IGitHubWebhookTrigger): Promise<void> {
  return new Promise((resolve, reject) => {
    this._server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this._options.onError(err instanceof Error ? err : new Error(String(err)));
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
    });

    this._server.once('error', reject);
    this._server.listen(this._options.port, this._options.host, () => {
      console.log(`[webhook] Listening on http://${this._options.host}:${this._options.port}/webhook`);
      resolve();
    });
  });
}

export function stop(this: IGitHubWebhookTrigger): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!this._server) return resolve();
    this._server.close((err) => (err ? reject(err) : resolve()));
  });
}

export function isRunning(this: IGitHubWebhookTrigger): boolean {
  return this._server?.listening ?? false;
}

export async function handleRequest(
  this: IGitHubWebhookTrigger,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const body = await readBody(req);

  if (this._options.secret) {
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!sig || !verifySignature(body, this._options.secret, sig)) {
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

  const matched = this.matchRoutes(event, payload);
  if (matched.length === 0) {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ignored', event }));
    return;
  }

  res.writeHead(202);
  res.end(JSON.stringify({ status: 'accepted', routes: matched.length, event, deliveryId }));

  for (const route of matched) {
    const ctx: TriggerContext = { event, dagFile: route.dagFile, payload, deliveryId };
    this._options.onTrigger(ctx).catch((err) => {
      this._options.onError(err instanceof Error ? err : new Error(String(err)), ctx);
    });
  }
}

export function matchRoutes(
  this: IGitHubWebhookTrigger,
  event: string,
  payload: GitHubWebhookPayload,
): WebhookRoute[] {
  return this._options.routes.filter((route) => {
    if (route.event !== '*' && route.event !== event) return false;
    if (route.ref && route.ref !== '*' && payload.ref !== route.ref) return false;
    if (route.action && route.action !== '*' && payload.action !== route.action) return false;
    return true;
  });
}
