import { createHash, createHmac } from 'crypto';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function deriveSigV4Key(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate    = hmacSha256(`AWS4${secretKey}`, date);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

export interface SigV4Headers {
  Authorization: string;
  'x-amz-date': string;
  'x-amz-security-token'?: string;
  host: string;
}

export function signRequest(params: {
  method:        string;
  host:          string;
  path:          string;
  body:          string;
  accessKeyId:   string;
  secretKey:     string;
  sessionToken?: string;
  region:        string;
  service:       string;
}): SigV4Headers {
  const now      = new Date();
  const amzDate  = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateOnly = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(params.body);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'host':         params.host,
    'x-amz-date':   amzDate,
  };
  if (params.sessionToken) {
    headers['x-amz-security-token'] = params.sessionToken;
  }

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.trim()}\n`)
    .join('');

  const signedHeaders = Object.keys(headers).sort().join(';');

  const canonicalRequest = [
    params.method,
    params.path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateOnly}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = deriveSigV4Key(params.secretKey, dateOnly, params.region, params.service);
  const signature  = hmacSha256(signingKey, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const result: SigV4Headers = {
    Authorization: authorization,
    'x-amz-date':  amzDate,
    host:          params.host,
  };
  if (params.sessionToken) {
    result['x-amz-security-token'] = params.sessionToken;
  }
  return result;
}
