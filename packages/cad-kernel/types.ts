/** Core geometry types used throughout the engine. */

/** 3D vector / point */
export type Vec3 = [number, number, number];

/** 2D vector / point */
export type Vec2 = [number, number];

/** RGBA color as [r, g, b, a] with values 0–1 */
export type Color = [number, number, number, number];

/** Named parameter definition */
export interface ParamDef {
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Triangle mesh for rendering */
export interface TriMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** A solid body with optional color and name */
export interface Body {
  kind?: "solid" | "tool-body";
  name?: string;
  color?: Color;
  mesh: TriMesh;
}

/** An advisory hint from the hint engine */
export interface Hint {
  id: string;
  message: string;
  severity: "tip" | "warning";
}

export type ValidationStage =
  | "types/schema"
  | "semantic"
  | "geometry"
  | "stats/relations"
  | "render/snapshots/tests";

export interface ValidationDiagnostic {
  stage: ValidationStage;
  severity: "error" | "warning";
  message: string;
  featureId?: string;
}

export interface SceneValidationRuleResult {
  id: string;
  stage: "semantic" | "geometry" | "tests";
  status: "pass" | "fail";
  message?: string;
}

export interface SceneValidationDiagnostic {
  code: string;
  stage: "type-level" | "semantic" | "geometry" | "tests";
  severity: "error" | "warning";
  message: string;
  featureId?: string;
  validatorId?: string;
  testId?: string;
}

export interface SceneValidationSummary {
  errorCount: number;
  warningCount: number;
  validatorFailures: number;
  testFailures: number;
}

export interface SceneValidationReport {
  diagnostics: SceneValidationDiagnostic[];
  validators: SceneValidationRuleResult[];
  tests: SceneValidationRuleResult[];
  summary: SceneValidationSummary;
}

export interface GeometryBounds {
  min: Vec3;
  max: Vec3;
}

export interface GeometryPartStats {
  index: number;
  id: string;
  name: string;
  triangles: number;
  boundingBox: GeometryBounds;
  extents: { x: number; y: number; z: number };
  volume: number;
  surfaceArea: number;
}

export interface GeometryPairwisePartStats {
  partA: string;
  partAId: string;
  partB: string;
  partBId: string;
  intersects: boolean;
  minDistance: number;
}

export interface GeometryChecks {
  hasZeroVolume: boolean;
  hasDegenerateBoundingBox: boolean;
  hasDisconnectedComponents: boolean;
}

export interface GeometryStats {
  triangles: number;
  bodies: number;
  componentCount: number;
  boundingBox: GeometryBounds;
  volume: number;
  surfaceArea: number;
  parts: GeometryPartStats[];
  pairwise: GeometryPairwisePartStats[];
  checks: GeometryChecks;
}

export interface NumericRangeExpectation {
  min?: number;
  max?: number;
}

export interface BoundingBoxExpectation {
  min?: Partial<Record<"x" | "y" | "z", number>>;
  max?: Partial<Record<"x" | "y" | "z", number>>;
}

export interface GeometryValidationConfig {
  epsilon?: number;
  allowDisconnectedComponents?: boolean;
  expectedVolume?: NumericRangeExpectation;
  expectedBoundingBox?: BoundingBoxExpectation;
}

export interface EvaluationStageSummary {
  status: "pass" | "fail" | "skipped";
  errorCount: number;
  warningCount: number;
  diagnostics: ValidationDiagnostic[];
}

export interface EvaluationTestsSummary {
  status: "pass" | "fail" | "skipped";
  total: number;
  failures: number;
  results: SceneValidationRuleResult[];
}

export interface EvaluationBundle {
  haltedAt?: ValidationStage;
  summary: {
    errorCount: number;
    warningCount: number;
  };
  typecheck: EvaluationStageSummary;
  semanticValidation: EvaluationStageSummary;
  geometryValidation: EvaluationStageSummary;
  relationValidation: EvaluationStageSummary;
  stats: {
    available: boolean;
    data?: GeometryStats;
  };
  tests: EvaluationTestsSummary;
  render: {
    requested: boolean;
  };
}

/** Result of evaluating a model script */
export interface ModelResult {
  bodies: Body[];
  toolBodies?: Body[];
  params: ParamDef[];
  errors: string[];
  geometryStats?: GeometryStats;
  diagnostics?: ValidationDiagnostic[];
  evaluation: EvaluationBundle;
  sceneValidation?: SceneValidationReport;
  hints: Hint[];
  /** Optional camera position hint from the model [x, y, z] */
  camera?: Vec3;
}

/** Bounding box */
export interface BBox {
  min: Vec3;
  max: Vec3;
}
