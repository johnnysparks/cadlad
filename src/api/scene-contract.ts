import type { Body } from "../engine/types.js";

export type SceneSourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SceneValidationStage = "type-level" | "semantic" | "geometry" | "tests";
export type SceneValidationSeverity = "error" | "warning";

export type SceneDiagnostic = {
  code:
    | "scene.invalid-envelope"
    | "scene.feature-id.missing"
    | "scene.feature-id.duplicate"
    | "scene.feature-ref.invalid"
    | "scene.geometry.empty"
    | "scene.geometry.disconnected-parts"
    | "scene.validator.failed"
    | "scene.test.failed";
  stage: SceneValidationStage;
  severity: SceneValidationSeverity;
  message: string;
  featureId?: string;
  validatorId?: string;
  testId?: string;
  range?: SceneSourceRange;
};

export type SceneFeatureDeclaration = {
  id?: string;
  kind: string;
  label?: string;
  refs?: readonly string[];
};

export type UnitBrand<TUnit extends string> = number & { readonly __unit: TUnit };
export type Millimeters = UnitBrand<"mm">;

export function mm(value: number): Millimeters {
  return value as Millimeters;
}

export type SceneParamDefinition<TValue extends number | string | boolean = number | string | boolean> = {
  value: TValue;
  label?: string;
  description?: string;
  min?: TValue extends number ? number : never;
  max?: TValue extends number ? number : never;
  step?: TValue extends number ? number : never;
  unit?: string;
};

export type SceneParamsShape = Record<string, SceneParamDefinition>;

export type InferSceneParams<TParams extends SceneParamsShape | undefined> =
  TParams extends SceneParamsShape
    ? { [K in keyof TParams]: TParams[K]["value"] }
    : Record<string, never>;

export type SceneMeta = {
  id?: string;
  name: string;
  version?: string;
  description?: string;
  tags?: readonly string[];
};

export type SceneValidatorContext<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  params: InferSceneParams<TParams>;
  features: readonly NormalizedSceneFeature[];
  bodies: readonly Body[];
};

export type SceneValidatorRun<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = (
  context: SceneValidatorContext<TParams>,
) => string | void;

export type SceneValidatorSpec<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  id: string;
  stage?: "semantic" | "geometry";
  run: SceneValidatorRun<TParams>;
};

export type SceneValidator<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> =
  SceneValidatorRun<TParams>
  | SceneValidatorSpec<TParams>;

export type SceneTest<TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  id: string;
  description?: string;
  run: SceneValidatorRun<TParams>;
};

export type SceneEnvelope<TModel = unknown, TParams extends SceneParamsShape | undefined = SceneParamsShape | undefined> = {
  meta?: SceneMeta;
  model: TModel | ((context: Pick<SceneValidatorContext<TParams>, "params">) => TModel);
  params?: TParams;
  features: readonly SceneFeatureDeclaration[];
  validators?: readonly SceneValidator<TParams>[];
  tests?: readonly SceneTest<TParams>[];
};

export type NormalizedSceneFeature = {
  id: string;
  kind: string;
  label?: string;
  refs?: readonly string[];
  range?: SceneSourceRange;
};

export type SceneRuleResult = {
  id: string;
  stage: "semantic" | "geometry" | "tests";
  status: "pass" | "fail";
  message?: string;
};

export type SceneValidationReport = {
  diagnostics: SceneDiagnostic[];
  validators: SceneRuleResult[];
  tests: SceneRuleResult[];
  summary: {
    errorCount: number;
    warningCount: number;
    validatorFailures: number;
    testFailures: number;
  };
};

export type NormalizedScene<TModel = unknown> = {
  meta?: SceneMeta;
  model: TModel;
  params: Record<string, number | string | boolean>;
  features: NormalizedSceneFeature[];
  validation: SceneValidationReport;
};

const SCENE_MARKER = Symbol.for("cadlad.scene-envelope");

type SceneEnvelopeInternal<TModel = unknown> = SceneEnvelope<TModel> & {
  [SCENE_MARKER]: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function computeLineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function toLineColumn(lineStarts: number[], index: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1,
  };
}

