import type { SceneFeatureDeclaration } from "./scene-contract.js";

export interface WallStraightArgs extends Record<string, unknown> {
  id: string;
  length: number;
  height: number;
  thickness: number;
}

export interface RoofGableArgs extends Record<string, unknown> {
  id: string;
  hostId: string;
  width: number;
  depth: number;
  pitchDeg: number;
  overhang: number;
}

interface FeatureArgMap {
  "wall.straight": WallStraightArgs;
  "roof.gable": RoofGableArgs;
}

export function feature<K extends keyof FeatureArgMap>(
  kind: K,
  args: FeatureArgMap[K],
): SceneFeatureDeclaration {
  return {
    id: args.id,
    kind,
    args,
  };
}

export const wall = Object.freeze({
  straight(args: WallStraightArgs): SceneFeatureDeclaration {
    return feature("wall.straight", args);
  },
});

export const roof = Object.freeze({
  gable(args: RoofGableArgs): SceneFeatureDeclaration {
    return feature("roof.gable", args);
  },
});
