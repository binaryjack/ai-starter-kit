import * as crypto from 'crypto';
import * as http from 'http';

export interface WebhookRoute {
  event:   string;
  ref?:    string;
  action?: string;
  dagFile: string;
}

export interface GitHubWebhookPayload {
  ref?:        string;
  action?:     string;
  repository?: { full_name: string; clone_url: string };
  sender?:     { login: string };
  head_commit?: { id: string; message: string; author: { name: string } };
  pull_request?: { number: number; title: string; head: { sha: string } };
  [key: string]: unknown;
}

export interface TriggerContext {
  event:      string;
  dagFile:    string;
  payload:    GitHubWebhookPayload;
  deliveryId: string;
}

export interface GitHubWebhookTriggerOptions {
  port?:       number;
  host?:       string;
  secret?:     string;
  routes:      WebhookRoute[];
  projectRoot: string;
  onTrigger:   (ctx: TriggerContext) => Promise<void>;
  onError?:    (err: Error, ctx?: Partial<TriggerContext>) => void;
}

export interface IGitHubWebhookTrigger {
  _options: Required<GitHubWebhookTriggerOptions>;
  _server:  http.Server | null;
  start():  Promise<void>;
  stop():   Promise<void>;
  isRunning(): boolean;
  handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
  matchRoutes(event: string, payload: GitHubWebhookPayload): WebhookRoute[];
}

// Module-level helpers used by methods
export function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function verifySignature(body: Buffer, secret: string, signature: string): boolean {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected,   'utf-8'),
      Buffer.from(signature,  'utf-8'),
    );
  } catch {
    return false;
  }
}

export const GitHubWebhookTrigger = function (
  this: IGitHubWebhookTrigger,
  options: GitHubWebhookTriggerOptions,
) {
  this._options = {
    port:        options.port        ?? 9000,
    host:        options.host        ?? '0.0.0.0',
    secret:      options.secret      ?? '',
    routes:      options.routes,
    projectRoot: options.projectRoot,
    onTrigger:   options.onTrigger,
    onError:     options.onError     ?? ((e: Error) => console.error('[webhook]', e.message)),
  };
  this._server = null;
} as unknown as new (options: GitHubWebhookTriggerOptions) => IGitHubWebhookTrigger;
