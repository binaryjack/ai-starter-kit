import * as fs from 'fs/promises';
import * as path from 'path';
import type { IAuditLog } from '../audit-log.js';
import type { AuditEntry, AuditEvent } from '../audit-log.types.js';
import { sha256, iso } from '../audit-log-helpers.js';

export async function open(this: IAuditLog): Promise<void> {
  await fs.mkdir(path.dirname(this._filePath), { recursive: true });
  this._fh = await fs.open(this._filePath, 'a');

  const existing = await fs.readFile(this._filePath, 'utf-8').catch(() => '');
  const lines    = existing.split('\n').filter(Boolean);
  if (lines.length > 0) {
    try {
      const last       = JSON.parse(lines[lines.length - 1]) as AuditEntry;
      this._lastHash   = last.hash;
      this._seq        = last.seq + 1;
    } catch {
      // malformed last line — start fresh chain from that point
    }
  }
}

export async function close(this: IAuditLog): Promise<void> {
  await this._fh?.close();
  this._fh = undefined;
}

export async function write(this: IAuditLog, event: AuditEvent): Promise<AuditEntry> {
  const entry: AuditEntry = {
    ...event,
    timestamp: event.timestamp || iso(),
    seq:       this._seq,
    prevHash:  this._lastHash,
    hash:      '',
  };

  const { hash: _, ...hashable } = entry;
  const canonical = JSON.stringify(hashable, Object.keys(hashable).sort());
  entry.hash = sha256(this._lastHash + canonical);

  this._lastHash = entry.hash;
  this._seq++;

  const line = JSON.stringify(entry) + '\n';
  if (this._fh) {
    await this._fh.write(line, undefined, 'utf-8');
  } else {
    await fs.mkdir(path.dirname(this._filePath), { recursive: true });
    await fs.appendFile(this._filePath, line, 'utf-8');
  }

  return entry;
}