function tryFindFeatureRange(code: string, featureId: string): SceneSourceRange | undefined {
  const lineStarts = computeLineStarts(code);
  const quotedId = `id: "${featureId}"`;
  const singleQuotedId = `id: '${featureId}'`;
  const idIndex = code.indexOf(quotedId) >= 0 ? code.indexOf(quotedId) : code.indexOf(singleQuotedId);
  if (idIndex < 0) return undefined;

  const objectStart = code.lastIndexOf("{", idIndex);
  const objectEnd = code.indexOf("}", idIndex);
  if (objectStart < 0 || objectEnd < 0 || objectEnd < objectStart) return undefined;

  const start = toLineColumn(lineStarts, objectStart);
  const end = toLineColumn(lineStarts, objectEnd + 1);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function resolveSceneParams(
  sceneParams: SceneParamsShape | undefined,
  paramOverrides: Map<string, number> | undefined,
): { resolved: Record<string, number | string | boolean>; diagnostics: SceneDiagnostic[] } {
  if (!sceneParams) {
    return { resolved: {}, diagnostics: [] };
  }

  const resolved: Record<string, number | string | boolean> = {};
  const diagnostics: SceneDiagnostic[] = [];

  for (const [name, definition] of Object.entries(sceneParams)) {
    if (!isRecord(definition) || !("value" in definition)) {
      diagnostics.push({
        code: "scene.invalid-envelope",
        stage: "type-level",
        severity: "error",
        message: `Scene param "${name}" must be declared as { value: ... }.`,
      });
      continue;
    }

    const baseValue = definition.value;
    if (typeof baseValue === "number" && paramOverrides?.has(name)) {
      resolved[name] = paramOverrides.get(name) as number;
    } else if (typeof baseValue === "number" || typeof baseValue === "string" || typeof baseValue === "boolean") {
      resolved[name] = baseValue;
    } else {
      diagnostics.push({
        code: "scene.invalid-envelope",
        stage: "type-level",
        severity: "error",
        message: `Scene param "${name}" only supports number/string/boolean values.`,
      });
    }
  }

  return { resolved, diagnostics };
}

function toValidatorSpec(validator: SceneValidator, index: number): SceneValidatorSpec {
  if (typeof validator === "function") {
    return {
      id: `validator.${index + 1}`,
      stage: "semantic",
      run: validator,
    };
  }

  return {
    id: validator.id,
    stage: validator.stage ?? "semantic",
    run: validator.run,
  };
}

function summarizeDiagnostics(diagnostics: SceneDiagnostic[]): SceneValidationReport["summary"] {
  const errorCount = diagnostics.filter((diag) => diag.severity === "error").length;
  const warningCount = diagnostics.filter((diag) => diag.severity === "warning").length;
  return {
    errorCount,
    warningCount,
    validatorFailures: diagnostics.filter((diag) => diag.code === "scene.validator.failed").length,
    testFailures: diagnostics.filter((diag) => diag.code === "scene.test.failed").length,
  };
}

function runSceneSemanticValidators(
  params: Record<string, number | string | boolean>,
  features: readonly NormalizedSceneFeature[],
  validators: readonly SceneValidator[] | undefined,
): { diagnostics: SceneDiagnostic[]; validatorResults: SceneRuleResult[] } {
  if (!validators || validators.length === 0) {
    return { diagnostics: [], validatorResults: [] };
  }

  const diagnostics: SceneDiagnostic[] = [];
  const validatorResults: SceneRuleResult[] = [];

  validators
    .map(toValidatorSpec)
    .filter((validator) => validator.stage === "semantic")
    .forEach((validator) => {
      const message = validator.run({ params, features, bodies: [] });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.validator.failed",
          stage: "semantic",
          severity: "error",
          message,
          validatorId: validator.id,
        });
        validatorResults.push({
          id: validator.id,
          stage: "semantic",
          status: "fail",
          message,
        });
      } else {
        validatorResults.push({
          id: validator.id,
          stage: "semantic",
          status: "pass",
        });
      }
    });

  return { diagnostics, validatorResults };
}

export function runScenePostModelValidation(input: {
  scene: NormalizedScene;
  validators?: readonly SceneValidator<any>[];
  tests?: readonly SceneTest<any>[];
  bodies: Body[];
}): SceneValidationReport {
  const diagnostics: SceneDiagnostic[] = [...input.scene.validation.diagnostics];
  const validators: SceneRuleResult[] = [...input.scene.validation.validators];
  const tests: SceneRuleResult[] = [];

  if (input.bodies.length === 0) {
    diagnostics.push({
      code: "scene.geometry.empty",
      stage: "geometry",
      severity: "error",
      message: "Scene model did not produce any geometry.",
    });
  }

  if (input.bodies.length > 1) {
    diagnostics.push({
      code: "scene.geometry.disconnected-parts",
      stage: "geometry",
      severity: "warning",
      message: "Scene produced multiple disconnected bodies. Prefer assembly semantics for multi-part scenes.",
    });
  }

  for (let i = 0; i < input.bodies.length; i += 1) {
    const body = input.bodies[i];
    if (body.mesh.positions.length === 0 || body.mesh.indices.length === 0) {
      diagnostics.push({
        code: "scene.geometry.empty",
        stage: "geometry",
        severity: "error",
        message: `Body ${i + 1} contains empty geometry buffers.`,
        featureId: body.name ? `body:${body.name}` : `body:${i + 1}`,
      });
    }
  }

  if (input.validators) {
    input.validators
      .map(toValidatorSpec)
      .filter((validator) => validator.stage === "geometry")
      .forEach((validator) => {
        const message = validator.run({
          params: input.scene.params,
          features: input.scene.features,
          bodies: input.bodies,
        });
        if (typeof message === "string" && message.trim().length > 0) {
          diagnostics.push({
            code: "scene.validator.failed",
            stage: "geometry",
            severity: "error",
            message,
            validatorId: validator.id,
          });
          validators.push({
            id: validator.id,
            stage: "geometry",
            status: "fail",
            message,
          });
        } else {
          validators.push({
            id: validator.id,
            stage: "geometry",
            status: "pass",
          });
        }
      });
  }

  if (input.tests) {
    input.tests.forEach((test) => {
      const message = test.run({
        params: input.scene.params,
        features: input.scene.features,
        bodies: input.bodies,
      });
      if (typeof message === "string" && message.trim().length > 0) {
        diagnostics.push({
          code: "scene.test.failed",
          stage: "tests",
          severity: "error",
          message,
          testId: test.id,
        });
        tests.push({
          id: test.id,
          stage: "tests",
          status: "fail",
          message,
        });
      } else {
        tests.push({
          id: test.id,
          stage: "tests",
          status: "pass",
        });
      }
    });
  }

  return {
    diagnostics,
    validators,
    tests,
    summary: summarizeDiagnostics(diagnostics),
  };
}

