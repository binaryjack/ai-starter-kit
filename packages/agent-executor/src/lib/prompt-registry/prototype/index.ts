import { PromptRegistry }                  from '../prompt-registry.js';
import { loadAll, loadFile }               from './load.js';
import { resolve, has, list, size }        from './resolve.js';
import { _makeKey, _parseFrontmatter }     from './parse.js';

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
