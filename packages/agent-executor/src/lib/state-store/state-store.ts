import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import './prototype/index.js';

export { fs, fsp, path };

export interface IStateStore<T> {
  _filePath: string;
  save(data: T): Promise<void>;
  load(): Promise<T | null>;
  exists(): Promise<boolean>;
  clear(): Promise<void>;
  saveSync(data: T): void;
  loadSync(): T | null;
  existsSync(): boolean;
  clearSync(): void;
}

export const StateStore = function(
  this: IStateStore<unknown>,
  filePath: string,
) {
  this._filePath = filePath;
} as unknown as new <T>(filePath: string) => IStateStore<T>;
