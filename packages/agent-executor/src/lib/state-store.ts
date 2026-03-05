/**
 * StateStore<T> — Generic async file-backed state store.
 *
 * Replaces four duplicated _save()/_load() implementations across:
 *   - BacklogBoard       (backlog.json)
 *   - DiscoverySession   (discovery.json)
 *   - PlanSynthesizer    (plan.json)
 *   - Arbiter            (decisions.json)
 *
 * Uses async fs/promises methods so persistence never blocks the Node.js
 * event loop.  Sync variants (saveSync / loadSync) are provided only for
 * readline / event-handler contexts where await is unavailable.
 */

import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'

export class StateStore<T> {
  constructor(private readonly filePath: string) {}

  // ─── Async API (preferred) ────────────────────────────────────────────────

  /**
   * Persist `data` to disk asynchronously.
   * Creates parent directories if they don't exist.
   */
  async save(data: T): Promise<void> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await fsp.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load and parse the stored file asynchronously.
   * Returns `null` when the file does not exist.
   */
  async load(): Promise<T | null> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Returns `true` when the backing file exists (async).
   */
  async exists(): Promise<boolean> {
    try {
      await fsp.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove the backing file asynchronously.  No-op if it does not exist.
   */
  async clear(): Promise<void> {
    try { await fsp.unlink(this.filePath); } catch { /* already gone */ }
  }

  // ─── Sync API (compatibility shims) ──────────────────────────────────────
  //
  // Use ONLY from readline / EventEmitter handler contexts where async/await
  // is not available.  Prefer the async variants above everywhere else.

  saveSync(data: T): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  loadSync(): T | null {
    if (!fs.existsSync(this.filePath)) return null;
    return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as T;
  }

  existsSync(): boolean {
    return fs.existsSync(this.filePath);
  }

  clearSync(): void {
    if (this.existsSync()) fs.unlinkSync(this.filePath);
  }
}
