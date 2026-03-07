/**
 * E5 — OIDC / JWT Authentication Middleware
 *
 * Zero-dependency OIDC bearer-token verification for the MCP HTTP transport.
 * Uses only Node 20's built-in Web Crypto API (`crypto.subtle`) and native `fetch`
 * — no `jose`, `jsonwebtoken`, or any new npm dependency.
 *
 * Configuration (environment variables):
 *   AIKIT_OIDC_ISSUER    — full OIDC issuer URL, e.g. "https://accounts.google.com"
 *                          If unset, the middleware is a no-op (permissive).
 *   AIKIT_OIDC_AUDIENCE  — expected `aud` claim in the JWT.
 *                          If unset, `aud` is not validated (acceptable for M2M tokens
 *                          where audience is implicit).
 *
 * Flow:
 *   1. Extract `Authorization: Bearer <token>` from the request
 *   2. Base64url-decode header to find `kid` and `alg` (RS256 / ES256 supported)
 *   3. Fetch JWKS from `<issuer>/.well-known/openid-configuration` → `jwks_uri`
 *   4. Find the matching JWK by `kid` and convert it to a CryptoKey
 *   5. Verify signature with `crypto.subtle.verify`
 *   6. Validate `exp`, `iss`, `aud` claims
 *   7. Attach `{ sub, email?, groups?, roles? }` to `req.oidcPrincipal`
 *
 * JWKS is cached in a module-level Map keyed by issuer URL and refreshed every
 * 15 minutes (configurable) or on a 404  `kid` miss.
 *
 * Usage:
 *   import { createOidcMiddleware } from './oidc-auth.js'
 *   const middleware = createOidcMiddleware()     // reads env vars
 *   app.use(middleware)
 *
 *   // or with explicit options:
 *   const middleware = createOidcMiddleware({
 *     issuer: 'https://accounts.google.com',
 *     audience: 'my-client-id',
 *     jwksCacheTtlMs: 10 * 60 * 1_000,
 *   })
 */

import * as crypto from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OidcOptions {
  /** OIDC issuer base URL (default: `AIKIT_OIDC_ISSUER`) */
  issuer?: string;
  /** Expected `aud` claim (default: `AIKIT_OIDC_AUDIENCE` or undefined) */
  audience?: string;
  /** JWKS cache TTL in ms (default: 15 min) */
  jwksCacheTtlMs?: number;
}

export interface OidcPrincipal {
  sub: string;
  email?: string;
  /** Azure AD / Okta groups claim */
  groups?: string[];
  /** Azure AD / Okta roles claim */
  roles?: string[];
  /** Raw decoded payload for custom claim extraction */
  payload: JwtPayload;
}

// Minimal HTTP interface compatible with Node http.IncomingMessage and express.Request
export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

type NextFn = (err?: unknown) => void;
export type OidcMiddleware = (req: MinimalRequest, res: MinimalResponse, next: NextFn) => Promise<void>;

// ─── Internal types ───────────────────────────────────────────────────────────

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  groups?: string[];
  roles?: string[];
}

interface Jwk {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string; // RSA modulus
  e?: string; // RSA exponent
  x?: string; // EC x
  y?: string; // EC y
  crv?: string; // EC curve
}

interface JwksDocument {
  keys: Jwk[];
}

// ─── JWKS Cache ───────────────────────────────────────────────────────────────

interface CachedJwks {
  keys: Jwk[];
  fetchedAt: number;
}

const jwksCache = new Map<string, CachedJwks>();
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000; // 15 minutes

async function fetchJwks(issuer: string, ttlMs: number): Promise<Jwk[]> {
  const cached = jwksCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.keys;
  }

  // Discover JWKS URI from OIDC well-known endpoint
  let jwksUri: string;
  try {
    const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);
    if (!discoveryRes.ok) {
      throw new Error(`OIDC discovery failed: ${discoveryRes.status} ${discoveryUrl}`);
    }
    const discovery = (await discoveryRes.json()) as { jwks_uri?: string };
    if (!discovery.jwks_uri) {
      throw new Error(`No jwks_uri in OIDC discovery document for issuer: ${issuer}`);
    }
    jwksUri = discovery.jwks_uri;
  } catch (err) {
    throw new OidcError(`Failed to discover JWKS for issuer "${issuer}": ${String(err)}`);
  }

  // Fetch JWKS
  const jwksRes = await fetch(jwksUri);
  if (!jwksRes.ok) {
    throw new OidcError(`JWKS fetch failed: ${jwksRes.status} ${jwksUri}`);
  }
  const jwksDoc = (await jwksRes.json()) as JwksDocument;
  const keys = jwksDoc.keys ?? [];

  jwksCache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class OidcError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'OidcError';
  }
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  // Convert base64url to base64
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  // new Uint8Array(TypedArray) creates a copy backed by a fresh ArrayBuffer
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function decodeJsonPart<T>(part: string): T {
  const bytes = base64urlDecode(part);
  return JSON.parse(Buffer.from(bytes).toString('utf-8')) as T;
}

