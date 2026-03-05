/**
 * E3 — Multi-Tenant Run Registry
 *
 * Extends the base RunRegistry concept with per-tenant path isolation so that
 * Agent runs from different tenants can never collide or access each other's data.
 *
 * Storage Layout
 * --------------
 *   .agents/
 *     tenants/
 *       <tenantId>/
 *         runs/
 *           <runId>/
 *             config.json
 *             events.ndjson
 *             result.json
 *
 * `tenantId` is derived from (in priority order):
 *   1. Explicit constructor argument
 *   2. `AIKIT_TENANT_ID` environment variable
 *   3. `"default"` (single-tenant / local-dev mode)
 *
 * GDPR / Data Portability
 * -----------------------
 *   • `exportTenant(tenantId, destDir)` — copies the entire tenant tree to destDir
 *   • `deleteTenant(tenantId)`           — purges the entire tenant tree (irreversible)
 *   • `listTenants()`                    — enumerates all known tenant IDs on disk
 *
 * Compliance Note:
 *   This module is the authoritative implementation for the "Right to Erasure"
 *   (GDPR Art. 17) and "Data Portability" (GDPR Art. 20) obligations in the
 *   ai-starter-kit.  All run data must be written through a TenantRunRegistry
 *   instance to ensure it is discoverable and erasable.
 */

import * as fs from 'fs/promises'
import * as path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunMeta {
  runId: string;
  tenantId: string;
  dagFile: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string; // ISO-8601
  completedAt?: string; // ISO-8601
}

export interface TenantExportSummary {
  tenantId: string;
  destDir: string;
  runCount: number;
  totalBytes: number;
  exportedAt: string; // ISO-8601
}

export interface TenantDeleteSummary {
  tenantId: string;
  runCount: number;
  totalBytesFreed: number;
  deletedAt: string; // ISO-8601
}

// ─── TenantRunRegistry ────────────────────────────────────────────────────────

export class TenantRunRegistry {
  public readonly tenantId: string;
  public readonly tenantsRoot: string;
  public readonly tenantRoot: string;
  public readonly runsRoot: string;

  constructor(projectRoot: string, tenantId?: string) {
    this.tenantId = tenantId ?? process.env['AIKIT_TENANT_ID'] ?? 'default';
    this.tenantsRoot = path.join(projectRoot, '.agents', 'tenants');
    this.tenantRoot = path.join(this.tenantsRoot, this.tenantId);
    this.runsRoot = path.join(this.tenantRoot, 'runs');
  }

  // ─── Run lifecycle ──────────────────────────────────────────────────────────

