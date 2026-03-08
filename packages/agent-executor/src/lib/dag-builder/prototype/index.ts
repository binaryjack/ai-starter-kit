import { DagBuilder, LaneBuilder } from '../dag-builder.js';
import {
    dagBarrier,
    dagBudget,
    dagBuild,
    dagDescription,
    dagLane,
    dagModelRouter,
    dagToJSON,
    laneAgentFile,
    laneBarrier,
    laneBuild,
    laneBuildDag,
    laneCapability,
    laneCheck,
    laneDependsOn,
    laneLane,
    laneProvider,
    laneSupervisorFile,
} from './methods.js';

Object.assign((LaneBuilder as unknown as { prototype: object }).prototype, {
  check:          laneCheck,
  capability:     laneCapability,
  agentFile:      laneAgentFile,
  supervisorFile: laneSupervisorFile,
  provider:       laneProvider,
  dependsOn:      laneDependsOn,
  _build:         laneBuild,
  lane:           laneLane,
  barrier:        laneBarrier,
  build:          laneBuildDag,
});

Object.assign((DagBuilder as unknown as { prototype: object }).prototype, {
  description:  dagDescription,
  budget:       dagBudget,
  modelRouter:  dagModelRouter,
  lane:         dagLane,
  barrier:      dagBarrier,
  build:        dagBuild,
  toJSON:       dagToJSON,
});
