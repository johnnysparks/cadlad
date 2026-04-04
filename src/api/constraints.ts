export type ConstraintSeverity = "error" | "warning";

export type WallThicknessConstraint = {
  kind: "wall_thickness";
  min: number;
  severity?: ConstraintSeverity;
};

export type SymmetryConstraint = {
  kind: "symmetry";
  axis: "X" | "Y" | "Z";
  tolerance?: number;
  severity?: ConstraintSeverity;
};

export type ClearanceConstraint = {
  kind: "clearance";
  between: readonly [string, string];
  min: number;
  severity?: ConstraintSeverity;
};

export type MaxOverhangConstraint = {
  kind: "max_overhang";
  angle: number;
  severity?: ConstraintSeverity;
};

export type SceneConstraint =
  | WallThicknessConstraint
  | SymmetryConstraint
  | ClearanceConstraint
  | MaxOverhangConstraint;

export function constraint(kind: "wall_thickness", config: Omit<WallThicknessConstraint, "kind">): WallThicknessConstraint;
export function constraint(kind: "symmetry", config: Omit<SymmetryConstraint, "kind">): SymmetryConstraint;
export function constraint(kind: "clearance", config: Omit<ClearanceConstraint, "kind">): ClearanceConstraint;
export function constraint(kind: "max_overhang", config: Omit<MaxOverhangConstraint, "kind">): MaxOverhangConstraint;
export function constraint(kind: SceneConstraint["kind"], config: Record<string, unknown>): SceneConstraint {
  return { kind, ...(config as object) } as SceneConstraint;
}