  /** Create a new run directory and write its initial config. */
  async create(runId: string, dagFile: string): Promise<RunMeta> {
    const runDir = this._runDir(runId);
    await fs.mkdir(runDir, { recursive: true });
    const meta: RunMeta = {
      runId,
      tenantId: this.tenantId,
      dagFile,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    await fs.writeFile(this._configPath(runId), JSON.stringify(meta, null, 2), 'utf-8');
    return meta;
  }

  /** Mark run as completed (or failed/cancelled) and record completion time. */
  async complete(
    runId: string,
    status: 'completed' | 'failed' | 'cancelled' = 'completed',
    result?: unknown,
  ): Promise<RunMeta> {
    const meta = await this.get(runId);
    meta.status = status;
    meta.completedAt = new Date().toISOString();
    await fs.writeFile(this._configPath(runId), JSON.stringify(meta, null, 2), 'utf-8');
    if (result !== undefined) {
      await fs.writeFile(
        path.join(this._runDir(runId), 'result.json'),
        JSON.stringify(result, null, 2),
        'utf-8',
      );
    }
    return meta;
  }

  /** Append a structured event line to the run's event log. */
  async appendEvent(runId: string, event: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ ...event, _ts: new Date().toISOString() }) + '\n';
    await fs.appendFile(path.join(this._runDir(runId), 'events.ndjson'), line, 'utf-8');
  }

  /** Get the metadata for a single run. */
  async get(runId: string): Promise<RunMeta> {
    const raw = await fs.readFile(this._configPath(runId), 'utf-8');
    return JSON.parse(raw) as RunMeta;
  }

  /** Delete a single run directory. */
  async delete(runId: string): Promise<void> {
    await fs.rm(this._runDir(runId), { recursive: true, force: true });
  }

  /** List all run IDs for this tenant. */
  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.runsRoot, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /** List only currently-running runs (status === 'running'). */
  async listActive(): Promise<RunMeta[]> {
    const ids = await this.list();
    const metas = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.get(id);
        } catch {
          return null;
        }
      }),
    );
    return metas.filter((m): m is RunMeta => m !== null && m.status === 'running');
  }

  /**
   * Remove completed/failed/cancelled runs older than `maxAgeDays` days.
   * Active runs are never touched.
   */
  async purgeOld(maxAgeDays: number): Promise<number> {
    const ids = await this.list();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1_000;
    let purged = 0;
    for (const id of ids) {
      try {
        const meta = await this.get(id);
        if (meta.status === 'running') continue;
        const finishedAt = meta.completedAt ? new Date(meta.completedAt).getTime() : 0;
        if (finishedAt < cutoff) {
          await this.delete(id);
          purged++;
        }
      } catch {
        // skip corrupt entries
      }
    }
    return purged;
  }

  // ─── Tenant management (admin / GDPR operations) ───────────────────────────

  /**
   * List all tenant IDs present on disk.
   * Scoped to the entire tenantsRoot, not just this tenant.
   */
  async listTenants(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.tenantsRoot, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Export all data for a tenant to a destination directory.
   * Creates destDir if it does not exist.
   * Returns a summary suitable for an audit receipt.
   *
   * GDPR Art. 20 — Right to Data Portability
   */
  async exportTenant(
    tenantId: string | undefined,
    destDir: string,
  ): Promise<TenantExportSummary> {
    const tid = tenantId ?? this.tenantId;
    const srcRoot = path.join(this.tenantsRoot, tid);
    await fs.mkdir(destDir, { recursive: true });

    let runCount = 0;
    let totalBytes = 0;

    const copyDir = async (src: string, dest: string): Promise<void> => {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyDir(srcPath, destPath);
        } else {
          const stat = await fs.stat(srcPath);
          totalBytes += stat.size;
          await fs.copyFile(srcPath, destPath);
        }
      }
    };

    try {
      await copyDir(srcRoot, destDir);
      const runIds = await fs.readdir(path.join(srcRoot, 'runs')).catch(() => []);
      runCount = runIds.length;
    } catch {
      // tenant has no data — that's fine
    }

    // Write a manifest
    const summary: TenantExportSummary = {
      tenantId: tid,
      destDir,
      runCount,
      totalBytes,
      exportedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(destDir, 'export-manifest.json'),
      JSON.stringify(summary, null, 2),
      'utf-8',
    );

    return summary;
  }

  /**
   * Permanently delete all data for a tenant.
   * Returns a summary suitable for a deletion receipt.
   *
   * GDPR Art. 17 — Right to Erasure
   */
  async deleteTenant(tenantId: string | undefined): Promise<TenantDeleteSummary> {
    const tid = tenantId ?? this.tenantId;
    const tenantRoot = path.join(this.tenantsRoot, tid);

    let runCount = 0;
    let totalBytesFreed = 0;

    // Measure before deleting
    const measure = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await measure(p);
          } else {
            const stat = await fs.stat(p);
            totalBytesFreed += stat.size;
          }
        }
      } catch {
        // ignore if already gone
      }
    };

    try {
      const runsDir = path.join(tenantRoot, 'runs');
      const runIds = await fs.readdir(runsDir).catch(() => [] as string[]);
      runCount = runIds.length;
      await measure(tenantRoot);
    } catch {
      // no data
    }

    await fs.rm(tenantRoot, { recursive: true, force: true });

    return {
      tenantId: tid,
      runCount,
      totalBytesFreed,
      deletedAt: new Date().toISOString(),
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _runDir(runId: string): string {
    return path.join(this.runsRoot, runId);
  }

  private _configPath(runId: string): string {
    return path.join(this._runDir(runId), 'config.json');
  }
}
