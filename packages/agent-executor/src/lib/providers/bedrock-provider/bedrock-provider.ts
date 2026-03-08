import { isAvailable, complete, stream, _endpoint, _buildConverseBody } from './prototype/index.js';
import type { IBedrockProvider } from './bedrock-provider.types.js';

export const BedrockProvider = function(
  this: IBedrockProvider,
  options: {
    accessKeyId?:  string;
    secretKey?:    string;
    sessionToken?: string;
    region?:       string;
  } = {},
) {
  this._accessKeyId  = options.accessKeyId  ?? process.env['AWS_ACCESS_KEY_ID']     ?? '';
  this._secretKey    = options.secretKey    ?? process.env['AWS_SECRET_ACCESS_KEY']  ?? '';
  this._sessionToken = options.sessionToken ?? process.env['AWS_SESSION_TOKEN'];
  this._region       = options.region       ?? process.env['AWS_REGION']             ??
                                               process.env['AWS_DEFAULT_REGION']     ?? 'us-east-1';
} as unknown as IBedrockProvider;

Object.assign(BedrockProvider.prototype, {
  name: 'bedrock' as const,
  isAvailable,
  complete,
  stream,
  _endpoint,
  _buildConverseBody,
});
