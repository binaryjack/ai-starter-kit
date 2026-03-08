import type { IMockProvider } from '../mock-provider.types.js'

export async function isAvailable(this: IMockProvider): Promise<boolean> {
  return true;
}
