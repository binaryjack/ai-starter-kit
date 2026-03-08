import { complete, isAvailable, stream } from './prototype/index.js';
import type { IVSCodeSamplingProvider, SamplingCallback } from './vscode-sampling-provider.types.js';

export type { SamplingCallback };

export const VSCodeSamplingProvider = function(
  this: IVSCodeSamplingProvider,
  callback: SamplingCallback,
) {
  this._callback = callback;
} as unknown as IVSCodeSamplingProvider;

Object.assign(VSCodeSamplingProvider.prototype, {
  name: 'vscode' as const,
  isAvailable,
  complete,
  stream,
});
