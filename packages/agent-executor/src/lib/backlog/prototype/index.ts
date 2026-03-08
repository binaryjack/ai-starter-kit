import { BacklogBoard } from '../backlog.js';
import { add, resolve, skip } from './mutation.js';
import { getAll, getOpen, getBlocked, getByOwner, getByStory, isReadyToExecute, progress } from './query.js';
import { display, displayFiltered, seedStandardItems } from './display.js';
import { save, load } from './persist.js';
import { _require, _waitingTag } from './helpers.js';

Object.assign((BacklogBoard as unknown as { prototype: object }).prototype, {
  add,
  resolve,
  skip,
  getAll,
  getOpen,
  getBlocked,
  getByOwner,
  getByStory,
  isReadyToExecute,
  progress,
  display,
  displayFiltered,
  seedStandardItems,
  save,
  load,
  _require,
  _waitingTag,
});
