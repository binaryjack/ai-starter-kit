import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { IStateStore } from '../state-store.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AnyStore = IStateStore<unknown>;

export async function save(this: AnyStore, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(this._filePath), { recursive: true });
  await fsp.writeFile(this._filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function load(this: AnyStore): Promise<unknown | null> {
  try {
    const raw = await fsp.readFile(this._filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function exists(this: AnyStore): Promise<boolean> {
  try {
    await fsp.access(this._filePath);
    return true;
  } catch {
    return false;
  }
}

export async function clear(this: AnyStore): Promise<void> {
  try { await fsp.unlink(this._filePath); } catch { /* already gone */ }
}

export function saveSync(this: AnyStore, data: unknown): void {
  fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
  fs.writeFileSync(this._filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadSync(this: AnyStore): unknown | null {
  if (!fs.existsSync(this._filePath)) return null;
  return JSON.parse(fs.readFileSync(this._filePath, 'utf-8'));
}

export function existsSync(this: AnyStore): boolean {
  return fs.existsSync(this._filePath);
}

export function clearSync(this: AnyStore): void {
  if (this.existsSync()) fs.unlinkSync(this._filePath);
}