export function defineScene<TModel, TParams extends SceneParamsShape | undefined = undefined>(
  scene: SceneEnvelope<TModel, TParams>,
): SceneEnvelope<TModel, TParams> {
  return Object.freeze({ ...scene, [SCENE_MARKER]: true }) as SceneEnvelope<TModel, TParams>;
}

export function isSceneEnvelope(value: unknown): value is SceneEnvelopeInternal {
  return isRecord(value) && (value as SceneEnvelopeInternal)[SCENE_MARKER] === true;
}

export function normalizeScene(
  code: string,
  value: unknown,
  paramOverrides?: Map<string, number>,
): {
  scene?: NormalizedScene;
  diagnostics: SceneDiagnostic[];
  rawHooks?: {
    validators?: readonly SceneValidator[];
    tests?: readonly SceneTest[];
  };
} {
  if (!isSceneEnvelope(value)) {
    return { diagnostics: [] };
  }

  const diagnostics: SceneDiagnostic[] = [];
  const scene = value;

  if (!Array.isArray(scene.features)) {
    diagnostics.push({
      code: "scene.invalid-envelope",
      stage: "type-level",
      severity: "error",
      message: "defineScene() requires a features array.",
    });
    return { diagnostics };
  }

  const { resolved: resolvedParams, diagnostics: paramDiagnostics } = resolveSceneParams(scene.params, paramOverrides);
  diagnostics.push(...paramDiagnostics);

  const features: NormalizedSceneFeature[] = [];
  const seenIds = new Set<string>();
  for (const feature of scene.features) {
    if (!isRecord(feature) || typeof feature.kind !== "string") {
      diagnostics.push({
        code: "scene.invalid-envelope",
        stage: "type-level",
        severity: "error",
        message: "Scene features must be objects with a string kind.",
      });
      continue;
    }

    if (typeof feature.id !== "string" || feature.id.trim().length === 0) {
      diagnostics.push({
        code: "scene.feature-id.missing",
        stage: "type-level",
        severity: "error",
        message: `Feature kind "${feature.kind}" is missing a stable string id.`,
      });
      continue;
    }

    const featureId = feature.id.trim();
    if (seenIds.has(featureId)) {
      diagnostics.push({
        code: "scene.feature-id.duplicate",
        stage: "type-level",
        severity: "error",
        featureId,
        message: `Feature id "${featureId}" must be unique.`,
        range: tryFindFeatureRange(code, featureId),
      });
      continue;
    }

    seenIds.add(featureId);
    features.push({
      id: featureId,
      kind: feature.kind,
      label: typeof feature.label === "string" ? feature.label : undefined,
      refs: Array.isArray(feature.refs)
        ? feature.refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
        : undefined,
      range: tryFindFeatureRange(code, featureId),
    });
  }

  for (const feature of features) {
    if (!feature.refs) continue;
    for (const ref of feature.refs) {
      if (!seenIds.has(ref)) {
        diagnostics.push({
          code: "scene.feature-ref.invalid",
          stage: "semantic",
          severity: "error",
          featureId: feature.id,
          message: `Feature "${feature.id}" references unknown feature id "${ref}".`,
          range: feature.range,
        });
      }
    }
  }

  const semanticHooks = runSceneSemanticValidators(resolvedParams, features, scene.validators);
  diagnostics.push(...semanticHooks.diagnostics);

  const sceneModel = typeof scene.model === "function"
    ? (scene.model as (context: { params: Record<string, number | string | boolean> }) => unknown)({ params: resolvedParams })
    : scene.model;

  const validation: SceneValidationReport = {
    diagnostics,
    validators: semanticHooks.validatorResults,
    tests: [],
    summary: summarizeDiagnostics(diagnostics),
  };

  return {
    scene: {
      meta: scene.meta,
      model: sceneModel,
      params: resolvedParams,
      features,
      validation,
    },
    diagnostics,
    rawHooks: {
      validators: scene.validators,
      tests: scene.tests,
    },
  };
}
