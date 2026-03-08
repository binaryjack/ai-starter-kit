import { LaneExecutor } from '../lane-executor.js';
import {
    buildRecord,
    driveLane,
    findHandoffLane,
    resolveHandoffTarget,
    runLane,
    saveCheckpoints,
} from './methods.js';

Object.assign(
  (LaneExecutor as unknown as { prototype: object }).prototype,
  {
    runLane,
    driveLane,
    resolveHandoffTarget,
    findHandoffLane,
    buildRecord,
    saveCheckpoints,
  },
);
