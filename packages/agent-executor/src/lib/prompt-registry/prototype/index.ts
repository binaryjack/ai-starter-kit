import { PromptRegistry } from '../prompt-registry.js';
import { loadAll, loadFile } from './load.js';
import { _makeKey, _parseFrontmatter } from './parse.js';
import { has, list, resolve, size } from './resolve.js';

Object.assign(PromptRegistry.prototype, {
  loadAll,
  loadFile,
  resolve,
  has,
  list,
  size,
  _makeKey,
  _parseFrontmatter,
});
