/**
 * run-registry.ts — Per-run directory isolation for concurrent DAG executions.
 *
 * ## Problem
 * Without isolation, concurrent DAG runs targeting the same project root write
 * to shared directories (`agents/audit/`, `agents/checkpoints/`, etc.), causing
 * non-deterministic file collisions and making forensic audit analysis ambiguous.
 *
 * ## Solution
 * `RunRegistry` provisions a dedicated subdirectory tree for each run:
 *
 *   .agents/
 *     runs/
 *       <runId>/
 *         audit/         ← NDJSON audit logs (AuditLog)
 *         checkpoints/   ← per-lane checkpoint JSON  (LaneExecutor)
 *         results/       ← DAG result JSON            (DagResultBuilder)
 *         plan-state/    ← plan.json + discovery.json (PlanSynthesizer)
 *         secrets.lock   ← secrets resolution record  (not written yet)
 *     manifest.json      ← live index of active + completed runs
 *
 * ## Backward compatibility
 * The legacy flat layout (directly in `.agents/`) remains supported —
 * callers that do NOT use `RunRegistry` are unaffected.
 *
 * ## Usage
 * ```typescript
 * const registry = new RunRegistry(projectRoot);
 * const run      = await registry.create(runId, dagName);
 *
 * // Pass the isolated paths into collaborators
 * const auditLog = new AuditLog(run.runRoot, runId);
 * const laneExec = new LaneExecutor({ checkpointBaseDir: run.checkpointsDir });
 *
 * // Mark complete when done
 * await registry.complete(runId, 'success');
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunStatus = 'running' | 'success' | 'partial' | 'failed' | 'escalated';

export interface RunEntry {
  runId:      string;
  dagName:    string;
  status:     RunStatus;
  startedAt:  string;
  completedAt?: string;
  durationMs?: number;
}

export interface RunPaths {
  /** Root directory for this run: `.agents/runs/<runId>/` */
  runRoot:         string;
  /** NDJSON audit log directory. */
  auditDir:        string;
  /** Per-lane checkpoint JSON directory. */
  checkpointsDir:  string;
  /** DAG result JSON directory. */
  resultsDir:      string;
  /** Plan state directory. */
  planStateDir:    string;
}

// ─── RunRegistry ─────────────────────────────────────────────────────────────

/**
 * Manages isolated per-run directories and a lightweight run manifest.
 *
 * Thread-safety note: multiple Node.js processes writing the same manifest
 * concurrently may race.  For CI environments with many parallel jobs, consider
 * using a separate project root per job.
 */
export class RunRegistry {
  private readonly runsDir: string;
  private readonly manifestPath: string;

  constructor(private readonly projectRoot: string) {
    this.runsDir      = path.join(projectRoot, '.agents', 'runs');
    this.manifestPath = path.join(projectRoot, '.agents', 'runs', 'manifest.json');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Initialise the directory tree for a new run and record it in the manifest.
   * Returns the full set of isolated paths to pass into collaborating classes.
   *
   * @param runId    UUID for this run (from `randomUUID()`).
   * @param dagName  Human-readable DAG name (for manifest display).
   */
  async create(runId: string, dagName: string): Promise<RunPaths> {
    const paths = this._paths(runId);

    // Provision all subdirectories in parallel
    await Promise.all([
      fs.mkdir(paths.auditDir,       { recursive: true }),
      fs.mkdir(paths.checkpointsDir, { recursive: true }),
      fs.mkdir(paths.resultsDir,     { recursive: true }),
      fs.mkdir(paths.planStateDir,   { recursive: true }),
    ]);

    const entry: RunEntry = {
      runId,
      dagName,
      status:    'running',
      startedAt: new Date().toISOString(),
    };

    await this._upsert(entry);
    return paths;
  }

  /**
   * Mark a run as complete in the manifest.
   *
   * @param runId      UUID of the run to update.
   * @param status     Final status.
   * @param durationMs Total elapsed milliseconds.
   */
  async complete(runId: string, status: RunStatus, durationMs?: number): Promise<void> {
    const manifest = await this._read();
    const idx = manifest.findIndex((e) => e.runId === runId);
    if (idx < 0) return;  // run not found — no-op

    manifest[idx] = {
      ...manifest[idx]!,
      status,
      completedAt: new Date().toISOString(),
      durationMs,
    };
    await this._write(manifest);
  }

  /**
   * Delete all files for a specific run (audit, checkpoints, results, plan-state).
   * Removes the entry from the manifest.
   */
  async delete(runId: string): Promise<void> {
    const runRoot = this._paths(runId).runRoot;
    await fs.rm(runRoot, { recursive: true, force: true });
    const manifest = await this._read();
    await this._write(manifest.filter((e) => e.runId !== runId));
  }

  /**
   * Delete run directories for all runs older than `olderThanMs` milliseconds.
   * Runs currently in `running` status are never deleted.
   *
   * @param olderThanMs  Age threshold in ms (default 7 days).
   */
  async purgeOld(olderThanMs: number = 7 * 24 * 60 * 60 * 1_000): Promise<string[]> {
    const cutoff   = Date.now() - olderThanMs;
    const manifest = await this._read();
    const toDelete = manifest.filter((e) => {
      if (e.status === 'running') return false;
      const ts = new Date(e.completedAt ?? e.startedAt).getTime();
      return ts < cutoff;
    });

    for (const entry of toDelete) {
      await this.delete(entry.runId);
    }

    return toDelete.map((e) => e.runId);
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /** Return the isolated paths for a given runId (without creating directories). */
  paths(runId: string): RunPaths {
    return this._paths(runId);
  }

  /** Return the manifest entry for a specific runId, or `undefined` if unknown. */
  async get(runId: string): Promise<RunEntry | undefined> {
    return (await this._read()).find((e) => e.runId === runId);
  }

  /** Return all manifest entries, newest first. */
  async list(): Promise<RunEntry[]> {
    const entries = await this._read();
    return [...entries].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  /** Return currently active (running) entries. */
  async listActive(): Promise<RunEntry[]> {
    return (await this.list()).filter((e) => e.status === 'running');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _paths(runId: string): RunPaths {
    const runRoot = path.join(this.runsDir, runId);
    return {
      runRoot,
      auditDir:       path.join(runRoot, 'audit'),
      checkpointsDir: path.join(runRoot, 'checkpoints'),
      resultsDir:     path.join(runRoot, 'results'),
      planStateDir:   path.join(runRoot, 'plan-state'),
    };
  }

  private async _read(): Promise<RunEntry[]> {
    const raw = await fs.readFile(this.manifestPath, 'utf-8').catch(() => '[]');
    try {
      return JSON.parse(raw) as RunEntry[];
    } catch {
      return [];
    }
  }

  private async _write(entries: RunEntry[]): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  private async _upsert(entry: RunEntry): Promise<void> {
    const manifest = await this._read();
    const idx = manifest.findIndex((e) => e.runId === entry.runId);
    if (idx >= 0) {
      manifest[idx] = entry;
    } else {
      manifest.push(entry);
    }
    await this._write(manifest);
  }
}
