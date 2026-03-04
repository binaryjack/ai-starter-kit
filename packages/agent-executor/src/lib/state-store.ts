/**
 * StateStore<T> — Generic synchronous file-backed state store.
 *
 * Replaces four duplicated _save()/_load() implementations across:
 *   - BacklogBoard       (backlog.json)
 *   - DiscoverySession   (discovery.json)
 *   - PlanSynthesizer    (plan.json)
 *   - Arbiter            (decisions.json)
 *
 * Uses synchronous fs methods to match the original implementations
 * (these classes run on a background thread during CLI execution;
 * async persistence is unnecessary and would complicate error handling).
 */

import * as fs from 'fs';
import * as path from 'path';

export class StateStore<T> {
  constructor(private readonly filePath: string) {}

  /**
   * Persist `data` to disk.  Creates parent directories if they don't exist.
   */
  save(data: T): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load and parse the stored file.
   * Returns `null` when the file does not exist.
   */
  load(): T | null {
    if (!fs.existsSync(this.filePath)) return null;
    return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as T;
  }

  /**
   * Returns `true` when the backing file already exists on disk.
   */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /**
   * Remove the backing file.  No-op if it does not exist.
   */
  clear(): void {
    if (this.exists()) fs.unlinkSync(this.filePath);
  }
}