async function importRsaKey(jwk: Jwk): Promise<crypto.webcrypto.CryptoKey> {
  const keyData = {
    kty: 'RSA',
    n: jwk.n!,
    e: jwk.e!,
    alg: jwk.alg ?? 'RS256',
    use: 'sig',
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function importEcKey(jwk: Jwk): Promise<crypto.webcrypto.CryptoKey> {
  const keyData = {
    kty: 'EC',
    crv: jwk.crv ?? 'P-256',
    x: jwk.x!,
    y: jwk.y!,
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    keyData,
    { name: 'ECDSA', namedCurve: jwk.crv ?? 'P-256' },
    false,
    ['verify'],
  );
}

async function verifyJwt(token: string, issuer: string, audience: string | undefined, ttlMs: number): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new OidcError('Malformed JWT: expected 3 parts');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeJsonPart<JwtHeader>(headerB64);
  const payload = decodeJsonPart<JwtPayload>(payloadB64);

  // Claim validation
  const now = Math.floor(Date.now() / 1_000);
  if (payload.exp !== undefined && payload.exp < now) {
    throw new OidcError('JWT has expired');
  }
  if (payload.iss && payload.iss !== issuer) {
    throw new OidcError(`JWT issuer mismatch: got "${payload.iss}", expected "${issuer}"`);
  }
  if (audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(audience)) {
      throw new OidcError(`JWT audience mismatch: "${audience}" not in [${aud.join(', ')}]`);
    }
  }

  // Signature verification
  let jwks = await fetchJwks(issuer, ttlMs);

  let jwk = header.kid ? jwks.find((k) => k.kid === header.kid) : jwks[0];

  if (!jwk) {
    // kid miss — bust cache and retry once
    jwksCache.delete(issuer);
    jwks = await fetchJwks(issuer, ttlMs);
    jwk = header.kid ? jwks.find((k) => k.kid === header.kid) : jwks[0];
  }
  if (!jwk) {
    throw new OidcError(`No JWK found for kid "${header.kid}"`);
  }

  let cryptoKey: crypto.webcrypto.CryptoKey;
  let algorithm: AlgorithmIdentifier | EcdsaParams;

  if (header.alg === 'RS256' || (!header.alg && jwk.kty === 'RSA')) {
    cryptoKey = await importRsaKey(jwk);
    algorithm = { name: 'RSASSA-PKCS1-v1_5' };
  } else if (header.alg === 'ES256' || (!header.alg && jwk.kty === 'EC')) {
    cryptoKey = await importEcKey(jwk);
    algorithm = { name: 'ECDSA', hash: 'SHA-256' };
  } else {
    throw new OidcError(`Unsupported JWT algorithm: ${header.alg}`);
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  const valid = await crypto.subtle.verify(algorithm, cryptoKey, signature, signingInput);
  if (!valid) {
    throw new OidcError('JWT signature verification failed');
  }

  return payload;
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Create an OIDC bearer-token verification middleware.
 *
 * If `issuer` is not configured (env or options), returns a no-op middleware
 * that logs a warning on first use — suitable for local development.
 */
export function createOidcMiddleware(opts: OidcOptions = {}): OidcMiddleware {
  const issuer = opts.issuer ?? process.env['AIKIT_OIDC_ISSUER'];
  const audience = opts.audience ?? process.env['AIKIT_OIDC_AUDIENCE'];
  const ttlMs = opts.jwksCacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  if (!issuer) {
    let warned = false;
    return async (_req, _res, next) => {
      if (!warned) {
        console.warn(
          '[oidc-auth] AIKIT_OIDC_ISSUER is not set — authentication is disabled. '
          + 'Set AIKIT_OIDC_ISSUER to enable OIDC verification.',
        );
        warned = true;
      }
      next();
    };
  }

  return async (req: MinimalRequest, res: MinimalResponse, next: NextFn) => {
    const authHeader = req.headers['authorization'];
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!headerValue || !headerValue.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }

    const token = headerValue.slice(7).trim();
    try {
      const payload = await verifyJwt(token, issuer, audience, ttlMs);

      if (!payload.sub) {
        res.status(401).json({ error: 'JWT missing "sub" claim' });
        return;
      }

      const principal: OidcPrincipal = {
        sub: payload.sub,
        email: payload.email,
        groups: payload.groups,
        roles: payload.roles,
        payload,
      };

      // Attach to request for downstream handlers
      (req as Record<string, unknown>)['oidcPrincipal'] = principal;
      next();
    } catch (err) {
      if (err instanceof OidcError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Authentication error' });
        console.error('[oidc-auth] Unexpected error:', err);
      }
    }
  };
}

/**
 * Extract the OIDC principal that was attached by the middleware.
 * Throws if the middleware was not used or authentication failed.
 */
export function getOidcPrincipal(req: MinimalRequest): OidcPrincipal {
  const principal = (req as Record<string, unknown>)['oidcPrincipal'] as OidcPrincipal | undefined;
  if (!principal) {
    throw new OidcError('Request has no oidcPrincipal — did you use createOidcMiddleware?', 500);
  }
  return principal;
}
