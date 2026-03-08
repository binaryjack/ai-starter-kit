import { BacklogBoard } from '../backlog.js'
import { display, displayFiltered, seedStandardItems } from './display.js'
import { _require, _waitingTag } from './helpers.js'
import { add, resolve, skip } from './mutation.js'
import { load, save } from './persist.js'
import { getAll, getBlocked, getByOwner, getByStory, getOpen, isReadyToExecute, progress } from './query.js'

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
