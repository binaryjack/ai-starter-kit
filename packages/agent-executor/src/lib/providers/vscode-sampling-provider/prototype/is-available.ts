import type { IVSCodeSamplingProvider } from '../vscode-sampling-provider.types.js';

export async function isAvailable(this: IVSCodeSamplingProvider): Promise<boolean> {
  return true;
}
